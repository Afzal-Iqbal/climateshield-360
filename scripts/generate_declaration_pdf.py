#!/usr/bin/env python3
"""
Generates an executive, beautifully formatted exact 2-page Dataset_Declaration.pdf
reflecting the full multi-source dataset ecosystem:
- Page 1: Metadata + Sources 1, 2, 3, 4 (Open-Meteo, OSM/Geofabrik, NDMA/PMD, PBS)
- Page 2: Non-track Credibility + Expected Volume + Operational Fit + Model Baseline
"""

import os
import subprocess

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PDF_PATH = os.path.join(BASE_DIR, "Dataset_Declaration.pdf")
HTML_TEMP = "/tmp/Dataset_Declaration_clean.html"

HTML_CONTENT = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Dataset Declaration - HackInsight 2026</title>
<style>
  @page {
    size: A4;
    margin: 8mm 14mm 8mm 14mm;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #1e293b;
    line-height: 1.30;
    font-size: 9.8px;
    margin: 0;
    padding: 0;
  }
  h1 {
    color: #1e3a8a;
    font-size: 17.5px;
    margin-top: 0;
    margin-bottom: 3px;
    border-bottom: 2px solid #2563eb;
    padding-bottom: 2px;
  }
  h2 {
    color: #1e40af;
    font-size: 12px;
    margin-top: 5px;
    margin-bottom: 2px;
    border-bottom: 1.5px solid #cbd5e1;
    padding-bottom: 1px;
  }
  .meta-box {
    background-color: #f8fafc;
    border: 1px solid #cbd5e1;
    border-left: 3.5px solid #2563eb;
    border-radius: 4px;
    padding: 3px 6px;
    margin-bottom: 5px;
    font-size: 10.5px;
  }
  .meta-row { margin: 1px 0; }
  .label { font-weight: 700; color: #0f172a; }
  .source-card {
    background-color: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    padding: 3px 6px;
    margin-bottom: 3px;
  }
  .source-title {
    font-weight: 700;
    color: #1e40af;
    font-size: 10.8px;
    margin-bottom: 2px;
    border-bottom: 1px dashed #e2e8f0;
    padding-bottom: 1px;
  }
  .source-grid {
    width: 100%;
    border-collapse: collapse;
    font-size: 9.8px;
  }
  .source-grid td {
    padding: 1px 3px;
    vertical-align: top;
  }
  .source-grid td.k {
    font-weight: 700;
    color: #334155;
    width: 14%;
    white-space: nowrap;
  }
  .equation-box {
    background-color: #eff6ff;
    border-left: 3px solid #2563eb;
    padding: 3px 6px;
    margin: 3px 0;
    border-radius: 0 3px 3px 0;
    font-size: 9.8px;
  }
  .math-formula {
    font-size: 12.5px;
    font-weight: 700;
    color: #1e3a8a;
    font-family: Georgia, serif;
  }
  .credibility-box {
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-left: 3px solid #059669;
    border-radius: 0 3px 3px 0;
    padding: 3px 6px;
    margin: 3px 0;
    font-size: 9.8px;
  }
  ul { margin: 1px 0 2px 0; padding-left: 14px; }
  ol { margin: 1px 0 2px 0; padding-left: 15px; }
  li { margin-bottom: 1px; }
</style>
</head>
<body>

<!-- ================= PAGE 1 ================= -->
<h1>Dataset Declaration</h1>

<div class="meta-box">
  <div class="meta-row"><span class="label">Project Title:</span> PakRoad FloodWatch (Climate &amp; Infrastructure Analytics) &nbsp;|&nbsp; <span class="label">Track:</span> Climate (Rainfall &amp; Urban Road Inundation Risk)</div>
  <div class="meta-row"><span class="label">Team Name:</span> [Your Team Name] &nbsp;|&nbsp; <span class="label">Submission Deadline:</span> Monday, 19 October 2026, 12:00 PM PKT</div>
</div>

<div class="source-card">
  <div class="source-title">Source 1: Primary Real-Time &amp; Historical Weather &amp; Hydrological APIs</div>
  <table class="source-grid">
    <tr><td class="k">Name &amp; Publisher:</td><td>Open-Meteo Historical Weather &amp; GloFAS Flood APIs &bull; <em>Open-Meteo GmbH &amp; Copernicus EMS</em></td></tr>
    <tr><td class="k">URL &amp; Licence:</td><td>https://open-meteo.com/en/docs/historical-weather-api &nbsp;|&nbsp; https://flood-api.open-meteo.com &bull; <em>CC BY 4.0</em></td></tr>
    <tr><td class="k">Update Frequency:</td><td>Hourly real-time updates + continuous historical archive (2021–2026)</td></tr>
    <tr><td class="k">Variables Extracted:</td><td><code>temperature_2m</code> (°C), <code>relative_humidity_2m</code> (%), <code>dew_point_2m</code> (°C), <code>precipitation</code> (mm), <code>rain</code> (mm), <code>surface_pressure</code> (hPa), <code>soil_moisture_0_to_7cm</code> (m³/m³), <code>soil_moisture_7_to_28cm</code> (m³/m³), <code>wind_speed_10m</code> (km/h), <code>wind_direction_10m</code> (°), <code>cloud_cover</code> (%), <code>weather_code</code> (WMO), and <code>river_discharge</code> (m³/s).</td></tr>
  </table>
</div>

<div class="source-card">
  <div class="source-title">Source 2: OpenStreetMap Spatial Infrastructure &amp; Road Connectivity</div>
  <table class="source-grid">
    <tr><td class="k">Name &amp; Publisher:</td><td>OpenStreetMap / Geofabrik GIS &amp; HeiGIT HDX Risk Assessment Indicators &bull; <em>OSMF, HOT OSM &amp; HeiGIT / UN OCHA</em></td></tr>
    <tr><td class="k">URL &amp; Licence:</td><td>https://download.geofabrik.de/asia/pakistan.html &nbsp;|&nbsp; https://data.humdata.org/dataset/pakistan---risk-assessment-indicators &bull; <em>ODbL</em></td></tr>
    <tr><td class="k">Update Frequency:</td><td>Continuous community mapping &amp; periodic official humanitarian releases</td></tr>
    <tr><td class="k">Attributes Extracted:</td><td>Nationwide road networks, emergency healthcare facilities &amp; hospitals (GeoJSON), populated places &amp; settlements, district Rural Access Index (RAI - % population with all-season road connectivity within 2km), multi-tier flood return period exposure (RP10, RP50, RP100), hospital travel access times, and evacuation buffer capacity across all 160 Pakistani districts.</td></tr>
  </table>
</div>

<div class="source-card">
  <div class="source-title">Source 3: Government Hazard Advisories, Bulletins &amp; Early Warning Triggers</div>
  <table class="source-grid">
    <tr><td class="k">Name &amp; Publisher:</td><td>NDMA Pakistan &amp; PMD Flood Forecasting Division &bull; <em>Government of Pakistan</em></td></tr>
    <tr><td class="k">URL &amp; Licence:</td><td>https://ndma.gov.pk &nbsp;|&nbsp; https://ffd.pmd.gov.pk &bull; <em>Official Public Domain / Open Government Release</em></td></tr>
    <tr><td class="k">Update Frequency:</td><td>Daily flood bulletins, real-time weather advisories &amp; multi-year seasonal strategies</td></tr>
    <tr><td class="k">Attributes Extracted:</td><td>Official monsoon advisories (Aug–Oct 2026), Pakistan National Anticipatory Action Strategy (Early Warning &amp; Trigger Systems 2026–2030), daily river discharge bulletins, and river flood stage danger limits (Low, Medium, High, Very High) across 19 critical stations on Indus, Jhelum, Chenab, Ravi, and Kabul river basins.</td></tr>
  </table>
</div>

<div class="source-card">
  <div class="source-title">Source 4: National Demographic, Agricultural &amp; Socioeconomic Baselines</div>
  <table class="source-grid">
    <tr><td class="k">Name &amp; Publisher:</td><td>Pakistan Bureau of Statistics (PBS) Official Census &amp; Economic Indicators &bull; <em>Ministry of Planning Development</em></td></tr>
    <tr><td class="k">URL &amp; Licence:</td><td>https://www.pbs.gov.pk &bull; <em>Government Open Statistical Release</em></td></tr>
    <tr><td class="k">Update Frequency:</td><td>Decennial digital census releases, weekly SPI price indices &amp; quarterly national accounts</td></tr>
    <tr><td class="k">Attributes Extracted:</td><td>7th Digital Population &amp; Housing Census 2023 district summaries (Punjab &amp; Sindh flashcards), 160-district population demographics, urban/rural distribution, vulnerability &amp; dependency ratios, Integrated Agricultural Census (IAC) country report, and Consumer Price Index (CPI / SPI) food/energy price indicators.</td></tr>
  </table>
</div>

<!-- ================= PAGE 2 ================= -->
<div style="page-break-before: always; break-before: page;">
  <h2>Which sources are not on the track list, and why are they credible?</h2>
  <div class="credibility-box">
    <p style="margin: 0 0 2px 0;"><strong>Sources 2, 3, and 4 (OpenStreetMap/HDX, NDMA/PMD, and PBS)</strong> are not listed on the default Climate track benchmark list, but provide indispensable, authoritative empirical ground truth:</p>
    <ul>
      <li><strong>OpenStreetMap / Geofabrik &amp; HDX (HeiGIT):</strong> Hosted on UN OCHA’s Humanitarian Data Exchange platform and curated by Heidelberg University, serving as the international gold standard for spatial infrastructure and emergency road accessibility.</li>
      <li><strong>NDMA &amp; PMD Flood Forecasting Division:</strong> The constitutional federal agencies governing emergency response and hydrometeorology in Pakistan, providing legal threshold definitions for river flood stages.</li>
      <li><strong>Pakistan Bureau of Statistics (PBS):</strong> The official national statistical authority of Pakistan, providing certified Digital Census 2023 demographics and economic indices.</li>
    </ul>
  </div>

  <h2>Expected Volume</h2>
  <ul>
    <li><strong>Meteorological Heat &amp; Rainfall Data:</strong> Continuous hourly observations across <strong>12 major Pakistani metropolitan areas and economic hubs</strong> (Lahore, Karachi, Rawalpindi, Islamabad, Faisalabad, Multan, Peshawar, Quetta, Hyderabad, Sukkur, Gilgit, Gwadar) spanning nearly 6 full years (2021–2026), capturing the historic 2022 super floods:
      <div class="equation-box">
        <strong>Total Ingested Meteorological Volume:</strong> <span class="math-formula">592,176 hourly records</span> &nbsp;<em>(Exceeds 50,000-row requirement by &gt;11x)</em>
      </div>
    </li>
    <li><strong>Hydrological Streamflow Data:</strong> <strong>10,585 daily river discharge readings</strong> across 5 critical river basins (Ravi, Indus, Kabul, Soan, Malir).</li>
    <li><strong>Spatial &amp; Road Infrastructure:</strong> Full nationwide coverage across <strong>160 administrative districts</strong> (Rural Access Index, road inundation exposure, healthcare travel buffers, and GeoJSON hospital/settlement footprints).</li>
    <li><strong>Official Hazard Reports &amp; Census Baselines:</strong> Multi-year NDMA anticipatory action triggers, PMD river danger limits, and 2023 Digital Census district demographic datasets.</li>
  </ul>

  <h2>Why this data fits the problem and the primary user</h2>
  <ul>
    <li><span class="label">Primary Users:</span> City Traffic Police departments (Lahore, Karachi, Rawalpindi) and Rescue 1122 emergency dispatchers.</li>
    <li><span class="label">Operational Fit:</span>
      <ol>
        <li><strong>Meteorological Saturation (Open-Meteo):</strong> Real-time and forecasted precipitation, rain intensity, and antecedent soil moisture determine surface runoff volume and localized ponding potential.</li>
        <li><strong>Hydrological Backflow (GloFAS &amp; PMD):</strong> Identifies when main rivers (Ravi, Indus, Malir, Soan) exceed high-flood thresholds, choking municipal storm outfalls and reversing drainage flow.</li>
        <li><strong>Spatial Vulnerability (OpenStreetMap &amp; HDX):</strong> Pinpoints road links lacking all-season paving (low RAI) and routes cut off from emergency healthcare facilities.</li>
        <li><strong>Demographic &amp; Trigger Context (NDMA &amp; PBS):</strong> Maps population density and institutional early warning triggers to deploy de-watering pumps and enforce traffic diversions 2 to 4 hours before severe road submergence.</li>
      </ol>
    </li>
  </ul>

  <h2>Baseline you declare (Fixed before results)</h2>
  <ul>
    <li><strong>Precipitation Baseline:</strong> 24-hour persistence model:
      <div class="equation-box">
        <span class="math-formula">y&#770;<sub>t</sub> = y<sub>t - 24h</sub></span><br>
        <span style="font-size:9px; color:#475569;">(The predicted precipitation at hour <em>t</em> equals the observed precipitation at the same hour on the previous day).</span>
      </div>
    </li>
    <li><strong>Road Condition Baseline:</strong> Static heuristic rule:
      <div class="equation-box">
        &bull; <strong>Waterlogging Risk / Caution:</strong> Triggered if hourly rainfall &ge; 2.5 mm/hr &nbsp;|&nbsp; &bull; <strong>Normal / Passable:</strong> Triggered when hourly rainfall &lt; 2.5 mm/hr
      </div>
    </li>
    <li><strong>Success Criterion:</strong>
      The trained predictive machine learning models (LightGBM / XGBoost Regressor and Classifier) must achieve at least a <strong>20% improvement</strong> in Mean Absolute Error (MAE) and Brier Score over the declared persistence baseline on an untouched future temporal evaluation set (2025–2026).
    </li>
  </ul>
</div>

</body>
</html>
"""

def main():
    with open(HTML_TEMP, "w", encoding="utf-8") as f:
        f.write(HTML_CONTENT)

    cmd = [
        "libreoffice",
        "--headless",
        "--convert-to", "pdf",
        HTML_TEMP,
        "--outdir", BASE_DIR
    ]
    subprocess.run(cmd, check=True)
    temp_pdf = os.path.join(BASE_DIR, "Dataset_Declaration_clean.pdf")
    if os.path.exists(temp_pdf):
        os.replace(temp_pdf, PDF_PATH)
    print(f"Generated clean PDF: {PDF_PATH}")

if __name__ == "__main__":
    main()
