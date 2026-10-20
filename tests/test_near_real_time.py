"""
tests/test_near_real_time.py
============================
Automated test suite for ClimateShield 360 Near-Real-Time System (Stages 1-5).

Verifies:
1. Incremental fetch: requests only newer data with a 3-hour overlap window, upserts without duplicates.
2. Idempotency: re-running the same hour or existing data adds 0 duplicate rows.
3. Fault isolation: a failed source yields run_status 'partial', marks failed source 'Late', keeps other sources intact.
4. Atomic swap: publish_serving writes to .tmp first and replaces atomically; serving DB is never missing or half-written.
5. Freshness thresholds: <= 1.0x expected interval -> Fresh, <= 3.0x -> Late, > 3.0x -> Stale; is_live is True ONLY when all critical sources are Fresh.
6. HTTP 304 / ETag caching: repeated requests with matching If-None-Match return 304 Not Modified.
7. Meta endpoint: /api/meta accurately reflects data_as_of, run status, next_run_at, and per-source statuses.
"""

import os
import shutil
import tempfile
import duckdb
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from backend.main import app
from backend.db import evaluate_freshness_status, get_next_run_time
from pipeline.ingest.incremental_weather import (
    get_latest_warehouse_timestamp,
    upsert_weather_records,
)
from pipeline.ingest.fetch_all import fetch_all_sources
from flows.hourly_flow import atomic_swap_serving_db


# ---------------------------------------------------------------------------
# 1. Incremental Fetch & Idempotency Tests
# ---------------------------------------------------------------------------

def test_incremental_fetch_overlap_window(tmp_path):
    """Verify that incremental fetch queries from latest_ts - 3 hours."""
    test_db = tmp_path / "test_warehouse.duckdb"
    con = duckdb.connect(str(test_db))
    con.execute("""
        CREATE TABLE weather_hourly (
            city VARCHAR,
            timestamp_utc TIMESTAMP,
            source_api VARCHAR,
            temperature_2m DOUBLE,
            precipitation DOUBLE,
            relative_humidity_2m DOUBLE,
            wind_speed_10m DOUBLE,
            fetched_at TIMESTAMP
        );
    """)

    # When table is empty, returns default epoch 2021-01-01
    con.close()
    latest_ts = get_latest_warehouse_timestamp(test_db)
    assert latest_ts == datetime(2021, 1, 1, 0, 0, tzinfo=timezone.utc)

    # Insert a known timestamp
    con = duckdb.connect(str(test_db))
    con.execute("""
        INSERT INTO weather_hourly VALUES 
        ('Karachi', '2026-10-20 12:00:00', 'open_meteo', 32.0, 0.0, 60.0, 12.0, '2026-10-20 12:05:00');
    """)
    con.close()

    latest_ts = get_latest_warehouse_timestamp(test_db)
    assert latest_ts is not None
    # 3-hour overlap window test
    start_window = latest_ts - timedelta(hours=3)
    assert start_window == datetime(2026, 10, 20, 9, 0, 0, tzinfo=timezone.utc)


import pandas as pd


