"""Grounded insight assistant: warehouse answers only, no invented numbers."""

from fastapi.testclient import TestClient

from db import safe_query
from main import app

client = TestClient(app)


def test_temperature_answer_matches_warehouse():
    rows = safe_query(
        """
        SELECT temperature_2m_c
        FROM weather_hourly
        WHERE lower(city) = 'karachi' AND temperature_2m_c IS NOT NULL
        ORDER BY timestamp_utc DESC
        LIMIT 1
        """
    )
    response = client.post(
        "/api/insight/ask",
        json={"question": "What is the latest observed temperature in Karachi?"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert "generated_at" in payload
    data = payload["data"]
    assert data["status"] == "answered"
    assert "observation" in data["answer"].lower()
    assert "not a heat forecast" in data["answer"].lower()
    assert any(item["source"] == "weather_hourly" for item in data["citations"])
    if rows:
        assert f"{float(rows[0]['temperature_2m_c']):.1f}" in data["answer"]


def test_unknown_question_invents_nothing():
    response = client.post(
        "/api/insight/ask",
        json={"question": "What will the stock market do next week?"},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "unknown"
    assert data["citations"] == []
    assert "°C" not in data["answer"]
    assert "mm" not in data["answer"]


def test_empty_question_is_rejected():
    response = client.post("/api/insight/ask", json={"question": "   "})
    assert response.status_code == 400


def test_unknown_city_is_not_replaced():
    response = client.post(
        "/api/insight/ask",
        json={"question": "What is the temperature in NotACity?"},
    )
    data = response.json()["data"]
    assert data["status"] == "unavailable"
    assert "NotACity" in data["answer"] or "notacity" in data["answer"].lower()
    assert "°C" not in data["answer"]


def test_rain_answer_uses_stored_prediction_without_swapping_zero_median():
    rows = safe_query(
        """
        SELECT median, probability
        FROM predictions
        WHERE lower(city) = 'karachi' AND hazard_type = 'heavy_rain'
        ORDER BY forecast_time DESC
        LIMIT 1
        """
    )
    response = client.post(
        "/api/insight/ask",
        json={"question": "What is the next-hour rainfall forecast for Karachi?"},
    )
    data = response.json()["data"]
    assert data["status"] == "answered"
    assert "weather_hourly" in data["answer"] or any(item["source"] == "predictions" for item in data["citations"])
    if rows and rows[0]["median"] is not None:
        median = float(rows[0]["median"])
        assert f"{median:.3f}" in data["answer"]
        if rows[0]["probability"] is not None and median == 0.0:
            assert f"{float(rows[0]['probability']):.3f} mm/h" not in data["answer"]


def test_documents_are_not_quoted_when_unparsed():
    response = client.post(
        "/api/insight/ask",
        json={"question": "What do the NDMA documents say about losses?"},
    )
    data = response.json()["data"]
    assert data["status"] in {"answered", "unavailable"}
    if data["status"] == "answered":
        assert "not parsed" in data["answer"].lower() or "not extracted" in data["answer"].lower()
        assert "document_catalog" in {item["source"] for item in data["citations"]}


def test_coverage_does_not_claim_every_area_works():
    response = client.post(
        "/api/insight/ask",
        json={"question": "Which impact areas can be forecast?"},
    )
    data = response.json()["data"]
    assert data["status"] == "answered"
    assert "unsupported" in data["answer"].lower()
    assert "economic" in data["answer"]
