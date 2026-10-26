import type { INodeProperties } from 'n8n-workflow';

import { documentLocator, outputModeProperties, searchResultOutputFields } from './shared';

const show = { resource: ['search'] };

export const searchOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'search',
		displayOptions: { show },
		options: [
			{
				name: 'Search',
				value: 'search',
				action: 'Search documents',
				description: 'Find the passages across the project that best answer a question',
			},
			{
				name: 'Search in Document',
				value: 'searchInDoc',
				action: 'Search in document',
				description: 'Find the passages inside one document that best answer a question',
			},
		],
	},
];

const sharedOptions: INodeProperties[] = [
	{
		displayName: 'Attribute Filters',
		name: 'attributeFilters',
		type: 'json',
		default: '[]',
		placeholder: 'e.g. [{"attr": "region", "op": "eq", "value": "emea"}]',
		description:
			'JSON array of filter clauses on the typed attributes stored at ingest time. Each clause has \'attr\', \'op\' (eq, ne, in, nin, lt, lte, gt, gte, glob, contains, ...) and \'value\'. Clauses combine with AND.',
	},
	{
		displayName: 'Maximum Tokens',
		name: 'maxTokens',
		type: 'number',
		default: 15000,
		typeOptions: { minValue: 100, maxValue: 500000 },
		description: 'Hard ceiling on the size of the answer in tokens',
	},
	{
		displayName: 'Minimum Relevance',
		name: 'minRelevance',
		type: 'number',
		default: 0.3,
		typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
		description: 'Hits scoring below this relevance (0 to 1) are left out. The backend default is about 0.3.',
	},
	{
		displayName: 'Return Assets',
		name: 'returnAssets',
		type: 'boolean',
		default: false,
		description: 'Whether to include extracted figures and tables referenced by the results',
	},
	{
		displayName: 'Target Tokens',
		name: 'targetTokens',
		type: 'number',
		default: 5000,
		typeOptions: { minValue: 100, maxValue: 500000 },
		description: 'Typical size of the answer in tokens. The response is built best-first up to this budget.',
	},
];

const searchOnlyOptions: INodeProperties[] = [
	{
		displayName: 'Document IDs',
		name: 'docIds',
		type: 'string',
		default: '',
		placeholder: 'e.g. id1, id2',
		description: 'Comma-separated document IDs to restrict the search to',
	},
	{
		displayName: 'Exclude Document IDs',
		name: 'excludeDocIds',
		type: 'string',
		default: '',
		placeholder: 'e.g. id1, id2',
		description: 'Comma-separated document IDs to leave out',
	},
];

const searchOptionsSorted: INodeProperties[] = [...sharedOptions, ...searchOnlyOptions].sort((a, b) =>
	a.displayName.localeCompare(b.displayName),
);

export const searchFields: INodeProperties[] = [
	{
		...documentLocator('The document to search in'),
		displayOptions: { show: { ...show, operation: ['searchInDoc'] } },
	},
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. What were the Q3 liquidity ratios?',
		description: 'The question or search text, in natural language',
		displayOptions: { show },
	},
	{
		displayName: 'Result Format',
		name: 'resultFormat',
		type: 'options',
		default: 'promptReady',
		description: 'How the results come back',
		displayOptions: { show },
		options: [
			{
				name: 'Prompt-Ready Text',
				value: 'promptReady',
				description: 'One item with a rendered context block, ready to hand to a model',
			},
			{
				name: 'Structured Results',
				value: 'structured',
				description: 'One item per matching document with its passages and score',
			},
		],
	},
	...outputModeProperties(searchResultOutputFields, { ...show, resultFormat: ['structured'] }),
	{
		displayName: 'Options',
		name: 'searchOptions',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { ...show, operation: ['search'] } },
		options: searchOptionsSorted,
	},
	{
		displayName: 'Options',
		name: 'searchOptions',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { ...show, operation: ['searchInDoc'] } },
		options: sharedOptions,
	},
];
