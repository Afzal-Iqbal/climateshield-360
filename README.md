<div align="center">

  <img src="doc/assets/logo.jpeg" alt="ClimateShield 360 Logo" width="380" style="border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.25);" />

  # 🛡️ ClimateShield 360
  ### Karachi Extreme Weather & Crisis Platform
  **From 592,000+ Verified Observations to Operational Municipal Action**

  [![HackInsight 2026](https://img.shields.io/badge/HackInsight%202026-Data--to--Decision-0ea5e9?style=for-the-badge&logo=target)](https://github.com)
  [![Track](https://img.shields.io/badge/Track-Climate%20%26%20Crisis%20Analytics-10b981?style=for-the-badge&logo=leaflet)](doc/Dataset_Declaration.md)
  [![Tests](https://img.shields.io/badge/Backend%20Tests-82%2F82%20Passing-emerald?style=for-the-badge&logo=pytest)](backend/tests)
  [![ML Baseline](https://img.shields.io/badge/LightGBM%20vs%20Baseline-%2B35.1%25%20Lower%20MAE-blueviolet?style=for-the-badge&logo=scikitlearn)](doc/MODEL_REPORT.md)
  [![Warehouse](https://img.shields.io/badge/Warehouse-DuckDB%201.5.6-f59e0b?style=for-the-badge&logo=duckdb)](pipeline/data/processed/climateshield.duckdb)
  [![Status](https://img.shields.io/badge/Pipeline%20Status-LIVE%20%E2%80%A2%20Hourly-22c55e?style=for-the-badge&logo=apacheairflow)](doc/HOURLY_INGESTION_REPORT.md)
  [![Summary PDF](https://img.shields.io/badge/Summary.pdf-1--Page%20Executive%20PDF-red?style=for-the-badge&logo=adobeacrobatreader)](Summary.pdf)
  [![License](https://img.shields.io/badge/License-MIT-gray?style=for-the-badge)](LICENSE)

  <p align="center">
    <b>An end-to-end early warning and anticipatory emergency response system designed for Karachi municipal dispatchers, traffic wardens, and disaster relief authorities.</b>
  </p>

  <p align="center">
    <a href="#-quickstart-for-hackinsight-judges"><b>⚡ Judge Quickstart</b></a> •
    <a href="#-the-karachi-problem-statement"><b>🌊 The Problem</b></a> •
    <a href="#-system-architecture"><b>🏗️ Architecture</b></a> •
    <a href="#-interactive-ui-gallery"><b>📸 UI Gallery</b></a> •
    <a href="#-ml-modeling-vs-declared-baseline"><b>🤖 ML Benchmarks</b></a> •
    <a href="#-hackinsight-deliverables-compliance-matrix"><b>📋 Rubric Matrix</b></a> •
    <a href="#-team-credentials"><b>👥 The Team</b></a>
  </p>

</div>

---

## 👥 The Team

Submitted for **HackInsight 2026: Data-to-Decision** (Climate & Infrastructure Analytics Track).

| Member | Role & Responsibilities | Key Deliverables Led |
|---|---|---|
| **Syed Muhammad Hunain** | Team Lead & Full-Stack System Architect | Spatial 3D Risk Map, MapLibre GL Integration, FastAPI Architecture, Jury Presentation |
| **Muhammad Afzal** | Lead Data Engineer & ML Scientist | DuckDB Columnar Warehouse, LightGBM Quantile Models, 24h Baseline Benchmarking, Ingestion Daemon |
| **Makshoof Kamal Jilani** | Decision Systems & Domain Specialist | 8 Sectoral Impact Matrices, Emergency Action Planner, Responsible AI & Fairness Audit |

---

## 🌊 The Karachi Problem Statement

Karachi, a coastal megacity of over 17 million people, faces recurring dual climate shocks: **lethal monsoon urban waterlogging** and **severe extreme heatwaves**. 

- **The Choke Points**: Monsoonal downpours quickly overwhelm neglected drainage nullahs (Lyari and Malir river basins), submerging underpasses, isolating industrial hubs (Korangi, SITE), and paralyzing arterial road corridors under 2 to 4 feet of water.
- **The Information Vacuum**: Traditional meteorological forecasts provide coarse regional summaries 24 hours too late. Municipal authorities and Traffic Police typically react only *after* commuter vehicles are submerged and arterial grids are locked.
- **The Solution**: **ClimateShield 360** bridges the data-to-decision gap by integrating upstream GloFAS river discharge, localized Open-Meteo precipitation, and OpenStreetMap infrastructure into a 4-tier **Road Inundation Risk Index**. This gives emergency dispatchers a **2 to 4-hour tactical advance window** to pre-deploy dewatering suction pumps and position traffic diversion cones before choke points submerge.

---

## 🏗️ System Architecture

ClimateShield 360 follows a strict **Truth-in-Data** architectural pipeline:

```mermaid
flowchart TD
    subgraph S["1. Multi-Source Ingestion Layer"]
        A1["Open-Meteo API (Hourly Weather & Heat Index)"]
        A2["GloFAS API (River Discharge & Runoff)"]
        A3["NDMA & PMD Bulletins (Flood Advisories)"]
        A4["PBS Census 2023 (Demographics & Urban Density)"]
        A5["OpenStreetMap (Emergency Facilities & Road Network)"]
    end

    subgraph Q["2. Data Quality Agent (Pandera)"]
        B1["Schema Validation & Boundary Checks"]
        B2["Fix / Fill / Flag Decision Engine"]
        B3["Audit Log & Quality Metadata Tracking"]
    end

    subgraph W["3. Analytical Warehouse (DuckDB 1.5.6)"]
        C1[("Raw Parquet Storage")]
        C2[("Cleaned Intermediate Parquet")]
        C3[("Processed Gold Warehouse (climateshield.duckdb)")]
    end

    subgraph M["4. Predictive ML Engine"]
        D1["LightGBM Quantile Regressors (Q10, Q50, Q90)"]
        D2["Declared Baseline (24h Persistence)"]
        D3["Fairness Audit across 12 Pakistani Cities"]
    end

    subgraph D["5. Decision Support & Delivery"]
        E1["FastAPI Async Engine (Port 8002)"]
        E2["Vite + React SPA Dashboard (Port 5173)"]
        E3["3D Spatial Risk Map (MapLibre + CARTO Dark)"]
        E4["Insight Agent (RAG with Gold Table Citations)"]
    end

    S --> Q
    Q --> W
    W --> M
    M --> D
    W --> D
```

---

## 📸 Interactive UI Gallery

The ClimateShield 360 interface was designed for high-stress municipal operations rooms, featuring an eye-friendly dark tactical theme and instant-load rendering.

### 1. 3D Spatial Risk Map (`/risk-map`)
*Planimetric district polygons, real-time flood inundation severity, hospital markers, and road choke points.*
![Spatial Risk Map](frontend/design/risk_map_climateshield_360_karachi/screen.png)

### 2. Executive Overview Dashboard (`/overview`)
*Citywide rainfall trajectory, active weather warnings, top vulnerable zones, and live crisis radar.*
![Executive Overview](frontend/design/overview_climateshield_360_karachi/screen.png)

### 3. Sectoral Impact Matrix (`/eight-impacts`)
*Granular impact analysis across Physical, Transport, Health, Energy, Economic, Agriculture, Social, and Emergency sectors.*
![Sectoral Impacts](frontend/design/eight_impacts_climateshield_360_karachi/screen.png)

### 4. Data Quality & Trust Radar (`/data-quality`)
*Full transparency into Pandera validation results, fix/fill/flag audit records, and sensor health.*
![Data Quality Radar](frontend/design/data_quality_climateshield_360_karachi/screen.png)

### 5. Automated Pipeline Freshness (`/system-health`)
*Live daemon execution heartbeats, lag monitoring, and Prefect run history verification.*
![Pipeline Freshness](frontend/design/pipeline_freshness_climateshield_360_karachi/screen.png)

### 6. Grounded Insight Assistant (`/ai-assistant`)
*Evidence-based natural language crisis briefing citing exact gold warehouse row IDs.*
![Insight Assistant](frontend/design/insight_agent_climateshield_360_karachi/screen.png)

---

## 🤖 ML Modeling vs Declared Baseline

In strict compliance with **Deliverable 3** of the HackInsight Guide, our predictive model was evaluated against an honest, pre-declared baseline using a strict time-based split.

### Model Specification
- **Declared Baseline**: 24-hour persistence ($ŷ_t = y_{t-24\text{h}}$)
- **Model**: LightGBM Multi-Quantile Regressor ($Q_{10}, Q_{50}, Q_{90}$)
- **Training Set**: 2021-01-01 to 2024-12-31 (**403,188 observations**, captures the devastating 2022 super floods)
- **Test Set**: 2025-01-01 to 2026-10-18 (**189,168 unseen observations**)

### Evaluation Results

| Metric | Declared 24h Baseline | LightGBM Model | Relative Gain | Hackathon Target |
|---|:---:|:---:|:---:|:---:|
| **Test Rainfall MAE** | `0.1055 mm` | **`0.0685 mm`** | **`+35.1% Lower Error`** | $\ge 20\%$ Improvement |
| **Prediction Interval Coverage ($Q_{10} \to Q_{90}$)** | *N/A (Point)* | **`97.42%`** | **Calibrated Uncertainty** | $\ge 80\%$ Coverage |
| **Inference Latency per City** | *N/A* | **`< 1.2 ms`** | **Ultra-Fast** | $< 100\text{ ms}$ |

### Model Benchmark & Group Fairness Artifacts
<div align="center">
  <img src="pipeline/reports/figures/baseline_vs_model_mae.png" width="48%" alt="Baseline vs Model MAE" />
  <img src="pipeline/reports/figures/fairness_by_city.png" width="48%" alt="Fairness by City" />
</div>

*Full interactive training code and reproducible evaluation tables are available in [`doc/step3_train_model.ipynb`](doc/step3_train_model.ipynb) and [`doc/MODEL_REPORT.md`](doc/MODEL_REPORT.md).*

---

## 📋 HackInsight Deliverables Compliance Matrix

Every deliverable mandated in `hackathonguide.pdf` (Chapters 1–15) is fully implemented, verified, and accessible:

| Guide Section | Official Deliverable | Repository Implementation & Evidence | Status |
|:---:|---|---|:---:|
| **§ 1 & 6** | **Deliverable 1: Data Acquisition & Warehouse** | • Multi-source raw/cleaned/processed Parquet layers<br>• DuckDB warehouse: [`pipeline/data/processed/climateshield.duckdb`](pipeline/data/processed/climateshield.duckdb)<br>• Verified manifest: [`pipeline/data/hourly_manifest.csv`](pipeline/data/hourly_manifest.csv)<br>• Dataset Declaration PDF: [`doc/Dataset_Declaration.pdf`](doc/Dataset_Declaration.pdf) | **VERIFIED** |
| **§ 7** | **Deliverable 2: Data Quality Agent** | • Pandera validation schemas in [`pipeline/climateshield/quality/`](pipeline/climateshield/quality/)<br>• Automated fix/fill/flag decision rules<br>• Logged audit trail in `quality_log` table<br>• Audit report: [`doc/PROJECT_AUDIT.md`](doc/PROJECT_AUDIT.md) | **VERIFIED** |
| **§ 8** | **Deliverable 3: Predictive ML Model** | • LightGBM quantile regression ($Q_{10}, Q_{50}, Q_{90}$)<br>• **35.1% MAE improvement** over declared 24h baseline<br>• 97.42% empirical coverage & 12-city fairness breakdown<br>• Notebook: [`doc/step3_train_model.ipynb`](doc/step3_train_model.ipynb)<br>• Model report: [`doc/MODEL_REPORT.md`](doc/MODEL_REPORT.md) | **VERIFIED** |
| **§ 10** | **Deliverable 4: Insight Agent (RAG)** | • Grounded RAG implementation: [`backend/routers/insight.py`](backend/routers/insight.py)<br>• Cites specific warehouse row IDs; falls back to `"I don't know"`<br>• RAG evaluation report: [`doc/RAG_REPORT.md`](doc/RAG_REPORT.md) | **VERIFIED** |
| **§ 11** | **Deliverable 5: Automated Pipeline & Dashboard** | • Hourly ingestion daemon: `climateshield ingest-hourly`<br>• Real-time Vite SPA dashboard with 3D Risk Map on port 5173<br>• Unedited Prefect history: [`doc/prefect_runs.csv`](doc/prefect_runs.csv)<br>• Ingestion audit: [`doc/HOURLY_INGESTION_REPORT.md`](doc/HOURLY_INGESTION_REPORT.md) | **VERIFIED** |
| **§ 9** | **Optimization Log** | • Complete analysis of storage, model, and frontend optimizations: [`doc/OPTIMIZATION_LOG.md`](doc/OPTIMIZATION_LOG.md) | **VERIFIED** |
| **§ 12** | **Business Model & Value** | • Payer strategy (PPCP), municipal value, and cost structure: [`doc/BUSINESS_MODEL.md`](doc/BUSINESS_MODEL.md) | **VERIFIED** |
| **§ 13 & 15** | **Summary.pdf (1-Page Executive Summary)** | • Exactly 1-page executive summary PDF: [`doc/Summary.pdf`](doc/Summary.pdf) (also at [`Summary.pdf`](Summary.pdf)) | **VERIFIED** |
| **§ 13** | **Presentation Decks** | • Copy-paste Gamma AI deck: [`doc/presentation/gamma_ai_presentation.md`](doc/presentation/gamma_ai_presentation.md)<br>• Visual Visme AI deck: [`doc/presentation/visme_ai_presentation.md`](doc/presentation/visme_ai_presentation.md)<br>• Timed 5–7 min speaker script: [`doc/presentation/speaker_script.md`](doc/presentation/speaker_script.md) | **VERIFIED** |
| **§ 14** | **Responsible AI & AI Use Log** | • Complete, honest audit of all agent assistance: [`doc/AI_Use_Log.md`](doc/AI_Use_Log.md) | **VERIFIED** |

---

## ⚡ Quickstart for HackInsight Judges

Judges can launch and evaluate the complete ClimateShield 360 application locally in **under 2 minutes**.

### Prerequisites
- Python 3.10+ (tested on Python 3.12)
- Node.js 18+ & npm
- Linux, macOS, or Windows WSL2

### 1. Start the FastAPI Backend
```bash
# From repository root
PYTHONPATH=backend:src .venv/bin/uvicorn main:app --port 8002 --host 127.0.0.1
```
*Backend initializes read-only DuckDB connection at `http://127.0.0.1:8002`.*

### 2. Start the Frontend Dashboard
```bash
# In a second terminal
cd frontend
npm install
npm run dev -- --port 5173
```
*Open **`http://localhost:5173/`** in your browser to view the live dashboard.*

### 3. Verify System Health & Tests
```bash
# 1. Run all 82 backend test cases (100% pass)
PYTHONPATH=backend:src .venv/bin/pytest backend/tests

# 2. Check live backend API status
curl -s http://127.0.0.1:8002/api/health

# 3. Trigger a manual hourly ingest cycle
PYTHONPATH=pipeline .venv/bin/python -m climateshield ingest-hourly --once
```

---

## 📁 Repository Directory Structure

```
climateshield-360/
├── backend/                  # FastAPI backend server (port 8002)
│   ├── routes/               # API route controllers (overview, map, forecast, etc.)
│   └── tests/                # 82 automated pytest test suites
├── doc/                      # Official HackInsight submission documentation
│   ├── assets/               # Brand assets and logos (logo.jpeg)
│   ├── presentation/         # Gamma AI, Visme AI, and speaker scripts
│   ├── Dataset_Declaration.* # Gate 1 Data Declaration (PDF + MD)
│   ├── MODEL_REPORT.md       # Model vs Baseline validation report
│   ├── HOURLY_INGESTION_REPORT.md # Hourly ingestion performance audit
│   ├── OPTIMIZATION_LOG.md   # Chapter 9: Optimization & efficiency log
│   ├── BUSINESS_MODEL.md     # Chapter 12: Business model & municipal sustainability
│   ├── AI_Use_Log.md         # Chapter 14: AI tool assistance audit log
│   ├── prefect_runs.csv      # Unedited Prefect flow run history
│   └── step3_train_model.ipynb # Interactive ML training & evaluation notebook
├── flows/                    # Prefect orchestration flow scripts
├── frontend/                 # Vite + React + Tailwind + MapLibre client (port 5173)
│   ├── design/               # High-resolution UI captures for documentation
│   ├── public/               # Static assets & basemap configurations
│   └── src/                  # React components, pages, hooks, and services
├── pipeline/                 # Data engineering, ingestion & modeling pipelines
│   ├── data/                 # Raw, cleaned, and processed Parquet data
│   │   ├── hourly_manifest.csv # Cryptographic SHA-256 data manifest
│   │   └── processed/climateshield.duckdb # Primary analytical warehouse
│   └── reports/figures/      # Evaluation figures and fairness charts
├── scripts/                  # Utility automation and export scripts
├── src/                      # Reusable core modules (models, quality, agents)
└── tasks/                    # Planning, implementation, and audit checklists
```

---

## ⚖️ License & Ethical Declaration
- **License**: Released under the [MIT License](LICENSE).
- **Public Data Sources**: Open-Meteo (CC BY 4.0), Copernicus GloFAS (Open Data), OpenStreetMap (ODbL), Pakistan Bureau of Statistics (Open Access).
- **Responsible AI**: Models are deterministic and calibrated to prioritize recall for severe life-threatening flood and heat thresholds. Group fairness audits are conducted to ensure equitable coverage across all metropolitan wards.
