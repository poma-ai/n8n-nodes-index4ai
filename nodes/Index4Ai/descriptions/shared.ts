import type { INodeProperties } from 'n8n-workflow';

import { DOCUMENT_FIELDS, fieldLabel, SEARCH_RESULT_FIELDS } from '../transport/output';

/** Resource locator for a document: pick from the project's documents or paste an ID. */
export function documentLocator(description: string): INodeProperties {
	return {
		displayName: 'Document',
		name: 'document',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description,
		modes: [
			{
				displayName: 'From list',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'getDocuments',
					searchable: true,
				},
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 550e8400-e29b-41d4-a716-446655440000',
			},
		],
	};
}

export function outputModeProperties(
	fieldList: string[],
	show: Record<string, string[]>,
): INodeProperties[] {
	return [
		{
			displayName: 'Output',
			name: 'output',
			type: 'options',
			default: 'simplified',
			description: 'Which fields to return for each record',
			options: [
				{
					name: 'Simplified',
					value: 'simplified',
					description: 'The most useful fields only',
				},
				{
					name: 'Raw',
					value: 'raw',
					description: 'Every field the API returns',
				},
				{
					name: 'Selected Fields',
					value: 'selected',
					description: 'Only the fields chosen below, plus the ID',
				},
			],
			displayOptions: { show },
		},
		{
			displayName: 'Fields',
			name: 'fields',
			type: 'multiOptions',
			default: [],
			description: 'Fields to include in each record. The ID is always included.',
			options: fieldList.map((field) => ({ name: fieldLabel(field), value: field })),
			displayOptions: { show: { ...show, output: ['selected'] } },
		},
	];
}

export const documentOutputFields = DOCUMENT_FIELDS;
export const searchResultOutputFields = SEARCH_RESULT_FIELDS;
