# ClimateShield 360 — project audit

Audit date: 2026-10-20. Evidence is from the files, tests, and live local API checked in this session. The HackInsight participant guide was not in the workspace, so competition-rule claims below are limited to `doc/AGENT_RULES.md` and the documents that are present.

Statuses: `PASS`, `PARTIAL`, `FAIL`, `BLOCKED`, `NOT APPLICABLE`.

## Initial problems found before repair

1. `build_warehouse()` deletes `pipeline/data/processed/climateshield.duckdb` and rebuilds only gold tables. That dropped `run_status`, `source_freshness`, `predictions`, and `model_eval`.
2. With those tables missing, `/api/status` reported `failed`, `/api/freshness` was empty, `/api/predictions` was empty, and `/api/model-eval` had no groups.
3. `/api/status` always returned the sentence `Operational · 35.1% MAE Improvement vs 30y Baseline`. The saved report says the baseline is 24-hour persistence, not a 30-year baseline.
4. Physical-impact flood population was `female_population * 2.05`, presented as total persons.
5. `flows/hourly_flow.py` inserted freshness rows for radar, ECMWF, NOAA GFS, K-Electric SCADA, SBCA permits, and Sentinel-2 that this project does not fetch.
6. Forecast code treated numeric `0.0` as missing, so a zero rainfall median was replaced by the exceedance probability.
7. Missing temperature or rainfall could be displayed as zero.
8. `GET /api/insight` has no route. The assistant page is an empty state. PDFs are catalogued with `document_not_parsed_no_invented_numbers`.
9. `doc/AI_Use_Log.md` entry 2 says MAE improved 93.26% and Gilgit was weakest. `pipeline/reports/model_vs_baseline_metrics.json` says 35.1% and Islamabad is weakest. The JSON file is the artifact checked here.
10. No Windows scheduled task matching climate, shield, ingest, or hourly was found. The last logged ingest is `2026-10-19T14-47-48Z`.

## Feature audit

| Feature | Files / routes | Actual behavior before repair | Priority | Status after this session |
|---|---|---|---|---|
| App startup | `frontend` Vite `:5173`, FastAPI `:8000` | Both already responded. A second start failed because the ports were taken. | Critical | PASS. Restarted the API after code changes. Site: http://localhost:5173 |
| Frontend routes | `frontend/src/App.tsx` | Nine routes exist. Unknown paths redirect home. | High | PARTIAL. Routes load as a Vite SPA (HTTP 200). No in-browser click-through was available. |
| Overview | `GET /api/overview`, `/api/priorities` | Endpoints returned 200 from warehouse weather and exposure tables. | High | PASS for the API. Visual layout not click-tested. |
| Risk map | `GET /api/map/zones`, `/api/map/facilities`, `/api/map/zone/{id}` | Endpoints returned 200. | High | PARTIAL. Map rendering was not opened in a browser. |
| Forecast | `GET /api/forecast` | Observed weather returned. Predictions were empty because the table had been dropped. Zero values were coerced. | Critical | PARTIAL. 12 city predictions were written by `src/models/predict.py`. Zero medians stay zero. Many city medians are 0.0 mm. |
| Eight impacts | `GET /api/impacts` and `/api/impacts/{area}` | All eight areas return. Producers and economic are limited-evidence. Flood people used a 2.05 scale. | High | PARTIAL. Scale removed. Separate pages for each impact do not exist; they are tabs on `/eight-impacts`. |
| Data quality | `GET /api/quality/summary`, `/decisions`, `/daily` | Summary comes from the quality report. `keep` could be counted as `exclude` on `/api/status`. | High | PARTIAL. `keep` is no longer added to exclude. Dashboard still depends on `quality_logs`. |
| Insight assistant | `/ai-assistant`, `backend/routers/insight.py` | Page is an empty state. Router has no endpoint. `GET /api/insight` is 404. | High | FAIL. Not implemented. A full RAG module was not generated. |
| Emergency planner | `GET /api/planner` | Returns 200 from warehouse exposure and predictions when those tables exist. | Medium | PARTIAL. API returned 200 before the prediction reload. Not re-click-tested after predictions were restored. |
| Pipeline health | `GET /api/status`, `/api/freshness`, `/api/runs` | Empty contract tables made the pipeline look failed. Evaluation text named a 30-year baseline. | Critical | PARTIAL. Real 2026-10-19 ingest rows are loaded. Status is `late` because the last success is older than 90 minutes. Weather source is `Stale`. |
| Methodology | `GET /api/methodology`, `/methodology` | Reads manifest, declaration, metrics, rules, and river thresholds. | Medium | PASS for the API contract covered by `backend/tests/test_methodology.py`. |
| Model artifacts | `pipeline/models/*.joblib`, metrics JSON, fairness CSV | Files exist. They were not loaded into the live warehouse after the rebuild. | Critical | PARTIAL. Artifacts load. `run_predictions` wrote 12 rows and 12 city MAE rows on 2026-10-20. |
| RAG library | `document_catalog`, 11 PDFs under collected datasets | No `docs/library/`. Catalog flag says documents were not parsed. | High | FAIL. Files exist. Retrieval does not. |
| Hourly ingest | `pipeline/climateshield/ingest/`, `hourly_ingest_log.csv` | Two successful cycles on 2026-10-19 are logged. Scheduler is not registered on this machine. | High | PARTIAL. Log is real. Automation is not currently running. |
| Manifest | `pipeline/data/manifest.csv` | Working copy was rewritten at `2026-10-20T13:55:28Z` to 40 collected files. Those 40 hashes matched the files. | High | PARTIAL. Verified the current 40-row file only. Did not re-hash every multi-megabyte raw JSON in this pass. |
| `make data` | `pipeline/Makefile` | Target exists: `python -m climateshield make-data`. Not re-run here, because it deletes and rebuilds the warehouse. | High | PARTIAL. Rebuild now calls `restore_contract_tables()`. That path was not executed end to end. |
| Tests | `backend/tests`, `pipeline/tests` | Backend 68 passed and pipeline tests passed before edits. | Medium | PASS for the suites re-run after edits. See `doc/FIX_LOG.md`. |
| Authentication | none found | No login module. | — | NOT APPLICABLE |
| Settings page | none found | No settings route. | — | NOT APPLICABLE |
| Hugging Face Space / `v1.0-final` / Summary.pdf / demo video | not verified as live | Deployment and final tag were not created. | Medium | BLOCKED. Not claimed. |

## Pages that do not exist

The prompt's 19-page list is not the route map. These are not separate routes and were not tested as pages:

- Physical, environmental, producers, economic, health, infrastructure, social, and emergency as their own URLs. They are tabs on `/eight-impacts`.
- A standalone model-performance page. Metrics appear through `/api/model/summary`, `/api/model-eval`, `/forecast`, `/system-health`, and `/methodology`.
- An official-document browser. Titles are in `document_catalog` and the methodology payload, not a chunk viewer.
- A settings page.

## Verification limits

No browser automation tool was available, so pages were not clicked. Checks were source inspection, pytest, and HTTP calls to the local API and `http://127.0.0.1:5173/`.
