import type { INodeProperties } from 'n8n-workflow';

import { documentLocator, documentOutputFields, outputModeProperties } from './shared';

const show = { resource: ['document'] };

export const documentOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'ingest',
		displayOptions: { show },
		options: [
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete document',
				description: 'Delete a document and its index entries from the project',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get document',
				description: 'Get the metadata of one document',
			},
			{
				name: 'Get Many',
				value: 'getMany',
				action: 'Get many documents',
				description: 'List the documents in the project',
			},
			{
				name: 'Ingest',
				value: 'ingest',
				action: 'Ingest document',
				description: 'Upload a file or URL so index4.ai converts, chunks and indexes it for search',
			},
		],
	},
];

export const documentFields: INodeProperties[] = [
	// ---------- Ingest ----------
	{
		displayName: 'Source',
		name: 'source',
		type: 'options',
		default: 'binary',
		description: 'Where the document comes from',
		displayOptions: { show: { ...show, operation: ['ingest'] } },
		options: [
			{ name: 'Binary File', value: 'binary', description: 'A file in the binary data of the item' },
			{ name: 'URL', value: 'url', description: 'A publicly reachable URL index4.ai fetches itself' },
		],
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		description: 'The name of the binary field that holds the file',
		hint: 'The file name and type are taken from the binary data',
		displayOptions: { show: { ...show, operation: ['ingest'], source: ['binary'] } },
	},
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. https://example.com/report.pdf',
		description: 'The URL of the document to ingest',
		displayOptions: { show: { ...show, operation: ['ingest'], source: ['url'] } },
	},
	{
		displayName: 'Wait for Indexing',
		name: 'wait',
		type: 'boolean',
		default: true,
		description:
			'Whether to wait until the document is indexed and searchable before returning. If off, returns the job ID right away.',
		displayOptions: { show: { ...show, operation: ['ingest'] } },
	},
	{
		displayName: 'Timeout (Seconds)',
		name: 'timeout',
		type: 'number',
		default: 600,
		typeOptions: { minValue: 1 },
		description:
			'How long the node waits in total for indexing to finish, and for a job slot to become free, across all input items',
		displayOptions: { show: { ...show, operation: ['ingest'] } },
	},
	{
		displayName: 'Options',
		name: 'ingestOptions',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { ...show, operation: ['ingest'] } },
		options: [
			{
				displayName: 'Attributes',
				name: 'attributes',
				type: 'json',
				default: '{}',
				placeholder: 'e.g. {"region":"emea","revision":12}',
				description:
					'Typed attributes stored with the document for filtering at search time. Names must match ^[a-z0-9_]{1,64}$ and are permanent once used. Limited to 2048 characters.',
			},
			{
				displayName: 'Canonical URL',
				name: 'canonicalUrl',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://example.com/docs/report.pdf',
				description: 'Citation URL returned with search results that cite this document',
			},
		],
	},

	// ---------- Get, Delete ----------
	{
		...documentLocator('The document to get'),
		displayOptions: { show: { ...show, operation: ['get'] } },
	},
	{
		...documentLocator('The document to delete'),
		displayOptions: { show: { ...show, operation: ['delete'] } },
	},

	// ---------- Get Many ----------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { ...show, operation: ['getMany'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: { show: { ...show, operation: ['getMany'], returnAll: [false] } },
	},

	// ---------- Output modes for Get and Get Many ----------
	...outputModeProperties(documentOutputFields, { ...show, operation: ['get', 'getMany'] }),
];
