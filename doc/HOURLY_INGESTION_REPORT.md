# Hourly ingestion report — checked 2026-10-20

The earlier write-up is `doc/pipeline/HOURLY_INGESTION_REPORT.md`. This file records what was verified again and what changed in the dashboard connection. It does not add runs.

## Connectors

Implemented in `pipeline/climateshield/ingest/connectors.py`:

| Connector | Publication frequency in code | Live observations |
|---|---|---|
| Open-Meteo weather, 12 cities | hourly | yes |
| Open-Meteo Flood / GloFAS | daily | yes, daily |
| Geofabrik Pakistan PBF MD5 | periodic extract | no, hash only |
| NDMA homepage | irregular bulletins | no, HTML snapshot |
| PMD FFD homepage | daily bulletins | no, HTML snapshot |
| PBS homepage | census and periodic releases | no, HTML snapshot |

Retries, timeout, and rate limit in `pipeline/climateshield/config.py`: 3 retries, 30 seconds, at least 0.35 seconds between calls.

## Runs that are actually logged

`pipeline/reports/hourly_ingest_log.csv` contains two run IDs:

- `2026-10-19T14-46-50Z`
- `2026-10-19T14-47-48Z`

Both were loaded into `run_status` with status `success`. The second run's connector rows in `hourly_ingest_status.json` show 0 new weather rows and 0 new GloFAS rows. That matches the earlier report's duplicate check. No later run is in the log.

`schtasks /Query` filtered for climate, shield, ingest, and hourly returned no task. `pipeline/scripts/register_hourly_ingest_task.ps1` was not executed in this session. A schedule file is not evidence that the job is running. The freshness calculation agrees: Open-Meteo weather was **Stale** (about 1396 minutes since the last fetch). The five non-hourly sources were still inside a 1440-minute window, so they computed as **Fresh**.

## Failure behavior

- One connector can fail without the code path requiring every other connector to succeed. The two logged cycles did not contain a failed connector.
- Previous gold rows stay when a later fetch finds only duplicates. That was already reported for run B and was not re-fetched today.
- `flows/hourly_flow.py` no longer inserts freshness rows for sources this project does not download.

## What the dashboard shows now

`/api/status` on 2026-10-20:

- `status_indicator`: `late` (last success older than 90 minutes)
- `hourly_evidence.runs_last_24h`: 2
- `success_count`: 2
- `failed_count`: 0
- latest successful run: `2026-10-19T14-47-48Z`

Those two rows are the logged ingests, not a generated history.
