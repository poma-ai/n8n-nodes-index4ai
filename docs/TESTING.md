# Manual test log

## 2026-10-26: live API and local n8n, account API key

Setup: `n8nio/n8n:latest` (n8n 2.44) with the built package mounted as a custom extension (see `docker-compose.yml`), owner login, one **index4.ai API** credential with an account key and no Project ID.

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
| AI Agent tool picker (V5) | "index4.ai Tool" listed, no environment variable needed on n8n 2.44 |
| Tool description (V6) | n8n shows "Tool Description: Set Automatically" using the node description; Query carries the "let the model fill" control |

### Example workflows (same day, same instance)

`examples/ingest-binary-file.json` imported via **Import from URL** and executed: HTTP Request downloaded `dummy.pdf` (13.3 kB, `application/pdf`), Ingest read it from the `data` binary field with `Attributes` `{"source": "n8n_example"}`, waited, and returned `status: done`. `GET /docs/{docId}` showed `attributes: {"source": "n8n_example"}`; the document was then deleted and answers 404.

Note for a custom-extension install (`N8N_CUSTOM_EXTENSIONS`, as in `docker-compose.yml`): n8n registers the node as `CUSTOM.index4Ai`, so the examples' `@poma-ai/n8n-nodes-index4ai.index4Ai` type must be replaced with `CUSTOM.index4Ai` before importing. A package installed through Settings > Community Nodes uses the type as shipped. "Import from URL" is fetched by the n8n backend, not the browser, so the URL must be reachable from inside the container.

### Later the same day, same instance

| Check | Result |
|---|---|
| Document > Get Many, Return All off, Limit 3, Simplified | 3 items with `doc_id`, `filename`, `chunkset_count`, `ingested_at` (fields the API did not return are absent); n8n shows its own "limit reached" hint |
| Document > Get via the "From list" picker, Simplified | One item for the picked document |
| Job > Get Status with the ID of the earlier URL ingest | `{ jobId, docId, status: "done", deduplicated: false }`; a job keeps reporting `done` after its document was deleted |
| `examples/agent-with-search-tool.json` | Imports cleanly; the index4.ai credential is attached to the tool automatically; not executed yet, the Chat model node needs a provider credential |
| Agent run with a chat model (same day, Google Gemini, in a hand-built workflow with the same tool wiring) | Prompt "What does the Globex demo sales model contain?" with the tool's Query set to Defined by agent: the agent called the model, then the index4.ai Tool once (the top hit was the Globex workbook, rel 1.19), then the model again, and answered in two sentences naming the document. 2,592 tokens, 6.3 s. With a fixed Query the tool still ran but searched the fixed text; with the prompt source left on Connected Chat Trigger Node and no Chat Trigger, the agent fails with "No prompt specified" |

### Output modes in the UI (same day, a check workflow with one branch per mode)

| Check | Result |
|---|---|
| Search, Structured Results, Output Raw, query "Globex demo sales model" | One item with the fields the API returned for it: `doc_id`, `chunkset_index` (-1 for a document-level hit), `content`, `pages`, `chunk_indices`, `score`, `scores`. Fields the API leaves out are not invented |
| Search, Output Selected Fields = Content, Score | `doc_id`, `content`, `score` only; the ID stays as documented |
| Document > Get Many, Limit 2, Selected Fields = Title, Pages | Two items with `doc_id` only: these documents have no `title` or `pages` in the API response, so only the ID remains. n8n shows its "Limit of 2 items reached" hint |
| Document > Get Many, Limit 1, Output Raw | `doc_id`, `filename`, `chunkset_count`, `chunk_count`, `table_count`, `ingested_at`, `source_job_id`, `bm25_state` |

### Wrong-product key (2026-10-28)

| Check | Result |
|---|---|
| A PrimeCut project key on `GET /docs?limit=1` (the credential test request) | 403 `{"code":403,"error":"API key not valid for this product"}`. An account key with a random Project ID on the same route: 403 `{"code":403,"error":"Project not found or access denied","reason":"forbidden"}`, so the credential-test rule for 403 names both causes and the node maps each text to its own message. In the UI the credential test first showed n8n's generic "Couldn't connect with these settings: Forbidden"; with the `rules` added the same day it shows "This key is for a different product. Use an index4.ai key: a project key for an index4.ai project, or an account key." (checked in the UI). The node's 403 mapping recognises the same text ("The API key is for a different product") |
| An invalid key on the credential test (UI, build with the rules) | "The API key was rejected. Check it in the console." |

### Not yet covered

- `examples/ingest-url-then-search.json` as an import (the same steps were run by hand earlier)
- An index4.ai project key (only the account key was used; the PrimeCut project key confirmed the wrong-product path)

## Published package, 2026-10-28

`@poma-ai/n8n-nodes-index4ai@0.1.0` on npm, published by `publish.yml` from tag `0.1.0` (commit df174b1) with a SLSA v1 provenance attestation.

- `npx @n8n/scan-community-package @poma-ai/n8n-nodes-index4ai`: provenance check passed, source fetched from `github.com/poma-ai/n8n-nodes-index4ai@df174b1`, all security checks passed.
- Clean folder, Node 22: `npm install @poma-ai/n8n-nodes-index4ai n8n-workflow`; the node and credential classes load (`index4Ai` v1, `usableAsTool: true`, credential `index4AiApi`); 36 files.
- Fresh `n8nio/n8n:2.44.7` container, no custom extensions: Settings > Community Nodes > Install with the package name installed v0.1.0 in a few seconds ("Community package installed" in the log); n8n's installer added no peer dependencies to `~/.n8n/nodes`. Import from URL with `https://raw.githubusercontent.com/poma-ai/n8n-nodes-index4ai/main/examples/ingest-url-then-search.json` resolved both nodes to the installed type. With an index4.ai credential added in the UI, Execute ran green: Ingest returned `status: done, deduplicated: true` with a `docId`; Search in document returned one result with the document's `<context>` block, `result_count: 1`, `tokens_estimated: 40`.
- Note: a bare `npm install @poma-ai/n8n-nodes-index4ai` inside the n8n image (Node 26) fails while building `isolated-vm`, pulled in through the `n8n-workflow` peer dependency. n8n's own installer does not install peers, so this does not affect users.
