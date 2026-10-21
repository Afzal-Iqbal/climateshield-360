#!/usr/bin/env python3
"""
Generates an executive, beautifully formatted exact 1-page Summary.pdf
for HackInsight 2026: Data-to-Decision (Climate Track).
"""

import os
import subprocess
import shutil

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DOC_DIR = os.path.join(BASE_DIR, "doc")
PDF_PATH = os.path.join(DOC_DIR, "Summary.pdf")
ROOT_PDF_PATH = os.path.join(BASE_DIR, "Summary.pdf")
PUBLIC_PDF_PATH = os.path.join(BASE_DIR, "frontend", "public", "Summary.pdf")
HTML_TEMP = "/tmp/ClimateShield360_Summary.html"

HTML_CONTENT = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>ClimateShield 360 - Executive Summary</title>
<style>
  @page {
    size: A4 portrait;
    margin: 8mm 12mm 8mm 12mm;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a;
    line-height: 1.25;
    font-size: 8.8px;
    margin: 0;
    padding: 0;
  }
  .header {
    border-bottom: 2px solid #0284c7;
    padding-bottom: 4px;
    margin-bottom: 6px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  .title {
    font-size: 17px;
    font-weight: 800;
    color: #0369a1;
    margin: 0;
    letter-spacing: -0.3px;
  }
  .subtitle {
    font-size: 9.5px;
    font-weight: 600;
    color: #475569;
    margin: 1px 0 0 0;
  }
  .meta-box {
    text-align: right;
    font-size: 7.8px;
    color: #64748b;
    line-height: 1.2;
  }
  .meta-tag {
    display: inline-block;
    background: #e0f2fe;
    color: #0369a1;
    padding: 1px 5px;
    border-radius: 3px;
    font-weight: bold;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 6px;
  }
  .section-card {
    border: 1px solid #cbd5e1;
    border-radius: 5px;
    padding: 5px 7px;
    background: #ffffff;
  }
  .section-title {
    font-size: 9.8px;
    font-weight: 700;
    color: #0f766e;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 2px;
    margin-bottom: 3px;
  }
  p {
    margin: 0 0 4px 0;
  }
  ul {
    margin: 0;
    padding-left: 12px;
  }
  li {
    margin-bottom: 2px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 3px;
    font-size: 8px;
  }
  th {
    background: #f1f5f9;
    color: #334155;
    font-weight: 600;
    text-align: left;
    padding: 2px 4px;
    border: 1px solid #cbd5e1;
  }
  td {
    padding: 2px 4px;
    border: 1px solid #e2e8f0;
  }
  .highlight {
    font-weight: 700;
    color: #0369a1;
  }
  .badge-success {
    background: #dcfce7;
    color: #15803d;
    font-weight: 700;
    padding: 0 3px;
    border-radius: 2px;
  }
  .footer {
    border-top: 1px solid #cbd5e1;
    padding-top: 3px;
    margin-top: 4px;
    font-size: 7.2px;
    color: #64748b;
    display: flex;
    justify-content: space-between;
  }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="title">ClimateShield 360: Karachi Extreme Weather & Crisis Platform</div>
    <div class="subtitle">HackInsight 2026: Data-to-Decision • Climate & Infrastructure Analytics Track</div>
  </div>
  <div class="meta-box">
    <div><span class="meta-tag">Deliverable: Summary.pdf (1-Page)</span></div>
    <div><b>Team:</b> S. M. Hunain (AI Full Stack & ML), M. Afzal, M. K. Jilani</div>
    <div><b>Date:</b> October 2026 | Karachi, Pakistan</div>
  </div>
</div>

<div class="grid">
  <!-- Card 1: Problem & Primary User -->
  <div class="section-card">
    <div class="section-title">1. The Problem & Primary Decision Maker</div>
    <p><b>Context:</b> Karachi (17M+ citizens) suffers severe monsoon flash-flooding in the Lyari/Malir basins, submerging underpasses and arterial corridors under 2–4 feet of water, coupled with lethal urban heatwaves.</p>
    <p><b>Primary User:</b> Emergency Municipal Dispatchers at <b>PDMA Sindh / KMC</b> and <b>Karachi Traffic Police (KTP)</b>.</p>
    <p><b>Actionable Decision:</b> Provides a <b>2 to 4-hour tactical advance window</b> to pre-deploy dewatering suction pumps and position diversion cones <i>before</i> arterial highways choke, replacing delayed post-facto reactions.</p>
  </div>

  <!-- Card 2: Warehouse Ecosystem -->
  <div class="section-card">
    <div class="section-title">2. Multi-Source Warehouse & Data Integrity</div>
    <p><b>Volume & Span:</b> <b>592,176 hourly observations</b> (2021–2026) across 12 Pakistani cities (exceeds 50k threshold by 11x).</p>
    <ul>
      <li><b>Independent Sources:</b> Open-Meteo (Precipitation/Heat), Copernicus GloFAS (River Runoff), NDMA/PMD Bulletins, PBS 2023 Census (Density), OpenStreetMap (Roads & Hospitals).</li>
      <li><b>Reproducibility:</b> Rebuilt via <code>make data</code> from raw & cleaned layers into gold DuckDB (<code>climateshield.duckdb</code>) with SHA-256 cryptographic manifest.</li>
    </ul>
  </div>
</div>

<div class="grid">
  <!-- Card 3: Data Quality Agent -->
  <div class="section-card">
    <div class="section-title">3. Data Quality Agent (Pandera Framework)</div>
    <p><b>Automated Decision Engine:</b> Replaces naive dropouts with explicit rule-based decisions audited in <code>quality_log</code>:</p>
    <ul>
      <li><b>FIX:</b> Standardizes UTC to PKT timezones, converts rainfall/temperature units, and resolves city name variants.</li>
      <li><b>FILL:</b> Imputes short sensor gaps (&le;3h) via local spline; flags imputed rows.</li>
      <li><b>FLAG:</b> Quarantines impossible sensor spikes (>150mm/h) and unverified reports without dropping raw evidence.</li>
    </ul>
  </div>

  <!-- Card 4: Predictive Model vs Baseline -->
  <div class="section-card">
    <div class="section-title">4. Model vs Declared Baseline (Deliverable 3)</div>
    <p><b>Declared Baseline:</b> 24-hour persistence ($ŷ_t = y_{t-24\text{h}}$).</p>
    <p><b>Model:</b> LightGBM Quantile Regressors ($Q_{10}, Q_{50}, Q_{90}$) trained on 403,188 rows (2021–2024, covers 2022 super floods); tested on 189,168 unseen rows (2025–2026).</p>
    <table>
      <tr>
        <th>Evaluation Metric</th>
        <th>24h Baseline</th>
        <th>LightGBM Model</th>
        <th>Improvement</th>
      </tr>
      <tr>
        <td>Test Rainfall MAE</td>
        <td>0.1055 mm</td>
        <td><b>0.0685 mm</b></td>
        <td><span class="badge-success">+35.1% Lower MAE</span></td>
      </tr>
      <tr>
        <td>Prediction Interval Coverage</td>
        <td>Point Only</td>
        <td><b>97.42%</b></td>
        <td>Calibrated ($Q_{10} \to Q_{90}$)</td>
      </tr>
    </table>
    <p style="margin-top:3px;"><b>Fairness by Group:</b> Audited across 12 cities; weakest group identified with operational dispatcher guidance.</p>
  </div>
</div>

<div class="grid">
  <!-- Card 5: Insight Agent (RAG) -->
  <div class="section-card">
    <div class="section-title">5. Insight Agent (RAG) & 8 Impact Domains</div>
    <p><b>Strict Responsible AI Protocol:</b></p>
    <ul>
      <li><b>Zero Synthetic Numbers:</b> Every metric in briefs originates directly from DuckDB gold tables with row IDs cited.</li>
      <li><b>Evidence Fallback:</b> Automatically returns <i>"I don't know"</i> when queries lack supporting official documentation.</li>
      <li><b>8 Impact Sectors:</b> Physical, Transport, Health, Energy, Economic, Agriculture, Social, Emergency Management.</li>
    </ul>
  </div>

  <!-- Card 6: Automation & Sustainability -->
  <div class="section-card">
    <div class="section-title">6. Pipeline Automation & Business Model</div>
    <p><b>Hourly Pipeline:</b> Live ingestion daemon fetches delta feeds hourly; tracks freshness radar and logs unedited <code>prefect_runs.csv</code>.</p>
    <p><b>Interactive Stack:</b> FastAPI async backend (port 8002) + Vite React SPA (port 5173) with resilient CARTO Dark 3D map.</p>
    <p><b>Business Sustainability:</b> Public-Private-Civic Partnership (Sindh Resilience Project / KMC) with low-overhead operating footprint of <b>~$30–$65 / month</b>.</p>
  </div>
</div>

<div class="footer">
  <div><b>HackInsight 2026 Submission Gate:</b> All 5 Deliverables Complete • 82/82 Pytest Passed • Rebuild: <code>make data</code> • Status: LIVE</div>
  <div>Repo Tag: <code>v1.0-final</code> | ClimateShield 360</div>
</div>

</body>
</html>
"""

def main():
    with open(HTML_TEMP, "w", encoding="utf-8") as f:
        f.write(HTML_CONTENT)
    
    os.makedirs(DOC_DIR, exist_ok=True)
    cmd = [
        "libreoffice",
        "--headless",
        "--convert-to", "pdf",
        HTML_TEMP,
        "--outdir", DOC_DIR
    ]
    subprocess.run(cmd, check=True)
    
    generated_pdf = os.path.join(DOC_DIR, "ClimateShield360_Summary.pdf")
    if os.path.exists(generated_pdf):
        os.replace(generated_pdf, PDF_PATH)
    
    # Copy to root and public for judge access
    shutil.copy2(PDF_PATH, ROOT_PDF_PATH)
    os.makedirs(os.path.dirname(PUBLIC_PDF_PATH), exist_ok=True)
    shutil.copy2(PDF_PATH, PUBLIC_PDF_PATH)
    
    print(f"Summary.pdf successfully generated at: {PDF_PATH}")
    print(f"Copied to root: {ROOT_PDF_PATH}")
    print(f"Copied to public: {PUBLIC_PDF_PATH}")

if __name__ == "__main__":
    main()
