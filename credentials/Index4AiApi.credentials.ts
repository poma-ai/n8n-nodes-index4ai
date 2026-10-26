import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class Index4AiApi implements ICredentialType {
	name = 'index4AiApi';

	displayName = 'index4.ai API';

	documentationUrl = 'https://github.com/poma-ai/n8n-nodes-index4ai#credentials';

	icon: Icon = { light: 'file:index4ai.svg', dark: 'file:index4ai.dark.svg' };

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'A project API key (starts with poma_proj_) created at console.index4.ai for a project with the index4.ai product. Account keys are not supported yet.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'hidden',
			default: 'https://api.index4.ai/v1',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/projects/info',
			method: 'GET',
		},
		rules: [
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'product',
					value: 'primecut',
					message:
						'This key belongs to a PrimeCut project. Create an index4.ai project key at console.index4.ai.',
				},
			},
		],
	};
}
