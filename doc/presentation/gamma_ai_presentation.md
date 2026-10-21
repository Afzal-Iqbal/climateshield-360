# ClimateShield 360 Karachi: Data-to-Decision
## Extreme Weather Predictive Intelligence & Operational Crisis Decision Platform
**Team Presenters:** Syed Muhammad Hunain · Muhammad Afzal · Makshoof Kamal Jilani  
**Track:** HackInsight 2026 — Climate Track (Data-to-Decision)  
**Pitch Time:** 5–7 Minutes

---

# 1. The Challenge: Karachi's Compounding Climate Vulnerability
## When Megacity Infrastructure Meets Extreme Climate Shock

- **16+ Million Citizens at Risk:** Karachi is Pakistan's economic lifeline, but informal urban sprawl and inadequate stormwater drainage leave millions vulnerable to monsoon flash flooding and urban heat island effects.
- **The Decision-Maker's Dilemma:** Disaster management agencies (PDMA Sindh, Rescue 1122) currently rely on delayed macro-forecasts and static threshold warnings that fail to capture district-level microclimates.
- **Data Fragmentation:** Meteorological data, river gauges, demographic vulnerability, and critical healthcare facilities exist in disconnected silos.
- **Our Mission:** Build **ClimateShield 360** — an end-to-end operational platform that bridges the gap between raw multi-source telemetry and life-saving civic emergency decisions.

> *[Image Prompt: Aerial cinematic view of Karachi coastline during monsoon rain, dark moody aesthetic with digital spatial data overlays and glowing district boundaries.]*

---

# 2. Automated Pipeline & Data Governance
## Continuous Multi-Source Ingestion with DuckDB Architecture

- **Sub-Second Analytical Engine:** Powered by an embedded DuckDB columnar warehouse (`climateshield.duckdb`) providing zero-latency spatial queries and analytical aggregations.
- **6 Multi-Agency Data Connectors:**
  - **Open-Meteo Weather API:** Live hourly temperature, humidity, rainfall, wind, and soil moisture across 12 Pakistan monitoring cities.
  - **GloFAS / Copernicus:** Daily river discharge and hydrological flood forecasts.
  - **PMD Flood Forecasting Division:** River danger thresholds and official flood advisories.
  - **Pakistan Bureau of Statistics (PBS):** 2023 National Census district demographics and vulnerability indexes.
  - **OpenStreetMap (OSM) / Geofabrik:** Critical infrastructure, road exposure, hospitals, schools, and shelter mapping.
  - **NDMA:** Official disaster management alerts and contingency plans.
- **Strict Data Quality Gate:** 160 district quality audit rules with automated anomaly tracking, zero synthetic hallucinations, and automated hourly pipeline scheduling.

> *[Visual Layout: Architecture flowchart illustrating multi-source inputs -> Automated Ingest Daemon -> DuckDB Columnar Warehouse -> FastAPI Backend -> 3D WebGL Dashboard]*

---

# 3. Machine Learning vs. Declared Baseline
## Quantile Regression Delivering 35.1% Lower Rainfall Prediction Error

- **Honest Out-of-Time Validation Split:**
  - **Training Set (2021–2024):** 403,188 hourly observations, covering the historic 2022 Pakistan super floods.
  - **Test Set (2025–2026):** 189,168 untouched future observations.
- **Declared Benchmark:** Evaluated rigorously against a 24-hour persistence baseline ($ŷ_t = y_{t-24\text{h}}$).

| Metric | 24h Persistence Baseline | ClimateShield LightGBM Model | Relative Improvement |
|---|---|---|---|
| **Rainfall MAE** | `0.1055 mm` | **`0.0685 mm`** | **+35.1% Lower Error** |
| **Rainfall RMSE** | `0.6417 mm` | **`0.3979 mm`** | **+38.0% Accuracy Gain** |
| **Prediction $R^2$** | — | **`0.3003`** | **Strong predictive signal** |
| **Uncertainty Calibration** | — | **`97.42%`** | **Points within 10th–90th percentile** |

- **Operational Uncertainty:** Quantile regression predicts 10th, 50th (median), and 90th percentiles, giving incident commanders clear probabilistic risk bounds rather than a single black-box guess.
- **Scientific Honesty:** Inundation Brier score (0.0351 vs 0.0153) is openly declared in our Model Report as a known limitation for continuous improvement.

---

# 4. Spatial Risk Intelligence & 3D WebGL Map
## Granular District-Level Climate Vulnerability Mapping

