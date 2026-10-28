import type {
	IAuthenticate,
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
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
				'A project API key (starts with poma_proj_) or an account API key from console.index4.ai. A project key is bound to one project; an account key can address any of your projects.',
		},
		{
			displayName: 'Project ID',
			name: 'projectId',
			type: 'string',
			default: '',
			placeholder: 'e.g. 550e8400-e29b-41d4-a716-446655440000',
			description:
				"The project to use with an account API key. Leave empty to use the account's default index4.ai project. Leave empty with a project key, which already identifies its project.",
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'hidden',
			default: 'https://api.index4.ai/v1',
		},
	];

	// A function rather than a generic headers block, so X-Project-ID is only
	// sent when a project ID is set: an empty header would be rejected as an
	// invalid UUID.
	authenticate: IAuthenticate = async (
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> => {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${String(credentials.apiKey ?? '').trim()}`,
		};
		const projectId = String(credentials.projectId ?? '').trim();
		if (projectId) headers['X-Project-ID'] = projectId;
		return {
			...requestOptions,
			headers: {
				...(requestOptions.headers as Record<string, string> | undefined),
				...headers,
			},
		};
	};

	// GET /docs accepts login tokens, account keys and project keys, so one
	// request tests every key kind. A key for a PrimeCut project answers 403
	// "API key not valid for this product" (observed 2026-10-28); an unknown
	// key answers 401; an account key without a usable project answers 400.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/docs',
			method: 'GET',
			qs: { limit: 1 },
		},
		rules: [
			{
				type: 'responseCode',
				properties: {
					value: 403,
					message: 'This key is for a different product. Use an index4.ai key: a project key for an index4.ai project, or an account key.',
				},
			},
			{
				type: 'responseCode',
				properties: { value: 401, message: 'The API key was rejected. Check it in the console.' },
			},
		],
	};
}
