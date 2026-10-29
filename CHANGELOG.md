# Changelog

## 0.1.2 (2026-10-29)

- A Timeout expression that is not a number falls back to the default instead of polling without pause.
- A failed job with code 401, 404 or 429 reports a document problem rather than a request problem, with the API detail.

## 0.1.1 (2026-10-28)

- Published through npm trusted publishing (GitHub Actions OIDC) instead of an access token. No functional changes.

## 0.1.0 (2026-10-28)

- index4.ai node: Document (Ingest, Get, Get Many, Delete), Search (Search, Search in Document), Job (Get Status). Usable as an AI Agent tool.
- index4.ai API credential accepting project API keys and account API keys (optional Project ID), with a credential test.