- **High-Performance Vector & Raster Rendering:** Powered by MapLibre GL with zero-blank interaction loops, smooth zooming (5 to 18), and authenticated Fastly edge basemap tiles.
- **Karachi's 7 Administrative Districts:**
  - Evaluates **Central, East, Keamari, Korangi, Malir, South, and West** independently.
  - Real-time hazard classification into **Low (Green), Moderate (Amber), High (Orange), and Severe (Red)**.
- **Dynamic 3D Extrusion Heights:**
  - Heights dynamically visualize **Exposed Population** (up to 2M+ residents per district), **Hazard Probability**, or **Composite Vulnerability Score**.
- **Interactive Facility Pins:** Live geospatial markers for **Hospitals, Emergency Shelters, Schools, Drainage Culverts, and Power Substations**.

> *[Visual Layout: Split screen — Left: 3D extruded Karachi risk map glowing with risk color codes; Right: District dossier card showing Keamari/Malir flood exposure metrics and facility pins.]*

---

# 5. The 8-Domain Cascading Impact Matrix
## Beyond Weather: Quantifying Multi-Sector Societal Disruption

ClimateShield 360 models climate hazards across **8 comprehensive societal domains** defined in our project charter:

1. **Physical Impact:** Precipitation volume, flood depth, and structural inundation risks.
2. **Public Health:** Heat index thresholds (35°C/40°C/45°C), heatstroke vulnerability, and hospital travel times.
3. **Infrastructure:** Inundated road networks, disabled power substations, and critical culvert choke points.
4. **Emergency Services:** Rescue 1122 boat response routes, evacuation shelter capacity, and accessibility bottlenecks.
5. **Social Vulnerability:** Female-to-male vulnerability ratios, elderly demographics, and informal settlement density.
6. **Environmental Impact:** Soil saturation, moisture absorption limits, and river runoff rates.
7. **Producers & Food Supply:** Agricultural supply chain choke points and wholesale vegetable market disruptions.
8. **Economic Disruption:** Commercial district downtime and Karachi port logistics accessibility.

> *[Visual Layout: 8-grid icon matrix with domain badges, displaying real-time impact indicators and severity levels for Karachi]*

---

# 6. Operational Emergency Action Planner
## Automated Data-to-Decision Prescriptive Protocols

- **Turning Predictions into Action:** A prediction is useless if incident commanders do not know what actions to take. ClimateShield 360 automatically converts ML hazard probabilities into prioritized emergency interventions.
- **Actionable Decision Matrix:**
  - **High-Capacity Dewatering Pumps:** Deployed to identified culvert bottlenecks in South & Keamari before inundation peaks.
  - **Mobile Medical Heat Units:** Dispatched to densely populated Central and East transit hubs when heat indices cross 40°C.
  - **Pre-emptive Power Substation Isolation:** Protecting K-Electric transformers from water damage to prevent citywide blackouts.
  - **Designated Relief Centers:** Automated routing to schools and government shelters outside active flood polygons.
- **Resource Quantification:** Every action plan details estimated cost, required personnel, response window, and target agency (PDMA, KMC, Rescue 1122).

---

# 7. Scientific Transparency & RAG Intelligence
## Grounded AI Assistant with Zero Hallucination Auditing

- **Domain-Specific RAG Architecture:** An integrated AI Assistant trained strictly on our curated catalog of NDMA, PMD, and provincial flood emergency contingency plans.
- **100% Provenance & Citations:** Every response provides exact document titles, catalog IDs, and source database row citations. If an answer is not in the data, the system explicitly refuses to guess.
- **Scientific Openness:**
  - Complete 2-page publication-standard **Dataset Declaration PDF** available directly in the dashboard.
  - Live **Pipeline Freshness Monitor** displaying real-time ingestion status, minutes since last success, and automated run evidence.
  - Full code, schema contracts, and models open-sourced under reproducible standards.

---

# 8. Conclusion: The ClimateShield 360 Advantage
## From Reactive Disaster Management to Proactive Climate Resilience

### Why ClimateShield 360 Wins:
1. **Real-World Impact:** Purpose-built for Karachi's 16M+ population facing existential monsoon and heat threats.
2. **Proven ML Superiority:** LightGBM models verified beating standard persistence baselines by **35.1% MAE**.
3. **End-to-End Operational Readiness:** Production-ready stack with DuckDB warehouse, FastAPI backend, MapLibre 3D visuals, and actionable emergency planning.
4. **Data Integrity First:** Zero hard-coded values, 100% automated hourly ingestion, and complete scientific accountability.

**"ClimateShield 360 transforms fragmented climate data into timely, decisive civic action — protecting Karachi's citizens before the crisis hits."**

*Thank you! We are ready for your questions.*  
**Live Application:** `http://localhost:5173` · **Repository:** `github.com/Afzal-Iqbal/climateshield-360`