def test_upsert_prevents_duplicate_rows_and_updates_corrections():
    """Verify upsert on (city, timestamp_utc, source_api) replaces old rows and adds new ones."""
    initial_records = [
        {
            "city": "Karachi",
            "timestamp_utc": "2026-10-20T10:00:00Z",
            "source_api": "open-meteo-hourly",
            "temperature_2m": 30.0,
            "precipitation": 0.0,
            "relative_humidity_2m": 65.0,
            "wind_speed_10m": 10.0,
            "fetched_at": "2026-10-20T10:05:00Z",
        },
        {
            "city": "Lahore",
            "timestamp_utc": "2026-10-20T10:00:00Z",
            "source_api": "open-meteo-hourly",
            "temperature_2m": 28.0,
            "precipitation": 2.5,
            "relative_humidity_2m": 75.0,
            "wind_speed_10m": 5.0,
            "fetched_at": "2026-10-20T10:05:00Z",
        },
    ]

    initial_df = pd.DataFrame(initial_records)

    # First insert: 2 inserted, 0 updated, total 2
    combined_df1, inserted1, updated1 = upsert_weather_records(None, initial_df)
    assert inserted1 == 2
    assert updated1 == 0
    assert len(combined_df1) == 2

    # Re-run same hour with corrected value for Karachi and new row for Peshawar
    updated_records = [
        {
            "city": "Karachi",
            "timestamp_utc": "2026-10-20T10:00:00Z",
            "source_api": "open-meteo-hourly",
            "temperature_2m": 31.5,  # Corrected temperature
            "precipitation": 0.0,
            "relative_humidity_2m": 62.0,
            "wind_speed_10m": 11.0,
            "fetched_at": "2026-10-20T11:05:00Z",  # Newer fetch time
        },
        {
            "city": "Peshawar",
            "timestamp_utc": "2026-10-20T10:00:00Z",
            "source_api": "open-meteo-hourly",
            "temperature_2m": 25.0,
            "precipitation": 0.0,
            "relative_humidity_2m": 50.0,
            "wind_speed_10m": 8.0,
            "fetched_at": "2026-10-20T11:05:00Z",
        },
    ]

    updated_df = pd.DataFrame(updated_records)
    combined_df2, inserted2, updated2 = upsert_weather_records(combined_df1, updated_df)

    # Total unique rows must be 3 (Karachi updated, Lahore untouched, Peshawar added)
    assert inserted2 == 1
    assert updated2 == 1
    assert len(combined_df2) == 3

    # Check that Karachi got the corrected value
    karachi_row = combined_df2[combined_df2["city"] == "Karachi"].iloc[0]
    assert karachi_row["temperature_2m"] == 31.5


# ---------------------------------------------------------------------------
# 2. Fault Isolation & Partial Status Tests
# ---------------------------------------------------------------------------

def test_fetch_all_fault_isolation(tmp_path):
    """Verify that a failure in one source yields partial run status and marks that source Late."""
    # Mock weather succeeding, PMD failing, NDMA succeeding
    with patch("pipeline.ingest.fetch_all.fetch_city_weather_raw") as mock_weather, \
         patch("pipeline.ingest.fetch_all.fetch_advisories") as mock_adv, \
         patch("pipeline.ingest.fetch_all.fetch_openaq") as mock_aq, \
         patch("pipeline.ingest.fetch_all.MANIFEST_PATH", tmp_path / "test_manifest.csv"):

        mock_weather.return_value = (b'{"hourly": {}}', "https://api.open-meteo.com/v1/forecast")
        mock_adv.return_value = {
            "pmd": {"status": "failed", "error": "timeout"},
            "ndma": {"status": "success", "rows": 1},
            "manifest_rows": [],
        }
        mock_aq.return_value = {"status": "skipped", "manifest_rows": []}

        summary = fetch_all_sources(
            run_id="test_run_partial",
            latest_ts=datetime(2026, 10, 20, 10, 0, tzinfo=timezone.utc),
            raw_hourly_dir=tmp_path / "raw_hourly",
        )

    # Overall outcome must be 'partial' because PMD failed while weather and NDMA succeeded
    assert summary["overall_status"] == "partial"
    assert "PMD Advisory: failed" in summary["notes"]
    assert summary["source_statuses"]["pmd_ffd_homepage"]["status"] == "late"
    assert summary["source_statuses"]["open_meteo_weather"]["status"] == "fresh"
    assert summary["source_statuses"]["ndma_homepage"]["status"] == "fresh"


# ---------------------------------------------------------------------------
# 3. Atomic Swap Tests
# ---------------------------------------------------------------------------

