# Test log

## 2026-10-26: live API and local n8n, account API key

Setup: `n8nio/n8n:latest` (n8n 3.x) with the built package mounted as a custom extension (see `docker-compose.yml`), owner login, one **index4.ai API** credential with an account key and no Project ID.

### Live API (curl, `https://api.index4.ai/v1`)

| Check | Result |
|---|---|
| `GET /docs?limit=1`, no `X-Project-ID` | 200, account namespace (the "Default Workspace" documents) |
| `GET /docs`, `X-Project-ID` of another project | 200, that project's namespace |
| `GET /docs`, unknown project UUID | 403 `forbidden` |
| `GET /docs`, malformed project ID | 503 from the API; the node now rejects a non-UUID Project ID before calling |
| `GET /projects/info`, account key | 401 (project keys only; this is why the credential test uses `/docs`) |
| `GET /jobs/{unknown}/status` with and without `X-Project-ID` | 404 both; the header is harmless on job routes |
| `POST /search` (prompt_ready and json), `POST /searchInDoc` | 200; one transient 502 on the first account-namespace search, fine on retry |

### Local n8n UI

| Check | Result |
|---|---|
| Nodes panel | "index4.ai" listed with icon and description; seven actions under Document, Job, Search |
| Credential form | API Key and Project ID fields; saved and accepted with an account key |
| Search, Prompt-Ready Text | One item: `context`, `query`, `namespace`, `result_count`, ... |
| Search, Structured Results | Output selector appears; one item per matching document, Simplified fields |
| Document > Ingest, URL source, Wait for Indexing on | Finished in about 30 s: `{ jobId, docId, status: "done", deduplicated: false }` |
| Search in Document, "From list" picker | Picker lists the project's documents and filters by typed text; the new document was searchable |
| Document > Delete, "From list" picker | `{ "deleted": true }` |
| AI Agent tool picker (V5) | "index4.ai Tool" listed, no environment variable needed on n8n 3.x |
| Tool description (V6) | n8n shows "Tool Description: Set Automatically" using the node description; Query carries the "let the model fill" control |

### Not yet covered

- Binary-file ingest from a previous node (only URL ingest was run)
- Get, Get Many and the Output modes Raw and Selected Fields in the UI
- Job > Get Status in the UI
- A real agent run with a chat model attached
- A project API key (only the account key was used)
