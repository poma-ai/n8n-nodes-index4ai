import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchItems,
	INodeListSearchResult,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError, sleep } from 'n8n-workflow';

import { documentFields, documentOperations } from './descriptions/DocumentDescription';
import { jobFields, jobOperations } from './descriptions/JobDescription';
import { searchFields, searchOperations } from './descriptions/SearchDescription';
import {
	failedJobError,
	isTerminal,
	outcomeFromStatus,
	pollJobs,
	submitWithPacing,
	timeoutError,
	type JobStatus,
	type PendingJob,
} from './transport/jobs';
import {
	applyOutputMode,
	DOCUMENT_SIMPLIFIED_FIELDS,
	SEARCH_RESULT_SIMPLIFIED_FIELDS,
	type OutputMode,
} from './transport/output';
import {
	apiError,
	apiRequest,
	contentDisposition,
	hasRetryAfter,
	isSuccess,
	jsonHeaderValue,
	retryAfterSeconds,
	urlHeaderValue,
} from './transport/request';

interface IngestOptions {
	attributes?: string | IDataObject;
	canonicalUrl?: string;
}

interface SearchOptions {
	attributeFilters?: string | IDataObject[];
	docIds?: string;
	excludeDocIds?: string;
	maxTokens?: number;
	minRelevance?: number;
	returnAssets?: boolean;
	targetTokens?: number;
}

interface PublicJob {
	job_id: string;
	created_at?: string;
	status?: { status?: string };
}

interface ListDocsResponse {
	documents?: IDataObject[];
	has_more?: boolean;
	next_cursor?: string | null;
}

interface DocInfo extends IDataObject {
	doc_id: string;
	title?: string;
	filename?: string;
}

/** The API's maximum page size for GET /docs. */
const LIST_PAGE_SIZE = 500;
/** How many pages the document picker scans for a typed filter before giving up. */
const LIST_SEARCH_MAX_PAGES = 10;
/** Longest pause the node accepts from a Retry-After header on a search, in seconds. */
const SEARCH_RETRY_CAP_SECONDS = 30;

