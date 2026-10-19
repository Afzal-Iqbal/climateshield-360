# First three steps audit — ClimateShield 360

**Official source used:** HackInsight 2026 Devpost page, section “What to build”  
https://hack-insight.devpost.com/

No local Participant Guide PDF was present in this repository or the parent WhatsApp folder. The public specification and the project CLI (`make-data`, Data Quality Agent, `train`) agree on the same first three build items. Later items (Insight Agent / RAG, Hugging Face dashboard) were **not** started.

Generative AI rules used from the same Devpost page: every number below comes from gold tables, logs, or executed commands; AI assistants are allowed; synthetic training data was not created.

| # | Official step (Devpost wording) | Status |
|---|---|---|
| 1 | Data acquisition and warehouse: raw, cleaned and processed layers rebuilt with one command (`make data`) | **PASS** |
| 2 | Data Quality Agent: runs validation tools, decides to fix, fill or flag, and explains each decision | **PASS** |
| 3 | Model: beats a declared baseline, with uncertainty and errors by group | **PASS** (rainfall MAE vs 24h persistence). See Brier note. |

---

## Step 1 — Data acquisition and warehouse

### Requirement

- Raw, cleaned, and processed layers.
- Rebuild with one command (`make data` / `python -m climateshield make-data`).
- `manifest.csv` lists every raw collected file with source, query, fetch time, SHA-256, and licence.
- At least two independent sources, including one not on the Climate track list.
- Minimum volume: 50,000 rows or two years of hourly data.

### Status before this audit

PARTIAL.

Evidence of work already done:

- `data/raw/collected_datasets/` contained 40 files from four publishers (Open-Meteo, OSM/Geofabrik, NDMA/PMD, PBS).
- `data/cleaned/` and `data/processed/` existed, including `weather_hourly.parquet` (592,176 rows at last `make data`) and `climateshield.duckdb`.
- `data/manifest.csv` had source, fetch time, SHA-256, licence.
- `reports/quality_report.json` recorded a successful `make_data` run at `2026-10-19T10:21:50Z` with `raw_files_unchanged: true`.

Problems found:

1. `Pakistan_MultiSource_Datasets_Collection.zip` was **missing**, so `test_zip_archive_is_present` would fail and the declared archive path was empty.
2. Manifest `query` for every file was only `extracted from Pakistan_MultiSource_Datasets_Collection.zip`, not a reconstructable API query.
3. `Dataset_Declaration.md` lists `river_discharge` and “10,585 daily river discharge readings”. **No GloFAS/discharge time series was in the ZIP or extracted files.** Only PMD threshold snapshots (19 stations, cusecs, no time index) existed.
4. `district_name_lookup` has 136 rows vs 160 PBS districts; 24 districts have no OSM name. This was already flagged, not filled.

### Fixes applied

- Recreated `Pakistan_MultiSource_Datasets_Collection.zip` (51,771,511 bytes) from the extracted collected files. Bytes of collected files were not modified. `ensure_zip_archive()` now does this if the ZIP is missing.
- Rebuilt `data/manifest.csv` with reconstructed Open-Meteo city queries (lat/lon/timezone/start) and `https://archive-api.open-meteo.com/v1/archive` as the weather source URL.
- Hourly ingest now fetches GloFAS daily discharge at the 12 city points into a new gold table. That does **not** back-fill the missing 10,585-row claim; it starts an honest live series (72 daily rows on first fetch).

### Verification

- ZIP exists at repo root.
- `data/manifest.csv`: 40 rows; Lahore JSON query names city, latitude 31.528997, longitude 74.38995.
- Lahore collected JSON SHA-256 after ingest still `f8379cd7059aa4baa3ec8c526b97c6f6afeae2f43e5bbe4a0c35b982ee817f2d` (unchanged).
- Gold at end of this audit: `weather_hourly` 592,356 unique `row_id`s (592,176 archive + 180 new observed hours). DuckDB count matches.
- Command: `make.bat data` / `python -m climateshield make-data`. The full rebuild pytest (`test_make_data_rebuilds_layers`) was **not** re-executed in this session because it wipes and rebuilds all gold layers; the last recorded pipeline run remains `2026-10-19T10:21:50Z`.

---

## Step 2 — Data Quality Agent

### Requirement

Run validation tools; decide **fix**, **fill**, or **flag**; explain each decision. Devpost rules also require: do not invent values; do not treat missing reports as zero; keep genuine extremes.

### Status before this audit

PASS, with the pipeline already executed.

Evidence:

- `climateshield/quality/agent.py` runs Pandera schemas, then `choose_action()`.
- `climateshield/quality/rules.py` encodes fix/fill/flag/keep.
- `reports/quality_logs.csv`: 60 decisions (`keep` 13, `flag` 31, `fix` 15, `fill` 1).
- Fill rule `WX.SHORT_GAP_FILL` ran with `n_rows=0` (no short internal gaps in the archive). Precipitation is never interpolated.
- 10,886 observations with temperature ≥ 40 °C were kept (`GLOBAL.NO_EXTREME_DISCARD`).
- Peshawar 2021–2022 was flagged, not back-filled.
- All-zero crop-flood columns were flagged and excluded from the district join.
- Unit tests in `tests/test_quality_agent.py` and `tests/test_quality_rules.py` pass.

