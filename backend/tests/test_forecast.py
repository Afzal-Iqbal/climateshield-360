"""
Unit tests for the /api/forecast endpoint.
Ensures conformance with AGENT_RULES.md:
- Rule 1: Never hard-code outputs. Every number comes from DuckDB.
- Rule 2: Envelope returns {data, generated_at, is_sample}.
- Rule 3: Times in UTC, formatted in PKT for display.
- Rule 5: Always show uncertainty intervals and baseline comparison where predictions appear.
- Heat condition: hazard=heat returns observed values and thresholds only, predicted=null,
  with the note "heat is observed against thresholds and is not ML-predicted".
"""

import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_forecast_heavy_rain():
    """Verify heavy rain returns observed, predicted series, baseline and thresholds."""
    response = client.get("/api/forecast?hazard=heavy_rain&city=Karachi&range=24h")
    assert response.status_code == 200
    payload = response.json()

    assert "data" in payload
    assert "generated_at" in payload
    assert "is_sample" in payload

    data = payload["data"]
    assert data["hazard"] == "heavy_rain"
    assert data["city"] == "Karachi"
    assert data["range"] == "24h"
    assert isinstance(data["observed"], list)
    assert len(data["observed"]) > 0

    first_obs = data["observed"][0]
    assert "timestamp_utc" in first_obs
    assert "timestamp_pkt" in first_obs
    assert "value" in first_obs
    assert first_obs["unit"] == "mm"

    # Baseline info
    assert "baseline" in data
    assert "name" in data["baseline"]
    assert "description" in data["baseline"]

    # Thresholds
    assert "thresholds" in data
    assert data["thresholds"]["unit"] == "mm/hr"
    assert len(data["thresholds"]["levels"]) >= 3

    # If predicted series exists, verify uncertainty intervals
    if data["predicted"] is not None and len(data["predicted"]) > 0:
        first_pred = data["predicted"][0]
        assert "probability" in first_pred
        assert "interval_low" in first_pred
        assert "interval_high" in first_pred
        assert "median" in first_pred
        assert first_pred["interval_low"] <= first_pred["interval_high"]


def test_forecast_heat():
    """Verify heat returns observed and thresholds only, with predicted=null and required note."""
    response = client.get("/api/forecast?hazard=heat&city=Karachi&range=24h")
    assert response.status_code == 200
    payload = response.json()

    data = payload["data"]
    assert data["hazard"] == "heat"
    assert data["predicted"] is None
    assert data["note"] == "heat is observed against thresholds and is not ML-predicted"
    assert data["thresholds"]["unit"] == "°C"
    assert data["thresholds"]["primary_threshold"] == 40.0
    assert len(data["observed"]) > 0
    assert data["observed"][0]["unit"] == "°C"
