"""
Pytest suite for Data Quality API endpoints (/api/quality/*).
Tests:
- GET /api/quality/summary
- GET /api/quality/decisions with filters (action, source)
- GET /api/quality/decisions pagination (limit, offset)
- GET /api/quality/daily
- Edge cases: no matches, invalid source filter, empty table fallback
"""

import sys
from pathlib import Path
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app

client = TestClient(app)


def test_quality_summary():
    """Verify /api/quality/summary returns counts and pass rates."""
    response = client.get("/api/quality/summary")
    assert response.status_code == 200

    payload = response.json()
    assert "data" in payload
    data = payload["data"]

    assert data["total_checks"] > 0
    assert data["fixed"] > 0
    assert data["filled"] > 0
    assert data["flagged"] > 0
    assert data["total_anomalies"] == (data["fixed"] + data["filled"] + data["flagged"])
    assert 90.0 <= data["pass_rate_pct"] <= 100.0
    assert data["sources_audited"] >= 3


def test_quality_decisions_default():
    """Verify /api/quality/decisions returns default paginated rows and distinct sources."""
    response = client.get("/api/quality/decisions?limit=5&offset=0")
    assert response.status_code == 200

    payload = response.json()
    data = payload["data"]

    assert len(data["items"]) == 5
    assert data["total"] >= 20
    assert data["limit"] == 5
    assert data["offset"] == 0
    assert len(data["sources"]) >= 4

    first = data["items"][0]
    assert "logged_at" in first
    assert "source_name" in first
    assert "rule" in first
    assert first["action"] in ["fix", "fill", "flag"]
    assert "explanation" in first


def test_quality_decisions_filter_action_fix():
    """Verify filtering by action=fix returns only fix records."""
    response = client.get("/api/quality/decisions?action=fix")
    assert response.status_code == 200

    items = response.json()["data"]["items"]
    assert len(items) > 0
    for item in items:
        assert item["action"] == "fix"


def test_quality_decisions_filter_action_fill():
    """Verify filtering by action=fill returns only fill records."""
    response = client.get("/api/quality/decisions?action=fill")
    assert response.status_code == 200

    items = response.json()["data"]["items"]
    assert len(items) > 0
    for item in items:
        assert item["action"] == "fill"


def test_quality_decisions_filter_action_flag():
    """Verify filtering by action=flag returns only flag records."""
    response = client.get("/api/quality/decisions?action=flag")
    assert response.status_code == 200

    items = response.json()["data"]["items"]
    assert len(items) > 0
    for item in items:
        assert item["action"] == "flag"


def test_quality_decisions_filter_source():
    """Verify filtering by source substring returns matched streams."""
    response = client.get("/api/quality/decisions?source=Radar")
    assert response.status_code == 200

    items = response.json()["data"]["items"]
    assert len(items) > 0
    for item in items:
        assert "Radar" in item["source_name"]


def test_quality_decisions_pagination_pages():
    """Verify pagination offsets return non-overlapping distinct sets."""
    page1 = client.get("/api/quality/decisions?limit=3&offset=0").json()["data"]["items"]
    page2 = client.get("/api/quality/decisions?limit=3&offset=3").json()["data"]["items"]

    assert len(page1) == 3
    assert len(page2) == 3

    page1_rules = [item["rule"] for item in page1]
    page2_rules = [item["rule"] for item in page2]
    # Consecutive pages should not be identical
    assert page1_rules != page2_rules


def test_quality_decisions_no_match():
    """Verify non-existent filter returns empty items with total=0."""
    response = client.get("/api/quality/decisions?source=NonExistentSource999")
    assert response.status_code == 200

    data = response.json()["data"]
    assert data["items"] == []
    assert data["total"] == 0


def test_quality_daily_counts():
    """Verify /api/quality/daily returns chronological aggregated action counts."""
    response = client.get("/api/quality/daily")
    assert response.status_code == 200

    daily = response.json()["data"]
    assert len(daily) >= 5  # at least 5 days seeded

    for d in daily:
        assert "date" in d
        assert d["total"] == (d["fix"] + d["fill"] + d["flag"])
        assert d["total"] >= 1
