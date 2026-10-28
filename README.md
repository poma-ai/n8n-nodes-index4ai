# n8n-nodes-index4ai

An [n8n](https://n8n.io) community node for [index4.ai](https://index4.ai), the hosted retrieval layer from POMA AI. Ingest documents, and let workflows and AI Agents search them with hybrid retrieval that returns prompt-ready context.


## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n docs. The package name is `n8n-nodes-index4ai`.

## Credentials

Create an API key at [console.index4.ai](https://console.index4.ai), then add an **index4.ai API** credential in n8n:

| Key kind | API Key | Project ID |
|----------|---------|------------|
| Project key (`poma_proj_…`), bound to one project | the key | leave empty |
| Account key, can address any of your projects | the key | the project to use, or empty for the account's default index4.ai project |

The node sends the key as a Bearer token and, when Project ID is set, an `X-Project-ID` header. The credential test lists one document (`GET /docs?limit=1`), which every key kind can do; a key for a PrimeCut project, or an account key without a usable project, fails the test. Protected projects reject account keys by design, so use a project key there.

## Operations

| Resource | Operation | What it does |
|----------|-----------|--------------|
| Document | Ingest | Upload a file (binary field) or a URL. index4.ai converts, chunks and indexes it. By default the node waits until the document is searchable and returns `jobId`, `docId`, `status`, `deduplicated`. With waiting off it returns the `jobId` right away. |
| Document | Get | Metadata of one document. |
| Document | Get Many | List the project's documents, with Return All or a Limit. |
| Document | Delete | Delete a document. Returns `{ "deleted": true }`. |
| Search | Search | Hybrid search across the project. Prompt-Ready Text returns one item with a `context` block; Structured Results returns one item per matching document. |
| Search | Search in Document | The same, restricted to one document. |
| Job | Get Status | State of an ingest job started with waiting off. |

Get, Get Many and Structured Results carry an **Output** setting: Simplified (the most useful fields), Raw (everything), or Selected Fields.

### Ingest behaviour

- Input items are all submitted first, then the node waits for the jobs together under one deadline (**Timeout (Seconds)**, default 600, taken from the first ingest item).
- When the project is at its concurrent job limit the API answers `429`; the node waits the suggested `Retry-After` and retries within the deadline.
- `done`, `failed` and `blocked` are final states. A job that is still running at the deadline fails with its job ID in the message, so it can be checked later with **Job > Get Status**. With "Continue on fail" the item carries `{ error, jobId, status: "timeout" }`.
- **Attributes** are typed, permanent names stored with the document (a JSON object such as `{"region": "emea", "revision": 12}`). Names must match `^[a-z0-9_]{1,64}$`.
- **Attribute Filters** at search time are a JSON array of clauses, for example `[{"attr": "region", "op": "eq", "value": "emea"}]`. Clauses combine with AND.
- Structured Results with no matching document produce no output item; Prompt-Ready Text always returns one item.

### Example workflows

Importable workflows live in [`examples/`](examples). In n8n, open a workflow, choose **Import from File** from the menu, pick the JSON file, then add your credential to the index4.ai nodes.

| File | What it shows |
|------|---------------|
| [`ingest-url-then-search.json`](examples/ingest-url-then-search.json) | Ingest a document by URL, wait for indexing, then Search in Document using the returned `docId` |
| [`ingest-binary-file.json`](examples/ingest-binary-file.json) | Download a file with HTTP Request and ingest it from the binary field, with an attribute set |
| [`agent-with-search-tool.json`](examples/agent-with-search-tool.json) | Chat Trigger → AI Agent with index4.ai attached as a tool; the model fills the Query via `$fromAI` |

Other shapes that work the same way: Google Drive Trigger → Google Drive download → Ingest from binary; Schedule Trigger → Get Many → Filter on `ingested_at` → Delete.

## Using the node as an AI Agent tool

The node declares `usableAsTool`, so on n8n versions that list verified community nodes in the tool picker you can attach **index4.ai** to an AI Agent. Use the **Search** resource; leave the **Query** field for the model to fill. Prompt-Ready Text is the right Result Format for agents: the model receives one rendered context block with document wrappers and citation URLs.

Operations that need binary input (Ingest from a file) or that destroy data (Delete) are not meant for agent use.

## Compatibility

Works on current n8n releases. Built against n8n-workflow 2.44 on Node 22, with no runtime dependencies.

## Development

```bash
fnm use            # Node 22, from .node-version
npm install
npm run lint
npm run build
npm run dev        # n8n in Docker with this node loaded, http://localhost:5678
```

Use the pinned Node version: the CLI's native dependency does not build on Node 25.

`docker compose up` starts a plain n8n container at http://localhost:5678 with the built `dist/` mounted as a custom extension, the way a self-hosted instance loads the package.

## Release

A version tag triggers `.github/workflows/publish.yml`, which builds the package and publishes it to npm with a provenance statement. `npm run release` lints, builds, bumps the version, tags and pushes.

## Resources

- [index4.ai](https://index4.ai)
- [index4.ai API reference](https://api.index4.ai/v1/openapi.yaml)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)

## License

MIT
