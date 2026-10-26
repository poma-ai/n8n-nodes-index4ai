import type { IDataObject } from 'n8n-workflow';

export type OutputMode = 'simplified' | 'raw' | 'selected';

/** Fields a simplified document record keeps, in the order shown. */
export const DOCUMENT_SIMPLIFIED_FIELDS = [
	'doc_id',
	'title',
	'filename',
	'pages',
	'chunkset_count',
	'ingested_at',
	'canonical_url',
	'attributes',
];

/** Fields a simplified structured search result keeps. */
export const SEARCH_RESULT_SIMPLIFIED_FIELDS = [
	'doc_id',
	'title',
	'content',
	'pages',
	'canonical_url',
	'score',
];

/** Every field of a document record, for the "Selected Fields" picker. */
export const DOCUMENT_FIELDS = [
	'doc_id',
	'title',
	'language',
	'filename',
	'canonical_url',
	'pages',
	'chunkset_count',
	'chunk_count',
	'image_count',
	'table_count',
	'ingested_at',
	'source_job_id',
	'attributes',
	'meta_tags',
	'attribute_schema',
	'bm25_state',
];

/** "canonical_url" becomes "Canonical URL", "doc_id" becomes "Doc ID", for dropdown labels. */
export function fieldLabel(field: string): string {
	return field
		.split('_')
		.map((part) =>
			part === 'id' || part === 'url' || part === 'bm25'
				? part.toUpperCase()
				: part.charAt(0).toUpperCase() + part.slice(1),
		)
		.join(' ');
}

/** Every field of a structured search result, for the "Selected Fields" picker. */
export const SEARCH_RESULT_FIELDS = [
	'doc_id',
	'chunkset_index',
	'content',
	'to_embed',
	'pages',
	'chunk_indices',
	'title',
	'canonical_url',
	'score',
	'scores',
	'assets',
	'page_images',
];

/**
 * Applies an Output mode to one record. Simplified keeps a fixed subset,
 * Selected keeps what the user picked plus the record ID, Raw keeps everything.
 */
export function applyOutputMode(
	record: IDataObject,
	mode: OutputMode,
	simplifiedFields: string[],
	selectedFields: string[],
	idField = 'doc_id',
): IDataObject {
	if (mode === 'raw') return record;
	const keep = mode === 'simplified' ? simplifiedFields : [idField, ...selectedFields];
	const result: IDataObject = {};
	for (const field of keep) {
		if (field in record) result[field] = record[field];
	}
	return result;
}
