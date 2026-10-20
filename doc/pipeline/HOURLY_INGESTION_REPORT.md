# Hourly ingestion report — ClimateShield 360

Hourly fetching is backend-only. No dashboard was connected or modified.

## How to run

| Mode | Command |
|---|---|
| One cycle | `python -m climateshield ingest-hourly --once` or `make.bat ingest` |
| Foreground hourly loop | `python -m climateshield ingest-hourly --schedule` (sleep 3600 s) |
| Windows Task Scheduler | `scripts/register_hourly_ingest_task.ps1` (not executed here; requires `schtasks`) |

Interval: **3600 seconds**. Fetch time is stored separately from observation time. A successful HTTP fetch is not labelled `newly_updated_observations` unless new unique observation keys were appended.

Raw API bodies go to `data/raw/hourly_ingest/<run_id>/`. `data/raw/collected_datasets/` is never written.

## Actual runs executed in this session

Future scheduled hours have **not** occurred. Only the two cycles below were run.

### Run A — first live cycle

- `run_id`: `2026-10-19T14-46-50Z`
- Command: `python -m climateshield ingest-hourly --once`
- Exit code: 0
- Raw dir: `data/raw/hourly_ingest/2026-10-19T14-46-50Z/`

### Run B — duplicate / failure-path check

- `run_id`: `2026-10-19T14-47-48Z`
- Same command, immediately after run A
- Exit code: 0
- Weather new rows: **0**; duplicates skipped: **756**
- GloFAS new rows: **0**; duplicates skipped: **72**
- Gold `weather_hourly` row count stayed **592,356** unique `row_id`s
- Lahore collected JSON hash unchanged

## Connector results (run A)

| Source | Frequency | Live observations? | Fetch time (UTC) | Observation window | Fetched | New | Dupes | Status |
|---|---|---|---|---|---|---|---|---|
| Open-Meteo weather (12 cities) | hourly | yes | 2026-10-19T14:46:50Z | 2026-10-17T00:00Z – 2026-10-19T14:00Z | 756 observed hours | **180** | 576 (overlap with archive ending 2026-10-18T23:00Z) | **success** HTTP 200 |
| Open-Meteo Flood / GloFAS (12 city points) | **daily** | yes, daily | 2026-10-19T14:47:09Z | 2026-10-14 – 2026-10-19 | 72 | **72** | 0 | **success** HTTP 200 |
| Geofabrik pakistan-latest MD5 | periodic extract | no | 2026-10-19T14:47:17Z | n/a | 1 snapshot | 0 | 0 | **success**; MD5 matches collected archive |
| NDMA homepage | daily/irregular HTML | no | 2026-10-19T14:47:19Z | n/a | 1 snapshot | 0 | 0 | **success** HTTP 200; numbers not scraped |
| PMD FFD homepage | daily bulletin HTML | no | 2026-10-19T14:47:20Z | n/a | 1 snapshot | 0 | 0 | **success** HTTP 200; no robots.txt (404) |
| PBS homepage | census / periodic | no | 2026-10-19T14:47:21Z | n/a | 1 snapshot | 0 | 0 | **success** HTTP 200; numbers not scraped |

On run B, Geofabrik and NDMA hashes matched the previous snapshot (`unchanged`). PMD and PBS HTML hashes differed (dynamic pages). New HTML was stored; **not** counted as new statistical observations.

## Implementation notes

- Timeouts 30 s, 3 retries with backoff, ≥ 0.35 s between calls, User-Agent `ClimateShield360/0.1`.
- Forecast hours (`timestamp > fetch_time`) are flagged and **not** appended as observations.
- Duplicate key: weather `city|timestamp_utc`; GloFAS `city|YYYY-MM-DD`. Existing gold rows win (`keep first`).
- GloFAS values are grid cells at the Open-Meteo city points. They are **not** PMD gauging-station series and are not joined to cusecs thresholds.
- Failures are written to `reports/hourly_ingest_log.csv` and `reports/hourly_ingest_status.json`. No connector failed in these two runs.

## Eight impact areas

| Impact area | Working live ingestion? | What actually updates |
|---|---|---|
| 1. Physical | **Yes (hourly weather; daily discharge)** | Open-Meteo precipitation, temperature, wind; GloFAS river discharge (daily) |
| 2. Environmental | **Yes (hourly soil moisture; daily discharge)** | Open-Meteo soil moisture; GloFAS |
| 3. Producers | **No live series** | PBS agricultural census is a PDF snapshot; homepage change-detection only |
| 4. Economic | **No live series** | PBS CPI/SPI not available as an hourly API; homepage snapshot only |
| 5. Public health | **Yes (hourly heat/humidity)** | Open-Meteo temperature and humidity. OSM hospitals remain a 2026-10-12 snapshot |
| 6. Infrastructure | **No hourly observations** | Geofabrik MD5 watched; extract unchanged vs collected archive |
| 7. Social | **No live series** | PBS 2023 census tables; NDMA HTML snapshot only |
| 8. Emergency preparedness | **Partial** | GloFAS daily discharge is live. NDMA/PMD are HTML/PDF, not station APIs. Archive river table is static thresholds |

The pipeline may run every hour. Only Open-Meteo weather currently produces **hourly** new observations. GloFAS produces **daily** observations even when fetched hourly.

## Verification evidence

- Raw JSON/HTML present under both run directories.
- Provenance sidecars include query, fetch time, SHA-256, licence.
- `data/hourly_manifest.csv` lists hourly raw files.
- Unit tests: duplicate-key skip, retry on URLError, robots.txt deny, scheduler interval 3600, Windows task command string.
- Second live run did not increase `weather_hourly` or GloFAS unique keys.
