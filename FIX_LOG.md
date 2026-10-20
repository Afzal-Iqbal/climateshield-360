# Fix log — 2026-10-20 audit repair

Earlier notes in `pipeline/FIX_LOG.md` were not rewritten.

## 1. Warehouse rebuild dropped contract tables

- Problem: After a warehouse rebuild, predictions, model evaluation, run history, and source freshness were gone. The dashboard treated the pipeline as failed.
- Root cause: `build_warehouse()` deletes `climateshield.duckdb` and loads only gold parquet/CSV tables.
- Files: `pipeline/climateshield/pipeline/warehouse.py`.
- Change: `restore_contract_tables()` reloads `run_status` and `source_freshness` from `pipeline/reports/hourly_ingest_log.csv`, and `model_eval` from `fairness_by_group.csv` plus the overall MAE in `model_vs_baseline_metrics.json`. `build_warehouse()` calls it before writing the catalog.
- Test: Called `restore_contract_tables()` on the current warehouse. Result: 2 run rows, 6 sources, 13 evaluation rows. `pipeline/tests/test_warehouse.py` passed. A full `make data` rebuild was not run.
- Limitation: Predictions are not in the CSV log, so this function does not recreate them. `src/models/predict.py` does that.

## 2. Live predictions and city errors were missing

- Problem: `GET /api/forecast` said no ML predictions were recorded. `GET /api/model-eval` was empty.
- Root cause: The prediction table had been deleted with the warehouse. The joblib artifacts were still on disk.
- Files: no new model code. Executed existing `python src/models/predict.py --db-path pipeline/data/processed/climateshield.duckdb`.
- Change: The script wrote 12 next-hour heavy-rain rows and 12 city MAE rows. Model version `lightgbm_quantile_v1.0`. Forecast timestamp range reported by the script: `2026-10-20T00:00:00+00:00` for every city.
- Test: Script exit code 0. `pipeline/tests/test_predict.py` passed (4 tests). Live Karachi forecast then returned one prediction.
- Limitation: Most stored medians are 0.0 mm. That is the model output for this hour, not a substituted number. The inundation classifier was not what this script wrote.

## 3. Status text named the wrong baseline

- Problem: `/api/status` always said `35.1% MAE Improvement vs 30y Baseline` and `Operational`.
- Root cause: The sentence was hard-coded in `backend/routers/freshness.py`.
- Change: `_evaluation_status_text()` reads `pipeline/reports/model_vs_baseline_metrics.json`.
- Test: Live response was `Evaluated against 24h persistence (y_hat_t = y_{t-24h}) · rainfall MAE change 35.1% · 80% interval coverage 97.42% · inundation Brier change -129.37%`.
- Limitation: If the JSON file is missing, the text says the report is unavailable.

## 4. Passed quality checks counted as exclusions

- Problem: On `/api/status`, action `keep` was assigned to the exclude counter.
- Root cause: `elif action in ("exclude", "keep")` in `backend/routers/freshness.py`.
- Change: Only `exclude` increments the exclude count. `keep` still counts as a rule inspected.
- Test: `backend/tests/test_freshness.py` passed with the other status tests (21 tests in the combined forecast/freshness/impacts run).

## 5. Flood exposure multiplied by 2.05

- Problem: Physical impact turned `RP10_female_pop_30cm` and `RP50_female_pop_30cm` into a total population with a 2.05 factor.
- Root cause: Hard-coded scale in `backend/routers/impacts.py`.
- Change: Indicators now use the source female-population fields and say they are not a total-population estimate. The limitation text says the same.
- Test: `backend/tests/test_impacts.py` passed. The test checks that an RP10 indicator exists; it does not check the old scaled value.

## 6. Zero rainfall treated as missing

- Problem: `median or probability` replaced a stored median of 0.0 with the probability. Missing temperature could also become 0°C.
- Root cause: Python treats `0.0` as false. Missing heat and rain used `or 0.0`.
- Files: `backend/routers/forecast.py`.
- Change: Stored zeros stay zero. Rows with a null temperature, or with both precipitation and rain null, are omitted instead of plotted as zero. If there is no prediction row, the model version is null and the 24-hour baseline is null when fewer than 24 observed values exist.
- Test: After restart, Karachi `median` was `0.0`, `probability` was `0.0082`, and `baseline_value` was `0.0`. `backend/tests/test_forecast.py` passed.

## 7. Fabricated freshness sources in the Prefect flow

- Problem: `update_status_task` inserted radar, ECMWF, NOAA GFS, K-Electric, SBCA, and Sentinel-2 rows.
- Root cause: A default list in `flows/hourly_flow.py` that does not correspond to a connector.
- Change: Removed that list. The task still records the Open-Meteo row for a flow that actually runs, plus `run_status`.
- Test: Code inspection. The flow was not executed, so no new fake rows were written. Current `source_freshness` comes from the ingest log only.
- Limitation: This flow is still a second scheduler beside `python -m climateshield ingest-hourly`. Neither is registered in Windows Task Scheduler on this machine.

## 8. System-health copy over-claimed retry success

- Problem: An empty error list said every micro-batch had zero failed retries.
- File: `frontend/src/pages/PipelineFreshness.tsx`.
- Change: The empty state now says only that the loaded `run_status` rows have no failed status, and that retry tasks are not shown unless they are stored there.
- Test: Not click-tested. The API error list is empty because both logged runs have status `success`.

## Not changed on purpose

- The insight router was left without a generated RAG implementation. The page already says the module is not connected.
- Raw files were not rewritten. Hashes were not invented.
- `AI_Use_Log.md` historical entries were not edited to hide the 93.26% versus 35.1% contradiction.
- No git tag, Hugging Face deploy, Summary.pdf, or demo video was created.