export class Index4Ai implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'index4.ai',
		name: 'index4Ai',
		icon: { light: 'file:index4ai.svg', dark: 'file:index4ai.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Search documents indexed in index4.ai and return the most relevant passages for a question. Also ingests, lists and deletes documents.',
		defaults: {
			name: 'index4.ai',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'index4AiApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				default: 'search',
				options: [
					{ name: 'Document', value: 'document' },
					{ name: 'Job', value: 'job' },
					{ name: 'Search', value: 'search' },
				],
			},
			...documentOperations,
			...documentFields,
			...searchOperations,
			...searchFields,
			...jobOperations,
			...jobFields,
		],
	};

	methods = {
		listSearch: {
			async getDocuments(
				this: ILoadOptionsFunctions,
				filter?: string,
				paginationToken?: string,
			): Promise<INodeListSearchResult> {
				const needle = filter?.trim().toLowerCase();
				const results: INodeListSearchItems[] = [];
				let cursor = paginationToken;
				let pages = 0;

				// Without a filter one page is one dropdown page. With a filter, keep
				// reading pages until something matches, so a document on page two is found.
				do {
					const qs: IDataObject = { limit: LIST_PAGE_SIZE };
					if (cursor) qs.cursor = cursor;
					const response = await apiRequest.call(this, 'GET', '/docs', { qs });
					if (!isSuccess(response)) throw apiError.call(this, response);
					const body = response.body as ListDocsResponse;
					pages++;
					for (const doc of (body.documents ?? []) as DocInfo[]) {
						const name = doc.title || doc.filename || doc.doc_id;
						const description = doc.filename && doc.title ? doc.filename : undefined;
						const matches =
							!needle ||
							name.toLowerCase().includes(needle) ||
							(description ?? '').toLowerCase().includes(needle) ||
							doc.doc_id.toLowerCase().includes(needle);
						if (matches) results.push({ name, value: doc.doc_id, description });
					}
					cursor = body.has_more && body.next_cursor ? body.next_cursor : undefined;
				} while (needle && results.length === 0 && cursor && pages < LIST_SEARCH_MAX_PAGES);

				return { results, paginationToken: cursor };
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const results: INodeExecutionData[][] = items.map(() => []);
		const pending: PendingJob[] = [];
		let deadline = 0;

		const push = (i: number, json: IDataObject) => {
			results[i].push({ json, pairedItem: { item: i } });
		};

		const fail = (i: number, error: unknown, extra: IDataObject = {}) => {
			const nodeError =
				error instanceof NodeApiError || error instanceof NodeOperationError
					? error
					: new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			if (this.continueOnFail()) {
				push(i, { error: nodeError.message, ...extra });
				return;
			}
			throw nodeError;
		};

		// Phase 1: every operation runs now; ingests that wait are only submitted.
		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				if (resource === 'document' && operation === 'ingest') {
					const wait = this.getNodeParameter('wait', i) as boolean;
					const timeout = this.getNodeParameter('timeout', i) as number;
					if (deadline === 0) deadline = Date.now() + Math.max(1, timeout) * 1000;

					const { label, ...request } = await buildIngestRequest.call(this, i);
					const response = await submitWithPacing.call(
						this,
						async () => await apiRequest.call(this, 'POST', '/ingest', request),
						deadline,
					);
					if (response.statusCode === 429) {
						throw new NodeOperationError(
							this.getNode(),
							`No job slot became free for '${label}' within the timeout`,
							{
								description:
									"Raise 'Timeout (Seconds)', run fewer executions at once, or wait for running jobs to finish",
								itemIndex: i,
							},
						);
					}
					if (!isSuccess(response)) throw apiError.call(this, response, i);
					const job = response.body as PublicJob;
					if (wait) {
						pending.push({ itemIndex: i, jobId: job.job_id });
					} else {
						push(i, {
							jobId: job.job_id,
							status: job.status?.status ?? 'pending',
							createdAt: job.created_at ?? null,
						});
					}
				} else if (resource === 'document' && operation === 'get') {
					const docId = getDocumentId.call(this, i);
					const response = await apiRequest.call(
						this,
						'GET',
						`/docs/${encodeURIComponent(docId)}`,
					);
					if (!isSuccess(response)) throw apiError.call(this, response, i);
					push(i, applyDocumentOutput.call(this, i, response.body as IDataObject));
				} else if (resource === 'document' && operation === 'getMany') {
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const limit = returnAll ? Infinity : (this.getNodeParameter('limit', i) as number);
					let cursor: string | undefined;
					let count = 0;
					do {
						const qs: IDataObject = { limit: Math.min(LIST_PAGE_SIZE, limit - count) };
						if (cursor) qs.cursor = cursor;
						const response = await apiRequest.call(this, 'GET', '/docs', { qs });
						if (!isSuccess(response)) throw apiError.call(this, response, i);
						const body = response.body as ListDocsResponse;
						for (const doc of body.documents ?? []) {
							if (count >= limit) break;
							push(i, applyDocumentOutput.call(this, i, doc));
							count++;
						}
						cursor = body.has_more && body.next_cursor ? body.next_cursor : undefined;
					} while (cursor && count < limit);
				} else if (resource === 'document' && operation === 'delete') {
					const docId = getDocumentId.call(this, i);
					const response = await apiRequest.call(
						this,
						'DELETE',
						`/docs/${encodeURIComponent(docId)}`,
					);
					if (!isSuccess(response)) throw apiError.call(this, response, i);
					push(i, { deleted: true });
				} else if (resource === 'search') {
					const body = buildSearchBody.call(this, i, operation);
					const endpoint = operation === 'searchInDoc' ? '/searchInDoc' : '/search';
					let response = await apiRequest.call(this, 'POST', endpoint, { body });
					if (response.statusCode === 503 && hasRetryAfter(response)) {
						await sleep(retryAfterSeconds(response, SEARCH_RETRY_CAP_SECONDS) * 1000);
						response = await apiRequest.call(this, 'POST', endpoint, { body });
					}
					if (!isSuccess(response)) throw apiError.call(this, response, i);
					const resultFormat = this.getNodeParameter('resultFormat', i) as string;
					if (resultFormat === 'structured') {
						const mode = this.getNodeParameter('output', i, 'simplified') as OutputMode;
						const fields = this.getNodeParameter('fields', i, []) as string[];
						const hits = ((response.body as IDataObject).results ?? []) as IDataObject[];
						for (const hit of hits) {
							push(i, applyOutputMode(hit, mode, SEARCH_RESULT_SIMPLIFIED_FIELDS, fields));
						}
					} else {
						push(i, response.body as IDataObject);
					}
				} else if (resource === 'job' && operation === 'getStatus') {
					const jobId = (this.getNodeParameter('jobId', i) as string).trim();
					if (!jobId) {
						throw new NodeOperationError(this.getNode(), "'Job ID' is empty", {
							description: 'Enter the job ID returned by Document > Ingest',
							itemIndex: i,
						});
					}
					const response = await apiRequest.call(
						this,
						'GET',
						`/jobs/${encodeURIComponent(jobId)}/status`,
					);
					if (!isSuccess(response)) throw apiError.call(this, response, i);
					push(i, outcomeFromStatus(response.body as JobStatus) as unknown as IDataObject);
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not supported for resource "${resource}"`,
						{ itemIndex: i },
					);
				}
			} catch (error) {
				fail(i, error);
			}
		}

		// Phase 2: wait for the submitted ingest jobs together, under one deadline.
		// pollJobs never throws for one job's sake; each job carries its own outcome.
		if (pending.length > 0) {
			await pollJobs.call(this, pending, deadline);
			for (const job of pending) {
				const i = job.itemIndex;
				if (job.error) {
					fail(i, job.error, { jobId: job.jobId });
					continue;
				}
				if (job.status === undefined || !isTerminal(job.status)) {
					fail(i, timeoutError.call(this, job.jobId, i, job.lastProblem), {
						jobId: job.jobId,
						status: 'timeout',
					});
					continue;
				}
				const outcome = outcomeFromStatus(job.status) as unknown as IDataObject;
				if (job.status.status === 'done') {
					push(i, outcome);
				} else {
					fail(i, failedJobError.call(this, job.status, i), outcome);
				}
			}
		}

		return [results.flat()];
	}
}

async function buildIngestRequest(
	this: IExecuteFunctions,
	i: number,
): Promise<{ body?: Buffer; headers: Record<string, string>; label: string }> {
	const source = this.getNodeParameter('source', i) as string;
	const options = this.getNodeParameter('ingestOptions', i, {}) as IngestOptions;
	const headers: Record<string, string> = {};
	let body: Buffer | undefined;
	let label: string;

	if (source === 'binary') {
		const propertyName = this.getNodeParameter('binaryPropertyName', i) as string;
		const binary = this.helpers.assertBinaryData(i, propertyName);
		body = await this.helpers.getBinaryDataBuffer(i, propertyName);
		const fileName = binary.fileName || 'document';
		label = fileName;
		// The API infers the format from the file name. The body is always raw bytes;
		// application/json would be read as a JSON job description instead.
		headers['Content-Type'] = 'application/octet-stream';
		headers['Content-Disposition'] = contentDisposition(fileName);
	} else {
		const url = (this.getNodeParameter('url', i) as string).trim();
		if (!url) {
			throw new NodeOperationError(this.getNode(), "'URL' is empty", {
				description: 'Enter the public URL of the document to ingest',
				itemIndex: i,
			});
		}
		headers['X-Remote-URL'] = urlHeaderValue(url);
		label = url;
	}

	if (options.canonicalUrl) headers['X-Canonical-URL'] = urlHeaderValue(options.canonicalUrl);

	const attributes = parseJsonObjectParameter.call(this, options.attributes, 'Attributes', i);
	if (attributes && Object.keys(attributes).length > 0) {
		headers['X-Attributes'] = jsonHeaderValue(attributes);
	}

	return { body, headers, label };
}

function buildSearchBody(this: IExecuteFunctions, i: number, operation: string): IDataObject {
	const query = (this.getNodeParameter('query', i) as string).trim();
	if (!query) {
		throw new NodeOperationError(this.getNode(), "'Query' is empty", {
			description: 'Enter the question or search text',
			itemIndex: i,
		});
	}
	const resultFormat = this.getNodeParameter('resultFormat', i) as string;
	const options = this.getNodeParameter('searchOptions', i, {}) as SearchOptions;

	const body: IDataObject = {
		query,
		format: resultFormat === 'structured' ? 'json' : 'prompt_ready',
	};

	if (operation === 'searchInDoc') {
		body.doc_filter = getDocumentId.call(this, i);
	} else {
		const docIds = splitIds(options.docIds);
		const excludeDocIds = splitIds(options.excludeDocIds);
		if (docIds.length > 0) body.doc_ids = docIds;
		if (excludeDocIds.length > 0) body.exclude_doc_ids = excludeDocIds;
	}

	if (typeof options.minRelevance === 'number') body.min_relevance = options.minRelevance;
	if (typeof options.targetTokens === 'number') body.target_tokens = options.targetTokens;
	if (typeof options.maxTokens === 'number') body.max_tokens = options.maxTokens;
	if (options.returnAssets) body.return_assets = true;

	const attributeFilters = parseFilterClauses.call(this, options.attributeFilters, i);
	if (attributeFilters.length > 0) body.attribute_filters = attributeFilters;

	return body;
}

/** The document ID from the resource locator, rejecting an empty value before it turns into a list call. */
function getDocumentId(this: IExecuteFunctions, i: number): string {
	const raw = this.getNodeParameter('document', i, undefined, { extractValue: true });
	const docId = typeof raw === 'string' ? raw.trim() : '';
	if (!docId) {
		throw new NodeOperationError(this.getNode(), "'Document' is empty", {
			description: 'Pick a document from the list or enter its ID',
			itemIndex: i,
		});
	}
	return docId;
}

function applyDocumentOutput(this: IExecuteFunctions, i: number, doc: IDataObject): IDataObject {
	const mode = this.getNodeParameter('output', i, 'simplified') as OutputMode;
	const fields = this.getNodeParameter('fields', i, []) as string[];
	return applyOutputMode(doc, mode, DOCUMENT_SIMPLIFIED_FIELDS, fields);
}

function parseJsonValue(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	try {
		return JSON.parse(trimmed) as unknown;
	} catch {
		return Symbol('invalid');
	}
}

function parseJsonObjectParameter(
	this: IExecuteFunctions,
	value: unknown,
	displayName: string,
	i: number,
): IDataObject | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const parsed = parseJsonValue(value);
	if (parsed === undefined) return undefined;
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new NodeOperationError(this.getNode(), `'${displayName}' is not a JSON object`, {
			description: 'Enter a JSON object such as {"region": "emea"}',
			itemIndex: i,
		});
	}
	return parsed as IDataObject;
}

/**
 * Attribute filters are a JSON array of clauses, each with `attr` and `op` and
 * usually a `value`. Clauses combine with AND.
 */
function parseFilterClauses(this: IExecuteFunctions, value: unknown, i: number): IDataObject[] {
	if (value === undefined || value === null || value === '') return [];
	const parsed = parseJsonValue(value);
	if (parsed === undefined) return [];
	const reject = (why: string) =>
		new NodeOperationError(this.getNode(), `'Attribute Filters' ${why}`, {
			description:
				'Enter a JSON array of clauses such as [{"attr": "region", "op": "eq", "value": "emea"}]',
			itemIndex: i,
		});
	if (!Array.isArray(parsed)) throw reject('is not a JSON array');
	for (const clause of parsed) {
		if (
			clause === null ||
			typeof clause !== 'object' ||
			typeof (clause as IDataObject).attr !== 'string' ||
			typeof (clause as IDataObject).op !== 'string'
		) {
			throw reject("has a clause without 'attr' and 'op'");
		}
	}
	return parsed as IDataObject[];
}

function splitIds(value: string | undefined): string[] {
	return (value ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter((id) => id.length > 0);
}
