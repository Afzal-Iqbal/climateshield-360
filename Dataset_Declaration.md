# Dataset Declaration

**Team Name:** [Your Team Name]  
**Track:** Climate (Rainfall & Urban Road Inundation Risk)  
**Submission Deadline:** Monday, 19 October 2026, 12:00 PM PKT  

---

### Source 1 (Primary Real-Time & Historical Weather & Hydrological APIs)
* **Name:** Open-Meteo Historical Weather, Forecast & GloFAS Hydrological Flood APIs
* **Publisher:** Open-Meteo GmbH & Copernicus Emergency Management Service
* **URL:** https://open-meteo.com/en/docs/historical-weather-api | https://flood-api.open-meteo.com
* **Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0)
* **Update Frequency:** Hourly real-time updates + continuous historical archive (2021–2026)
* **Variables Extracted:** `temperature_2m` (°C), `relative_humidity_2m` (%), `dew_point_2m` (°C), `precipitation` (mm), `rain` (mm), `surface_pressure` (hPa), `soil_moisture_0_to_7cm` (m³/m³), `soil_moisture_7_to_28cm` (m³/m³), `wind_speed_10m` (km/h), `wind_direction_10m` (°), `cloud_cover` (%), `weather_code` (WMO), and `river_discharge` (m³/s).

---

### Source 2 (OpenStreetMap Spatial Infrastructure & Road Connectivity)
* **Name:** OpenStreetMap / Geofabrik GIS & HeiGIT HDX Risk Assessment Indicators
* **Publisher:** OpenStreetMap Foundation, Geofabrik GmbH, HOT OSM & HeiGIT / UN OCHA
* **URL:** https://download.geofabrik.de/asia/pakistan.html | https://data.humdata.org/dataset/pakistan---risk-assessment-indicators
* **Licence:** Open Database License (ODbL)
* **Update Frequency:** Continuous community updates & periodic official humanitarian releases
* **Attributes Extracted:** Nationwide road networks, emergency healthcare facilities & hospitals (GeoJSON), populated places & settlements, district Rural Access Index (RAI - % population with all-season road connectivity within 2km), multi-tier flood return period exposure (RP10, RP50, RP100), hospital travel access times, and evacuation buffer capacity across all 160 Pakistani districts.

---

### Source 3 (Government Hazard Advisories, Bulletins & Early Warning Triggers)
* **Name:** National Disaster Management Authority (NDMA) & PMD Flood Forecasting Division
* **Publisher:** NDMA Pakistan & Pakistan Meteorological Department (PMD), Government of Pakistan
* **URL:** https://ndma.gov.pk | https://ffd.pmd.gov.pk
* **Licence:** Official Public Domain / Government Open Public Release
* **Update Frequency:** Daily flood bulletins, real-time weather advisories & multi-year seasonal strategies
* **Attributes Extracted:** Official monsoon advisories (Aug–Oct 2026), Pakistan National Anticipatory Action Strategy (Early Warning & Trigger Systems 2026–2030), daily river discharge bulletins, and river flood stage danger limits (Low, Medium, High, Very High) across 19 critical stations on Indus, Jhelum, Chenab, Ravi, and Kabul river basins.

---

### Source 4 (National Demographic, Agricultural & Socioeconomic Baselines)
* **Name:** Pakistan Bureau of Statistics (PBS) Official Census & Economic Indicators
* **Publisher:** Pakistan Bureau of Statistics, Ministry of Planning Development & Special Initiatives
* **URL:** https://www.pbs.gov.pk
* **Licence:** Government Open Statistical Release
* **Update Frequency:** Decennial / periodic digital census releases, weekly SPI price indices & quarterly national accounts
* **Attributes Extracted:** 7th Digital Population & Housing Census 2023 district summaries (Punjab & Sindh flashcards), 160-district population demographics, urban/rural distribution, vulnerability & dependency ratios, Integrated Agricultural Census (IAC) country report, and Consumer Price Index (CPI / SPI) food/energy price indicators.

---

### Which sources are not on the track list, and why are they credible?
**Sources 2, 3, and 4 (OpenStreetMap/HDX, NDMA/PMD, and PBS)** are not listed on the default Climate track benchmark list:
1. **OpenStreetMap / Geofabrik & HDX (HeiGIT):** Maintained by UN OCHA’s Humanitarian Data Exchange and Heidelberg University, serving as the international gold standard for spatial infrastructure and emergency road accessibility.
2. **NDMA & PMD Flood Forecasting Division:** Constitutional federal authorities responsible for disaster risk reduction and river streamflow monitoring in Pakistan, providing official ground-truth flood stage warnings.
3. **Pakistan Bureau of Statistics (PBS):** Pakistan’s national statistical authority providing certified demographic censuses, economic indicators, and district vulnerability baselines.

---

### Expected Volume
* **Meteorological Heat & Rainfall Data:** Continuous hourly observations across **12 major Pakistani metropolitan areas and economic hubs** (Lahore, Karachi, Rawalpindi, Islamabad, Faisalabad, Multan, Peshawar, Quetta, Hyderabad, Sukkur, Gilgit, Gwadar) spanning nearly 6 full years (2021–2026), capturing the historic 2022 super floods:
  * **Total Ingested Volume:** **592,176 hourly records** *(Exceeds the 50,000-row requirement by over 11x).*
* **Hydrological Streamflow Data:** **10,585 daily river discharge readings** across 5 critical river basins (Ravi, Indus, Kabul, Soan, Malir).
* **Spatial & Road Infrastructure:** Full nationwide coverage across **160 administrative districts** (Rural Access Index, road inundation exposure, healthcare travel buffers, and GeoJSON hospital/settlement footprints).
* **Official Hazard Reports & Census Baselines:** Multi-year NDMA anticipatory action triggers, PMD river danger limits, and 2023 Digital Census district demographic datasets.

---

### Why this data fits the problem and the primary user
* **Primary Users:** City Traffic Police departments (Lahore, Karachi, Rawalpindi) and Rescue 1122 emergency dispatchers.
* **Operational Fit:**
  1. **Meteorological Saturation (Open-Meteo):** Real-time and forecasted precipitation, rain intensity, and antecedent soil moisture determine surface runoff volume.
  2. **Hydrological Backflow (GloFAS & PMD):** Identifies when main rivers (Ravi, Indus, Malir, Soan) exceed high-flood thresholds, choking municipal storm outfalls.
  3. **Spatial Vulnerability (OpenStreetMap & HDX):** Pinpoints road links lacking all-season paving (low RAI) and routes cut off from hospitals.
  4. **Demographic & Trigger Context (NDMA & PBS):** Maps population density and institutional early warning triggers to deploy de-watering pumps and enforce traffic diversions 2 to 4 hours before severe road submergence.

---

### Baseline you declare (Fixed before results)
* **Precipitation Baseline:** 24-hour persistence model:
  **ŷ_t = y_{t - 24h}**  
  *(The predicted precipitation at hour t equals the observed precipitation at the same hour on the previous day).*

* **Road Condition Baseline:** Static heuristic rule:
  * **Waterlogging Risk / Caution:** Triggered if hourly rainfall ≥ 2.5 mm/hr.
  * **Normal / Passable:** Triggered when hourly rainfall < 2.5 mm/hr.

* **Success Criterion:** The trained predictive machine learning models (LightGBM / XGBoost Regressor and Classifier) must achieve at least a **20% improvement** in Mean Absolute Error (MAE) and Brier Score over the declared persistence baseline on an untouched future temporal evaluation set (2025–2026).
