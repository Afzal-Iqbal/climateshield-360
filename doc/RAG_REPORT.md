# RAG report

## What exists

- There is no `docs/library/` directory.
- Eleven PDFs are in `pipeline/data/raw/collected_datasets/` under the NDMA/PMD and PBS folders. Names and byte sizes are listed in `pipeline/data/raw/collected_datasets/README_DATASETS_CATALOG.md`.
- `document_catalog` has 11 rows. The `quality_flags` value observed on the sampled rows is `document_not_parsed_no_invented_numbers`.
- `backend/routers/insight.py` defines a router and no path. `GET /api/insight` returned **404** on 2026-10-20.
- `frontend/src/pages/InsightAgent.tsx` renders an empty state and does not call an answer API. Route: `/ai-assistant`.

## What was not done

A retrieval pipeline was not added. The participant guide was not in the workspace, and the request for this audit says not to generate a complete new runnable module where that restriction applies. Building a chat model, embeddings, and citations would have been a new module, not a repair of a working one.

These checks were **not run**, because there is no retriever to call:

- A question answered from an official PDF.
- A question answered from a processed table through the assistant.
- An unsupported question.
- A misleading question.
- A request for an unsupported number.
- A question about a failed extraction.
- A historical-versus-current question.
- A heat-health emergency question.

## Honest status

- Document count on disk: 11 PDFs.
- Extraction: not parsed, per the catalog flag. Text extraction was not re-tried in this session.
- Indexing: none found.
- Citations: none. The UI does not return answers.
- Numerical grounding through an assistant: not available. Numbers on the other pages come from the API and DuckDB.
- Unsupported-question behavior: the page does not answer. It does not yet show the explicit "I don't know" fallback, because there is no question handler.

Official emergency numbers that do exist are on the planner page as telephone links, not as RAG answers.