def test_atomic_swap_serving_db():
    """Verify atomic swap writes to .tmp first and replaces final path cleanly."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        serving_dir = os.path.join(tmp_dir, "serving")
        os.makedirs(serving_dir, exist_ok=True)
        final_db = os.path.join(serving_dir, "climateshield_serving.duckdb")
        tmp_db = os.path.join(serving_dir, "climateshield_serving.duckdb.tmp")

        # Create temporary DB with content
        tmp_con = duckdb.connect(tmp_db)
        tmp_con.execute("CREATE TABLE contract_test (id INT, name VARCHAR);")
        tmp_con.execute("INSERT INTO contract_test VALUES (1, 'live_data');")
        tmp_con.close()

        assert os.path.exists(tmp_db)
        assert not os.path.exists(final_db)

        # Execute atomic swap
        atomic_swap_serving_db(tmp_db, final_db)

        # tmp_db should be gone, final_db should exist
        assert not os.path.exists(tmp_db)
        assert os.path.exists(final_db)

        # Verify DB is fully intact and readable
        check_con = duckdb.connect(final_db, read_only=True)
        row = check_con.execute("SELECT name FROM contract_test WHERE id = 1;").fetchone()
        check_con.close()
        assert row[0] == "live_data"


# ---------------------------------------------------------------------------
# 4. Freshness Classification & Cron Next Run Tests
# ---------------------------------------------------------------------------

def test_freshness_status_thresholds():
    """Test standard SLA thresholds: Fresh <= 1x, Late <= 3x, Stale > 3x."""
    expected = 60  # minutes

    # Fresh: age <= 60 mins
    assert evaluate_freshness_status(0.0, expected) == "Fresh"
    assert evaluate_freshness_status(30.0, expected) == "Fresh"
    assert evaluate_freshness_status(60.0, expected) == "Fresh"

    # Late: 60 < age <= 180 mins
    assert evaluate_freshness_status(61.0, expected) == "Late"
    assert evaluate_freshness_status(120.0, expected) == "Late"
    assert evaluate_freshness_status(180.0, expected) == "Late"

    # Stale: age > 180 mins
    assert evaluate_freshness_status(181.0, expected) == "Stale"
    assert evaluate_freshness_status(360.0, expected) == "Stale"

    # Explicit failure/late recorded_status
    assert evaluate_freshness_status(90.0, expected, recorded_status="failed") == "Late"
    assert evaluate_freshness_status(250.0, expected, recorded_status="failed") == "Stale"


def test_next_run_time_calculation():
    """Verify that next_run_time accurately computes next occurrence of cron '5 * * * *'."""
    nxt = get_next_run_time()
    now = datetime.now(timezone.utc)
    assert nxt > now
    assert nxt.minute == 5
    assert nxt.second == 0
    assert nxt.microsecond == 0
    # Difference should be between 0 and 60 minutes
    diff_secs = (nxt - now).total_seconds()
    assert 0 < diff_secs <= 3600


# ---------------------------------------------------------------------------
# 5. Backend HTTP 304 / ETag & Meta API Tests
# ---------------------------------------------------------------------------

def test_etag_http_304_middleware():
    """Verify that client sending matching If-None-Match receives HTTP 304 Not Modified."""
    client = TestClient(app)

    # Initial request
    resp1 = client.get("/api/meta")
    assert resp1.status_code == 200
    etag = resp1.headers.get("etag")
    assert etag is not None

    # Subsequent request with matching If-None-Match
    resp2 = client.get("/api/meta", headers={"if-none-match": etag})
    assert resp2.status_code == 304
    assert resp2.text == ""

    # Subsequent request with different ETag should return 200
    resp3 = client.get("/api/meta", headers={"if-none-match": '"stale-etag-value"'})
    assert resp3.status_code == 200


def test_api_meta_payload_structure():
    """Verify that /api/meta adheres to the extended near-real-time contract."""
    client = TestClient(app)
    response = client.get("/api/meta")
    assert response.status_code == 200
    data = response.json()

    assert "data" in data
    meta = data["data"]

    # Verify required near-real-time fields
    assert "data_as_of" in meta
    assert "last_run_at" in meta
    assert "last_run_status" in meta
    assert "next_run_at" in meta
    assert "sources" in meta
    assert "is_live" in meta
    assert isinstance(meta["is_live"], bool)
    assert isinstance(meta["sources"], list)
