# Eight-Impact Domain Contract Mapping

This document specifies the exact mapping between the Eight Municipal/Provincial Impact Domains and the underlying DuckDB warehouse tables, columns, quality decisions, and limitations for ClimateShield 360 Karachi.

---

## Domain Mappings Overview

| Impact Domain | Primary Indicators | DuckDB Source Tables & Columns | Time Series Available | Evidence Level | Default Limitations / Caveats |
|---|---|---|---|---|---|
| **Physical** | Weather extremes & Flood return period exposure | `weather_city_stats` (`extreme_heat_hours_ge_40c`, `max_temperature_c`, `rainy_hours_count`), `osm_flood_exposure` (`RP10_female_pop_30cm`, `RP50_female_pop_30cm`, `RP100_female_pop_30cm`, `RP10_education_30cm_count`, `RP10_hospitals_30cm_count`) | Yes (Historical Extremes / Daily series from `weather_hourly`) | Measured / Model-derived | Flood models use HeiGIT/HDX 30cm depth return period simulations; does not account for micro-scale localized culvert blockage or temporary pumping operations. |
| **Environmental** | Soil moisture saturation & Precipitation totals | `weather_hourly` (`soil_moisture_0_to_7cm_m3m3`, `soil_moisture_7_to_28cm_m3m3`, `precipitation_mm`, `rain_mm`), `weather_city_stats` (`total_rainfall_mm`, `rainy_hours_count`) | Yes (Continuous hourly/daily series of moisture & precipitation) | Measured | Soil moisture reflects Copernicus ERA5-Land reanalysis (0.1° grid cell). Dense impervious urban zones exhibit near-zero infiltration, diverting surface volume directly to open storm drains (nullahs). |
| **Producers** | Crop harvest impact & agricultural flood damage | *None / Excluded* (`quality_logs` rule: `EXCLUDE_ALL_ZERO_COLUMNS` on `crop_flood_layer_all_zero_source_unavailable`) | No | Limited Evidence | Crop data and agricultural flood damage were excluded by Data Quality Agent checks because raw input layers were all-zero across all 160 districts. Per Rule 1 and Rule 2, no numbers or synthetic figures are displayed. |
| **Economic** | Municipal loss, commercial disruption & financial damages | *None / Excluded* (No direct loss currency or business disruption records present in warehouse) | No | Limited Evidence | Municipal and macro-economic fiscal damage telemetry is currently unlinked in the warehouse layer. Per Rule 1 ("Never hard-code outputs") and Rule 2 ("No synthetic data presented as real"), this domain presents an explicit "Limited evidence" state without fabricated numbers. |
| **Public Health** | Hospital & primary healthcare physical access | `osm_hospital_access` (`access_pop_hospitals_30min`, `access_pop_hospitals_1h`, `access_pop_hospitals_2h`, `access_pop_primary_healthcare_30min`), `health_facilities` | No | Indicator-based | Restricted strictly to physical travel time buffers under normal transit conditions. **CRITICAL:** No epidemiological or public health outcome records (e.g. heatstroke hospital admissions, morbidity, or mortality) are present in the warehouse. |
| **Infrastructure** | Road connectivity & emergency healthcare access buffers | `osm_rural_access` (`RAI_total_pop`, `rural_access_total_pop`, `rural_access_children_u5`, `rural_access_elderly`, `rural_access_dependency_ratio`), `osm_hospital_access` (`access_pop_education_5km`, `access_pop_hospitals_30min`) | No | Indicator-based | Pavement passability metrics are derived from OpenStreetMap road classifications and World Bank Rural Access Index (RAI) methodology. Real-time structural degradation, waterlogging depths, and bridge scour are unmonitored. |
| **Social** | Population demographics & age dependency vulnerability | `pbs_district_demographics` (`total_pop`, `female_pop`, `children_u5`, `elderly`, `pop_u15`, `wra_pop`, `dependency_ratio`), `pbs_district_rural_urban` (`rural_pop_perc`, `total_pop_rural`) | No | Indicator-based | Baseline figures from the 7th Digital Population & Housing Census 2023 (Pakistan Bureau of Statistics). Micro-settlement informal migrant populations without national identity documentation may be undercounted. |
| **Emergency Response** | Emergency response facilities & dual-use relief capacity | `osm_emergency_facilities` (`hospitals_count`, `primary_healthcare_count`, `education_count`), `health_facilities` (facility count) | No | Indicator-based | Telemetry reflects verified geo-located infrastructure points. Does not measure real-time operational staffing, emergency supply inventories (e.g., fuel generators, rescue boats, dewatering pumps), or emergency shelter intake capacity. |

---

## District and City Resolvers

- **City Filter (`city`)**: Filters `weather_hourly` and `weather_city_stats` by city name (`Karachi`, `Lahore`, `Faisalabad`, `Rawalpindi`, `Islamabad`, `Multan`, `Peshawar`, `Quetta`, `Hyderabad`, `Sukkur`, `Gilgit`, `Gwadar`). Defaults to `Karachi`.
- **District Filter (`district_id`)**: Matches `ADM2_PCODE` (e.g. `PK721`, `PK702`, `PK704`, `PK712`, `PK714`, `PK729`) or zone ID (e.g. `KHI-SOUTH`, `KHI-EAST`, `KHI-CENTRAL`, `KHI-MALIR`, `KHI-KORANGI`, `KHI-WEST`, `KHI-KEAMARI`) mapped via `district_name_lookup` and `zones`. If omitted, aggregates across all districts of the selected city or division.

---

## Rules Compliance

1. **Rule 1 (No hard-coded outputs)**: Every value is retrieved live from DuckDB tables (`weather_hourly`, `weather_city_stats`, `osm_flood_exposure`, `osm_hospital_access`, `osm_rural_access`, `pbs_district_demographics`, `osm_emergency_facilities`).
2. **Rule 2 (No synthetic data presented as real)**: Producers and Economic domains have no validated rows in the warehouse and report `supported_data: false`, `indicators: []`, `time_series: null`, and `evidence_level: "limited"`. The UI displays a clear "Limited evidence" state with zero placeholder numbers.
3. **Rule 3 (UTC stored; PKT displayed)**: Timestamps are stored and transmitted in UTC with PKT offsets for display.
4. **Rule 4 (Accessible risk colors and text labels)**: Evidence tags ("Measured", "Indicator-based", "Limited") and risk classifications use accessible styling with accompanying textual badges.
