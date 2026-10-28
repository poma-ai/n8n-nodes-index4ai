import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import {
	apiError,
	apiRequest,
	errorText,
	isSuccess,
	mapErrorCode,
	retryAfterSeconds,
	type ApiResponse,
} from './request';

export type JobState = 'pending' | 'processing' | 'indexing' | 'done' | 'failed' | 'blocked';

export interface JobStatus {
	job_id: string;
	status: JobState;
	code?: number;
	detail?: unknown;
	grill?: { deduplicated?: boolean; doc_id?: string };
	[key: string]: unknown;
}

export const TERMINAL_STATES: JobState[] = ['done', 'failed', 'blocked'];

const FIRST_POLL_MS = 2000;
const POLL_INTERVAL_MS = 5000;

export function isTerminal(status: JobStatus): boolean {
	return TERMINAL_STATES.includes(status.status);
}

/**
 * Submits a request that creates a job, pacing on 429 until the deadline.
 * Returns the response of the final attempt; the caller checks success.
 */
export async function submitWithPacing(
	this: IExecuteFunctions,
	send: () => Promise<ApiResponse>,
	deadline: number,
): Promise<ApiResponse> {
	for (;;) {
		const response = await send();
		if (response.statusCode !== 429) return response;
		const waitMs = retryAfterSeconds(response) * 1000;
		if (Date.now() + waitMs > deadline) return response;
		await sleep(waitMs);
	}
}

/** The shape every ingest item ends up with, whether it waited or not. */
export interface IngestOutcome {
	jobId: string;
	docId: string | null;
	status: JobState | 'timeout';
	deduplicated: boolean | null;
	code?: number;
	detail?: unknown;
}

/**
 * Flattens a status response. `docId` exists only once the job is done: it is
 * the dedup target when index4.ai reports one, otherwise the job ID itself.
 */
export function outcomeFromStatus(status: JobStatus): IngestOutcome {
	const grill = status.grill;
	const done = status.status === 'done';
	return {
		jobId: status.job_id,
		docId: done ? grill?.doc_id || status.job_id : null,
		status: status.status,
		deduplicated: typeof grill?.deduplicated === 'boolean' ? grill.deduplicated : null,
		...(!done && status.code !== undefined ? { code: status.code } : {}),
		...(status.detail !== undefined ? { detail: status.detail } : {}),
	};
}

/**
 * Throws the error a failed or blocked job deserves. The job's `code` mirrors
 * an HTTP status, so it goes through the same mapping as HTTP responses.
 */
export function failedJobError(
	this: IExecuteFunctions,
	status: JobStatus,
	itemIndex: number,
): NodeOperationError {
	const code = typeof status.code === 'number' ? status.code : status.status === 'blocked' ? 403 : 500;
	const { text, reason } = errorText(status.detail);
	const detail =
		text ||
		(status.detail === undefined || typeof status.detail === 'string'
			? ''
			: JSON.stringify(status.detail));
	// 401, 404 and 429 on a job describe the document's source, not this request:
	// the HTTP-route wording ("check the job ID", "the key was rejected") would mislead.
	const mapped = [401, 404, 429].includes(code)
		? {
				message: `index4.ai could not process the document (code ${code})`,
				description: 'The source could not be fetched or read. Check the URL or file and try again',
			}
		: mapErrorCode(code, detail, reason);
	const said = detail && !mapped.message.includes(detail) ? ` index4.ai said: ${detail}.` : '';
	return new NodeOperationError(this.getNode(), mapped.message, {
		description: `${mapped.description} (job ${status.job_id}).${said}`,
		itemIndex,
	});
}

export function timeoutError(
	this: IExecuteFunctions,
	jobId: string,
	itemIndex: number,
	lastProblem?: string,
): NodeOperationError {
	const cause = lastProblem ? ` The last status check did not get an answer: ${lastProblem}.` : '';
	return new NodeOperationError(this.getNode(), `Timed out waiting for index4.ai job ${jobId}`, {
		description: `Raise 'Timeout (Seconds)', or check the job later with Job > Get Status using this job ID.${cause}`,
		itemIndex,
	});
}

export interface PendingJob {
	itemIndex: number;
	jobId: string;
	status?: JobStatus;
	/** Set when a status call answered with a non-transient failure (401, 403, 404, ...). */
	error?: NodeApiError;
	/** The most recent transient failure, kept so a timeout can say why polling got nowhere. */
	lastProblem?: string;
}

function isOpen(job: PendingJob): boolean {
	return job.error === undefined && (job.status === undefined || !isTerminal(job.status));
}

/**
 * Polls every open job, one request at a time, in rounds, until each job is
 * terminal or the deadline passes. After the deadline one final round runs so
 * jobs that finished during the submit phase are not reported as timed out.
 *
 * A transient answer (5xx, or a request that failed before an answer) leaves
 * the job open for the next round. A non-transient failure is recorded on the
 * job so the caller can report it per item; it never aborts the other jobs.
 */
export async function pollJobs(
	this: IExecuteFunctions,
	jobs: PendingJob[],
	deadline: number,
): Promise<void> {
	const open = () => jobs.filter(isOpen);
	if (open().length === 0) return;

	const remainingMs = () => Math.max(0, deadline - Date.now());
	let finalRound = remainingMs() === 0;
	if (!finalRound) await sleep(Math.min(FIRST_POLL_MS, remainingMs()));

	for (;;) {
		for (const job of open()) {
			let response: ApiResponse;
			try {
				response = await apiRequest.call(
					this,
					'GET',
					`/jobs/${encodeURIComponent(job.jobId)}/status`,
				);
			} catch (problem) {
				job.lastProblem = (problem as Error).message; // no answer at all: try again next round
				continue;
			}
			if (response.statusCode === 429) {
				await sleep(Math.min(retryAfterSeconds(response) * 1000, remainingMs()));
				continue;
			}
			if (response.statusCode >= 500) {
				job.lastProblem = `status ${response.statusCode}`;
				continue;
			}
			if (!isSuccess(response)) {
				job.error = apiError.call(this, response, job.itemIndex);
				continue;
			}
			job.status = response.body as JobStatus;
		}
		if (open().length === 0 || finalRound) return;
		if (remainingMs() === 0) {
			finalRound = true;
			continue;
		}
		await sleep(Math.min(POLL_INTERVAL_MS, remainingMs()));
		if (remainingMs() === 0) finalRound = true;
	}
}
