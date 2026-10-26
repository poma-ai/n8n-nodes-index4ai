import type { INodeProperties } from 'n8n-workflow';

const show = { resource: ['job'] };

export const jobOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'getStatus',
		displayOptions: { show },
		options: [
			{
				name: 'Get Status',
				value: 'getStatus',
				action: 'Get job status',
				description: 'Get the state of an ingest job started with waiting switched off',
			},
		],
	},
];

export const jobFields: INodeProperties[] = [
	{
		displayName: 'Job ID',
		name: 'jobId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 550e8400-e29b-41d4-a716-446655440000',
		description: 'The job ID returned by Document > Ingest',
		displayOptions: { show: { ...show, operation: ['getStatus'] } },
	},
];
