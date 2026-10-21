#!/usr/bin/env python3
"""
Exports complete API endpoint snapshots from ClimateShield 360 DuckDB warehouse
into frontend/src/api/apiSnapshots.json for instantaneous offline / static resilience.
"""

import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(REPO_ROOT))

os.environ["CLIMATESHIELD_DB"] = str(REPO_ROOT / "pipeline" / "data" / "processed" / "climateshield.duckdb")
os.environ["CLIMATESHIELD_AUTO_INGEST"] = "0"

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

ENDPOINTS = [
    "/health",
    "/meta",
    "/status",
    "/freshness",
    "/runs?hours=24",
    "/runs?hours=48",
    "/runs?hours=168",
    "/model-eval",
    "/quality/summary",
    "/quality/decisions",
    "/quality/decisions?action=flag",
    "/quality/decisions?action=fix",
    "/quality/decisions?action=fill",
    "/quality/daily",
    "/overview",
    "/overview?range=24h",
    "/overview?range=48h",
    "/overview?range=7d",
    "/priorities",
    "/priorities?range=24h",
    "/priorities?range=48h",
    "/priorities?range=7d",
    "/priorities?range=24h&hazard=heat",
    "/priorities?range=24h&hazard=heavy_rain",
    "/priorities?range=48h&hazard=heat",
    "/priorities?range=48h&hazard=heavy_rain",
    "/priorities?range=7d&hazard=heat",
    "/priorities?range=7d&hazard=heavy_rain",
    "/map/zones",
    "/map/zones?hazard=heat",
    "/map/zones?hazard=heavy_rain",
    "/map/facilities",
    "/model/summary",
    "/impacts",
    "/planner",
    "/planner?hazard=all&range=24h",
    "/planner?hazard=heat&range=24h",
    "/planner?hazard=heavy_rain&range=24h",
    "/planner?hazard=all&range=48h",
    "/planner?hazard=all&range=7d",
    "/methodology",
]

cities = [
    "Karachi", "Lahore", "Faisalabad", "Rawalpindi", "Multan",
    "Hyderabad", "Peshawar", "Quetta", "Islamabad", "Gilgit", "Gwadar", "Sukkur"
]
hazards = ["heavy_rain", "heat"]
ranges = ["24h", "48h", "7d"]

# Add all forecast permutations
for h in hazards:
    for r in ranges:
        ENDPOINTS.append(f"/forecast?hazard={h}&range={r}")
        for c in cities:
            ENDPOINTS.append(f"/forecast?hazard={h}&city={c}&range={r}")

ENDPOINTS.append("/forecast")

zones = ["KHI-CENTRAL", "KHI-EAST", "KHI-KEAMARI", "KHI-KORANGI", "KHI-MALIR", "KHI-SOUTH", "KHI-WEST"]
for z in zones:
    ENDPOINTS.append(f"/map/zone/{z}")

impact_areas = ['physical', 'environmental', 'producers', 'economic', 'public_health', 'infrastructure', 'social', 'emergency_response']
for area in impact_areas:
    ENDPOINTS.append(f"/impacts/{area}")

snapshots = {}
print("Capturing API endpoints...")
for ep in ENDPOINTS:
    url = f"/api{ep}"
    res = client.get(url)
    if res.status_code == 200:
        snapshots[ep] = res.json()
        print(f"✓ {ep} (200 OK)")
    else:
        print(f"✗ {ep} ({res.status_code})")

# Add insight responses for all suggested and popular questions
insight_questions = [
    "What is the latest observed temperature in Karachi?",
    "What's the weather today in Karachi?",
    "What is the next-hour rainfall forecast for Karachi?",
    "Heat stroke risk with current Karachi temperature?",
    "When was the last successful hourly ingest?",
    "How does the rainfall model compare with its baseline?",
    "What is the temperature in Lahore?",
    "What is the temperature in Islamabad?",
    "What is the temperature in Rawalpindi?",
    "What is the temperature in Multan?",
    "What is the temperature in Peshawar?",
    "What is the temperature in Quetta?",
    "What is the temperature in Hyderabad?",
    "What is the temperature in Faisalabad?",
    "What is the temperature in Gilgit?",
    "What is the temperature in Gwadar?",
    "What is the temperature in Sukkur?",
    "What is the rainfall forecast for Karachi?",
    "Is it raining in Karachi?",
    "What data sources are used?",
    "What is the flood risk?",
]

insight_qa = {}
for q in insight_questions:
    res_insight = client.post("/api/insight/ask", json={"question": q})
    if res_insight.status_code == 200:
        insight_qa[q.lower().strip()] = res_insight.json()
        print(f"✓ Insight QA: {q}")

snapshots["insight_qa"] = insight_qa
# Default fallback for /insight/ask
snapshots["/insight/ask"] = client.post("/api/insight/ask", json={"question": "What is the latest observed temperature in Karachi?"}).json()

output_path = REPO_ROOT / "frontend" / "src" / "api" / "apiSnapshots.json"
output_path.parent.mkdir(parents=True, exist_ok=True)
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(snapshots, f, ensure_ascii=False)

print(f"\nSaved {len(snapshots)} snapshots to {output_path} ({os.path.getsize(output_path)} bytes)")
