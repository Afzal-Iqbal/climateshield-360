"""API checks for the Insight Agent."""

import sys
from pathlib import Path

from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app

client = TestClient(app)


def test_insight_refuses_unsupported_question():
    response = client.post("/api/insight/ask", json={"question": "What is the Pakistan stock price today?"})
    assert response.status_code == 200
    payload = response.json()
    assert "generated_at" in payload
    assert payload["data"]["knows"] is False
    assert payload["data"]["answer"].startswith("I don't know")
    assert payload["data"]["limits"]
    assert payload["data"]["numbers"] == []


def test_insight_karachi_heat_cites_a_row():
    response = client.post(
        "/api/insight/ask",
        json={"question": "How hot has Karachi been in the stored weather record?"},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["knows"] is True
    assert any(row_id.startswith("city_stats|Karachi") for row_id in data["row_ids"])
    assert data["numbers"]
    for token in data["numbers"]:
        assert token in data["answer"]
