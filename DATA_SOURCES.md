# Data sources

Checked against `pipeline/data/raw/collected_datasets/README_DATASETS_CATALOG.md`, `pipeline/reports/hourly_ingest_status.json`, `pipeline/climateshield/ingest/connectors.py`, and the current `source_freshness` table. This is not a new collection pass.

| Source | Publisher | What is stored | Coverage | Update behavior | Licence recorded in the project | Last logged fetch (UTC) |
|---|---|---|---|---|---|---|
| Open-Meteo archive and forecast API | Open-Meteo | Hourly temperature, humidity, precipitation, rain, wind, pressure, soil moisture, weather code for 12 Pakistan cities | City points, archive from 2021 (Peshawar from 2023) plus recent forecast hours | Hourly observations. Forecast hours after the fetch time are not stored as observations. | CC-BY-4.0 | 2026-10-19T14:47:48Z. Computed status on 2026-10-20: **Stale** (about 1396 minutes). |
| Open-Meteo Flood / GloFAS | Open-Meteo / Copernicus | Daily river discharge at the same city points | Grid cell at the city coordinate, not a PMD gauge | Daily. An hourly job does not create hourly discharge. | CC-BY-4.0 | 2026-10-19T14:47:59Z. Computed status: **Fresh** against a 1440-minute expectation. |
| OpenStreetMap / Geofabrik | OSM contributors, Geofabrik, HOT-style export | Facilities, roads, hospital access, rural access, flood-exposure tables, Pakistan extract MD5 | Pakistan snapshot dated 2026-10-12 in the catalog notes | Extract is periodic. The connector stores the MD5, not a new road inventory, unless the hash changes. | ODbL-1.0 | 2026-10-19T14:48:10Z. Status in the log: `unchanged`. |
| NDMA | NDMA | PDFs in the collected archive, plus homepage HTML snapshots | National advisories and strategy PDFs already in the archive | No hourly observation API in this project. Homepage HTML is change detection. Numbers are not scraped. | `licence_unspecified_official_publication` | 2026-10-19T14:48:11Z |
| PMD Flood Forecasting Division | PMD | River danger-level table and flood PDFs, plus homepage HTML | Danger levels are static thresholds for gauging stations in the archive, not a live hydrograph | Daily bulletins. `robots.txt` was 404 on the logged fetch. | same official-publication label | 2026-10-19T14:48:12Z |
| Pakistan Bureau of Statistics | PBS | District population, rural/urban, dependency ratios, and census/CPI/agriculture PDFs | District tables in the archive. Homepage snapshot does not extract new statistics. | Census and periodic releases. Not an hourly series. | see folder readme / manifest | 2026-10-19T14:48:13Z |

## Eight impact areas and what actually feeds them

| Area | Evidence in the warehouse | Live hourly series? |
|---|---|---|
| Physical | Open-Meteo temperature and rain; flood-exposure female population and facility counts | Weather yes. Flood exposure is a snapshot. |
| Environmental | Soil moisture and rain; GloFAS discharge | Soil moisture rides the hourly weather fetch. Discharge is daily. |
| Producers | No accepted crop-loss series. Impact endpoint is limited evidence. | No |
| Economic | No hourly CPI or loss series. Impact endpoint is limited evidence. | No |
| Public health | Heat and humidity, hospital travel-access snapshot. Not patient records. | Heat/humidity yes. Hospitals no. |
| Infrastructure | OSM facility and road-exposure snapshot. Geofabrik MD5 watch. | No hourly infrastructure observations. |
| Social | PBS district aggregates. | No |
| Emergency | PMD danger levels, NDMA/PMD documents, GloFAS daily discharge. Homepage HTML is not parsed into alerts. | Discharge daily. Official warnings are files, not a live alert feed. |

## Gaps

- NASA POWER, Copernicus imagery, and OpenAQ are not connectors in this repository.
- Official NDMA and PMD warning numbers are not extracted from HTML or PDF.
- A missing source is represented as limited evidence or a stale fetch, not as a filled time series.
- The 1440-minute expectation for PBS is the homepage re-check window used for freshness, not a claim that the census is published every day.
