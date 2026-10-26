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

### Example workflows (same day, same instance)

`examples/ingest-binary-file.json` imported via **Import from URL** and executed: HTTP Request downloaded `dummy.pdf` (13.3 kB, `application/pdf`), Ingest read it from the `data` binary field with `Attributes` `{"source": "n8n_example"}`, waited, and returned `status: done`. `GET /docs/{docId}` showed `attributes: {"source": "n8n_example"}`; the document was then deleted and answers 404.

Note for a custom-extension install (`N8N_CUSTOM_EXTENSIONS`, as in `docker-compose.yml`): n8n registers the node as `CUSTOM.index4Ai`, so the examples' `n8n-nodes-index4ai.index4Ai` type must be replaced with `CUSTOM.index4Ai` before importing. A package installed through Settings > Community Nodes uses the type as shipped. "Import from URL" is fetched by the n8n backend, not the browser, so the URL must be reachable from inside the container.

### Later the same day, same instance

| Check | Result |
|---|---|
| Document > Get Many, Return All off, Limit 3, Simplified | 3 items with `doc_id`, `filename`, `chunkset_count`, `ingested_at` (fields the API did not return are absent); n8n shows its own "limit reached" hint |
| Document > Get via the "From list" picker, Simplified | One item for the picked document |
| Job > Get Status with the ID of the earlier URL ingest | `{ jobId, docId, status: "done", deduplicated: false }`; a job keeps reporting `done` after its document was deleted |
| `examples/agent-with-search-tool.json` | Imports cleanly; the index4.ai credential is attached to the tool automatically; not executed yet, the Chat model node needs a provider credential |

### Not yet covered

- The Output modes Raw and Selected Fields in the UI (exercised by the mock harness only)
- A real agent run with a chat model attached
- `examples/ingest-url-then-search.json` as an import (the same steps were run by hand earlier)
- A project API key (only the account key was used)
