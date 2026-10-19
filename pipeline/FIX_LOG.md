# Fix log — first three steps, training verification, hourly ingest

Scope limited to those tasks. Dashboard code was not modified.

## Errors and gaps found

| ID | Area | Finding | Root cause |
|---|---|---|---|
| F1 | Step 1 | Collection ZIP missing at `Pakistan_MultiSource_Datasets_Collection.zip` | Archive was not in the working copy; extracted files were present |
| F2 | Step 1 | Manifest query was only “extracted from zip” | `build_manifest()` did not reconstruct source queries |
| F3 | Step 1 | GloFAS / `river_discharge` claimed in `Dataset_Declaration.md` but absent from collected files | Declaration overstated archive contents |
| F4 | Step 3 | No `models/` artifacts; training never executed | Script existed; `lightgbm` missing; no run |
| F5 | Step 3 | DuckDB branch discarded the loaded frame and called parquet load | `return load_data(PARQUET_PATH)` after querying DuckDB |
| F6 | Step 3 | Current-hour rain in rolling 3h/6h features | `groupby.rolling(3)` includes time t while target is precipitation at t |
| F7 | Step 3 | Contemporaneous `weather_code` and meteo fields used as forecast features | WMO rain codes at t leak the rainfall target |
| F8 | Step 3 | `rain.fillna(0)` invented dry hours | Violates no-invented-values rule |
| F9 | Step 3 | First completed fit crashed while writing the markdown report | Windows cp1252 could not encode U+2705 |
| F10 | Hourly ingest | No connectors, scheduler, or hourly raw layer | Out of original `make data` scope |
| F11 | I/O | `assert_not_raw()` blocked all writes under `data/raw/` | Would prevent storing new API bodies without touching the immutable archive |

## Changes made

| ID | Change |
|---|---|
| F1 | `ensure_zip_archive()` rebuilds the ZIP from extracted collected files if missing. ZIP recreated (51,771,511 bytes). |
| F2 | Weather JSON rows in `manifest.csv` now include city, lat, lon, timezone, start year, and archive-api URL. |
| F3 | Documented as missing from the ZIP. Live GloFAS daily fetch added; 72 rows stored. The 10,585-row claim was not fabricated. |
| F4 | `pip install lightgbm`; `python -m climateshield train` executed. |
| F5 | DuckDB path now returns `_prepare_weather_frame(df)`. |
| F6–F8 | Lagged rainfall and lagged meteorological covariates; no zero-fill of rain. |
| F9 | Reports written with `encoding="utf-8"`; emoji removed from the summary table. |
| F10 | `climateshield/ingest/` plus CLI `ingest-hourly`, `make.bat ingest`, Windows task script. |
| F11 | Writes allowed only under `data/raw/hourly_ingest/`. `collected_datasets` still immutable. |

Files touched (non-dashboard): `climateshield/config.py`, `io_utils.py`, `manifest.py`, `__main__.py`, `pipeline/extract.py`, `pipeline/clean_weather.py`, `pipeline/warehouse.py`, `pipeline/run.py`, `models/train_and_evaluate.py`, `src/models/train_and_evaluate.py`, `make.bat`, `requirements.txt` unchanged (lightgbm already listed), new `climateshield/ingest/*`, tests, and this report set.

## Tests actually executed

| Test | Result |
|---|---|
| `pytest tests -q --ignore=tests/test_pipeline.py -k "not make_data_rebuilds"` | **PASS** (23 then 26 after later tests) |
| `pytest tests/test_pipeline.py -k "not make_data_rebuilds"` | **PASS** (zip present, quality artifacts present) |
| `tests/test_quality_agent.py`, `test_quality_rules.py`, `test_raw_preservation.py`, `test_warehouse.py` | **PASS** |
| `tests/test_ingest.py` (dupes, retries, robots, 3600 s interval, task script) | **PASS** |
| `tests/test_model_features.py` (no current-hour rain; lagged weather_code) | **PASS** |
| `tests/test_model_artifacts.py` (joblib load + metrics JSON) | run after this log; expected PASS if artifacts remain |
| Live `ingest-hourly --once` | **PASS** (all six connectors HTTP 200) |
| Live second `ingest-hourly --once` | **PASS** (0 new weather/GloFAS keys; gold not duplicated) |
| `python -m climateshield train` (after leakage fix) | **PASS** exit 0; MAE +35.10% vs persistence; artifacts reload |
| `tests/test_pipeline.py::test_make_data_rebuilds_layers` | **NOT RUN** this session (full gold rebuild) |

## Training metrics (executed, honest lagged features)

From `reports/model_vs_baseline_metrics.json` timestamp `2026-10-19T14:51:31Z`:

- Baseline MAE 0.1055 mm, model MAE 0.0685 mm, **+35.10%**
- Baseline Brier 0.0153, model Brier 0.0351, **−129.37%**
- Train 403,188 rows (≤2024), test 189,168 rows (≥2025)

An earlier fit in the same session (before lagging weather_code) produced MAE 0.0151 mm / +85.69%. That run is **not** the reported result; it still leaked contemporaneous weather codes. The leaked-run binaries were overwritten by the honest retrain.

## Remaining issues

- Inundation classifier Brier is worse than the 2.5 mm/h heuristic. Not tuned further in this scope.
- Sukkur MAE is worse than persistence (−7.14%).
- PBS/PMD HTML can change between hourly fetches without being new observations.
- Full `make data` pytest not re-run after hourly gold appends.