### Problems found

None that violated the agent contract. Hourly ingest writes were blocked by `assert_not_raw()` for all of `data/raw/`, which would have prevented storing API bodies. That was corrected only for `data/raw/hourly_ingest/`; `collected_datasets` remains immutable.

### Verification

- `python -m pytest tests/test_quality_agent.py tests/test_quality_rules.py tests/test_raw_preservation.py -q` → pass.
- Collected raw writes still raise `PermissionError`.

---

## Step 3 — Model vs declared baseline

### Requirement (Devpost)

Model beats a declared baseline, with uncertainty and errors by group.

Declared baselines in `Dataset_Declaration.md`:

- Precipitation: \(\hat y_t = y_{t-24h}\).
- Road condition heuristic: caution if hourly rainfall ≥ 2.5 mm/h.
- Team success note: ≥ 20% improvement in MAE **and** Brier on 2025–2026.

### Status before this audit

FAIL (not executed).

Evidence:

- Training code existed (`climateshield/models/train_and_evaluate.py`, notebook).
- `models/` directory was missing.
- `lightgbm` was not installed.
- DuckDB load path ignored the query result and fell back to parquet.
- Features leaked current-hour rainfall (rolling 3h/6h included time t) and contemporaneous `weather_code` (WMO rain codes) into a “forecast” of precipitation at t.
- Rain NaNs were filled with 0.0, inventing dry hours.

### Fixes applied

- Installed `lightgbm`.
- Rolling rainfall uses only hours before t.
- Temperature, humidity, soil moisture, wind, and weather code are shifted by 1 hour.
- Rain NaNs are not filled with 0. Rows lacking a 24h lag are dropped from the test set.
- DuckDB load uses the queried `weather_hourly` frame.
- UTF-8 report writing (Windows `charmap` crashed on checkmark characters after the first successful fit).

### Execution evidence (not fabricated)

Command: `python -m climateshield train`  
Finished `2026-10-19T14:51:41Z`, exit code 0.

| Item | Value |
|---|---|
| Train | 2021–2024, **403,188** rows |
| Test | 2025–2026, **189,168** rows (time-based; 24h-lag missing rows dropped) |
| Baseline MAE | **0.1055 mm** |
| Model MAE | **0.0685 mm** |
| MAE improvement | **+35.10%** (20% MAE target met) |
| Baseline RMSE | 0.6417 mm |
| Model RMSE | 0.3979 mm |
| R² | 0.3003 |
| 80% interval coverage | 97.42% (mean width 0.11 mm) |
| Baseline Brier | 0.0153 |
| Model Brier | 0.0351 |
| Brier improvement | **-129.37%** (classifier did **not** beat the 2.5 mm/h heuristic) |
| Weakest city | Islamabad, model MAE 0.1377 mm |

Artifacts loaded after save:

- `models/lightgbm_rainfall_regressor.joblib` (LGBMRegressor)
- `models/lightgbm_inundation_classifier.joblib` (LGBMClassifier)
- `models/quantile_regressors.joblib` (dict of Q10/Q50/Q90)

Sukkur MAE gain is **negative** (−7.14%). That is reported, not hidden.

### Step 3 classification

**PASS** against the official Devpost step: a model was trained on a future time split, beat the declared 24h persistence baseline on MAE, produced quantile intervals, and reported group errors.

**PARTIAL** against the team’s own “MAE and Brier both ≥ 20%” sentence in `Dataset_Declaration.md`. Brier did not improve.

---

## Dataset inspection (within steps 1–2)

Original collected files were not overwritten.

| Source folder | Formats | Volume / grain | Notes |
|---|---|---|---|
| `01_open_meteo_heat_rainfall` | JSON, CSV | 12 cities; 11×50,808 hours from 2021-01-01; Peshawar 33,288 from 2023-01-01; 6-hourly sample 98,696 rows | Sample is not hourly. Quetta max 39.7 C is real climate, not missing. |
| `02_openstreetmap_geofabrik` | CSV, GeoJSON, md5, yaml | 160 districts; 5,144 health features; 67,781 populated places | Crop-flood columns all zero (source unavailable). OSM zeros ≠ confirmed absence. Snapshot 2026-10-12. |
| `03_ndma_pmd_hazards_warnings` | PDF, CSV | 19 river stations, thresholds in cusecs | PDFs catalogued, numbers not scraped. Not a discharge time series. |
| `04_pakistan_bureau_of_statistics` | CSV, PDF | 160 districts census tables | Vulnerability CSV is a logical join of the other two. Not hourly. |

Independent sources not on the default Climate track list: OSM/Geofabrik, NDMA/PMD, PBS.

---

## Remaining blockers / manual actions

1. Replace the placeholder `[Your Team Name]` in `Dataset_Declaration.md` if submitting.
2. The original publisher ZIP was missing; the file now at repo root is a bit-for-bit wrapper of the extracted collected files, not a newly downloaded publisher archive.
3. Do not treat `Dataset_Declaration.md`’s 10,585 GloFAS rows as present in the archive.
4. Optional: run `python -m pytest tests/test_pipeline.py::test_make_data_rebuilds_layers` if a full warehouse rebuild must be re-proven (it resets processed layers).
5. Dashboard / Insight Agent were out of scope and were not built.
