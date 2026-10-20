"""
PakRoad FloodWatch / ClimateShield 360 - Prefect Hourly Orchestration Flow
Author: HackInsight 2026 Team (Climate & Infrastructure Analytics Track)

This flow implements the scheduled hourly automation matching AGENT_RULES.md:
Tasks:
1. fetch: Fetches new hourly weather observations from Open-Meteo for 12 cities
   with 3 retries and exponential backoff, saving raw JSON files unchanged and
   logging provenance to manifest.csv.
2. clean: Normalizes variables and timestamps on new hours only.
3. quality_checks: Runs range and boundary checks using DataQualityAgent.
4. update_processed: Updates weather_hourly.parquet and the DuckDB gold warehouse.
5. predict: Calls run_predictions from src/models/predict.py to produce next-hour
   quantiles (Q10, Q50, Q90), exceedance probabilities, and baseline comparisons.
6. update_status: Records real run_status and source_freshness into DuckDB warehouse.

Schedule:
Cron '5 * * * *' (5 minutes past every hour).
"""

from __future__ import annotations

import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import duckdb
import pandas as pd
from prefect import flow, task

# Disable telemetry to avoid background SQLite lock contention
os.environ["PREFECT_SERVER_ANALYTICS_ENABLED"] = "false"
os.environ["DO_NOT_TRACK"] = "1"

# Resolve repository paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
PIPELINE_ROOT = PROJECT_ROOT / "pipeline"
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

from pipeline.ingest.incremental_weather import (
    fetch_city_weather_raw,
    get_latest_warehouse_timestamp,
)
from climateshield.config import (
    MANIFEST_PATH,
    OPEN_METEO_CITY_POINTS,
    OPEN_METEO_FORECAST_URL,
    PROCESSED_DIR,
    RAW_HOURLY_DIR,
    SOURCE_LICENCES,
    WAREHOUSE_PATH,
)
from climateshield.pipeline.clean_weather import _flag_ranges, _flatten_city_json
from climateshield.quality.agent import DataQualityAgent
from climateshield.quality.logger import QualityLogger
from src.models.predict import run_predictions

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("climateshield.hourly_flow")


@task(name="fetch", retries=3, retry_delay_seconds=5)
def fetch_task(run_id: str, latest_ts: datetime) -> List[Dict[str, Any]]:
    """
    Fetch new hourly weather for all 12 Pakistani cities from Open-Meteo.
    Saves raw files unchanged, appends to manifest.csv with SHA-256 and licence.
    """
    logger.info("--- Task 1: Fetching new hourly weather from Open-Meteo ---")
    now_utc = datetime.now(timezone.utc)
    start_date = latest_ts.strftime("%Y-%m-%d")
    end_date = now_utc.strftime("%Y-%m-%d")

    run_raw_dir = RAW_HOURLY_DIR / run_id
    run_raw_dir.mkdir(parents=True, exist_ok=True)

    licence_meta = SOURCE_LICENCES.get("01_open_meteo_heat_rainfall", {})
    licence_name = licence_meta.get("licence", "CC-BY-4.0")
    source_url = licence_meta.get("source_url", "https://open-meteo.com/")

    raw_items: List[Dict[str, Any]] = []
    manifest_rows: List[Dict[str, Any]] = []

    for slug, point in OPEN_METEO_CITY_POINTS.items():
        city_name = point["city"]
        raw_bytes, query_url = fetch_city_weather_raw(slug, point, start_date, end_date)

        raw_filename = f"weather_{slug}_raw.json"
        raw_path = run_raw_dir / raw_filename
        raw_path.write_bytes(raw_bytes)

        import hashlib
        sha256_hash = hashlib.sha256(raw_bytes).hexdigest()

        rel_path = f"hourly_ingest/{run_id}/{raw_filename}"
        manifest_rows.append(
            {
                "filepath": rel_path,
                "source": "Open-Meteo",
                "source_folder": "01_open_meteo_heat_rainfall",
                "query": query_url,
                "fetch_time_utc": now_utc.isoformat(),
                "archive_mtime_utc": now_utc.isoformat(),
                "sha256": sha256_hash,
                "bytes": len(raw_bytes),
                "licence": licence_name,
                "source_url": source_url,
            }
        )
        raw_items.append(
            {
                "city": city_name,
                "raw_path": str(raw_path),
                "query_url": query_url,
                "sha256": sha256_hash,
            }
        )

    # Append to manifest.csv
    if manifest_rows:
        new_manifest_df = pd.DataFrame(manifest_rows)
        if MANIFEST_PATH.is_file():
            existing_manifest = pd.read_csv(MANIFEST_PATH)
            combined_manifest = pd.concat([existing_manifest, new_manifest_df], ignore_index=True)
            combined_manifest = combined_manifest.drop_duplicates(subset=["filepath", "sha256"], keep="last")
        else:
            combined_manifest = new_manifest_df
        combined_manifest.to_csv(MANIFEST_PATH, index=False)
        logger.info("Appended %d entries to manifest.csv", len(manifest_rows))

    return raw_items


@task(name="clean")
def clean_task(raw_items: List[Dict[str, Any]], latest_ts: datetime) -> List[Dict[str, Any]]:
    """
    Parse and clean raw JSON payloads, filtering strictly to rows after latest_ts.
    """
    logger.info("--- Task 2: Cleaning and normalizing new observations ---")
    cleaned_records: List[Dict[str, Any]] = []

    for item in raw_items:
        city_name = item["city"]
        raw_path = Path(item["raw_path"])
        flattened = _flatten_city_json(raw_path, city_name)
        new_hours = flattened[flattened["timestamp_utc"] > latest_ts].copy()
        if not new_hours.empty:
            cleaned_records.extend(new_hours.to_dict(orient="records"))

    logger.info("Cleaned %d new hourly observation rows.", len(cleaned_records))
    return cleaned_records


@task(name="quality_checks")
def quality_checks_task(cleaned_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Run data quality validation and range checks on new rows using DataQualityAgent.
    """
    logger.info("--- Task 3: Running data quality rules on new observations ---")
    if not cleaned_records:
        logger.info("No new rows to validate.")
        return []

    frame = pd.DataFrame(cleaned_records)
    logger_q = QualityLogger()
    agent = DataQualityAgent(logger_q)

    now_utc = datetime.now(timezone.utc)
    checked = _flag_ranges(frame, agent)
    checked["timestamp_utc"] = pd.to_datetime(checked["timestamp_utc"], utc=True)
    checked["row_id"] = (
        checked["city"] + "|" + checked["timestamp_utc"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    )
    checked["ingest_fetch_time_utc"] = now_utc.isoformat()
    checked["is_forecast"] = checked["timestamp_utc"] > now_utc
    checked["source_api"] = OPEN_METEO_FORECAST_URL
    checked = agent.append_flags(checked, checked["is_forecast"].eq(True), "forecast_not_observation")
    checked = agent.append_flags(checked, pd.Series(True, index=checked.index), "hourly_flow_ingest")

    return checked.to_dict(orient="records")


@task(name="update_processed")
def update_processed_task(
    checked_records: List[Dict[str, Any]],
    warehouse_path: Path = WAREHOUSE_PATH,
) -> int:
    """
    Append new non-forecast observations to weather_hourly.parquet and update DuckDB.
    """
    logger.info("--- Task 4: Updating gold parquet and DuckDB warehouse ---")
    if not checked_records:
        logger.info("No new observations to commit to warehouse.")
        return 0

    frame = pd.DataFrame(checked_records)
    observed_new = frame[frame["is_forecast"] == False].copy()
    if observed_new.empty:
        logger.info("All new rows were future forecasts; 0 observations added to gold.")
        return 0

    gold_parquet = PROCESSED_DIR / "weather_hourly.parquet"
    if gold_parquet.is_file():
        existing_gold = pd.read_parquet(gold_parquet)
        existing_ids = set(existing_gold["row_id"].astype(str))
        truly_new = observed_new[~observed_new["row_id"].astype(str).isin(existing_ids)]
        if not truly_new.empty:
            updated_gold = pd.concat([existing_gold, truly_new], ignore_index=True)
            updated_gold.to_parquet(gold_parquet, index=False)
            logger.info("Appended %d new rows to %s", len(truly_new), gold_parquet)
            # Update DuckDB table
            con = duckdb.connect(str(warehouse_path), read_only=False)
            try:
                src_sql = str(gold_parquet.resolve()).replace("'", "''")
                con.execute(f"CREATE OR REPLACE TABLE weather_hourly AS SELECT * FROM read_parquet('{src_sql}');")
            finally:
                con.close()
            return len(truly_new)
    else:
        observed_new.to_parquet(gold_parquet, index=False)
        return len(observed_new)

    return 0


@task(name="predict")
def predict_task(warehouse_path: Path = WAREHOUSE_PATH) -> Dict[str, Any]:
    """
    Execute ML multi-quantile prediction pipeline using saved models.
    """
    logger.info("--- Task 5: Running ML prediction pipeline ---")
    summary = run_predictions(str(warehouse_path))
    logger.info("Prediction task summary: %s", summary)
    return summary


@task(name="update_status")
def update_status_task(
    run_id: str,
    started_at: datetime,
    finished_at: datetime,
    status: str,
    notes: str,
    warehouse_path: Path = WAREHOUSE_PATH,
) -> None:
    """
    Write run_status and source_freshness to the real DuckDB warehouse.
    """
    logger.info("--- Task 6: Writing run_status and source_freshness to warehouse ---")
    con = duckdb.connect(str(warehouse_path), read_only=False)
    try:
        # 1. run_status table
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS run_status (
                run_id VARCHAR PRIMARY KEY,
                started_at TIMESTAMP WITH TIME ZONE NOT NULL,
                finished_at TIMESTAMP WITH TIME ZONE,
                status VARCHAR NOT NULL,
                notes VARCHAR
            );
            """
        )
        con.execute("DELETE FROM run_status WHERE run_id = ?;", [run_id])
        con.execute(
            "INSERT INTO run_status VALUES (?, ?, ?, ?, ?);",
            [run_id, started_at, finished_at, status, notes],
        )

        # 2. source_freshness table
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS source_freshness (
                source_name VARCHAR PRIMARY KEY,
                publisher VARCHAR NOT NULL,
                licence VARCHAR NOT NULL,
                last_fetched_at TIMESTAMP WITH TIME ZONE NOT NULL,
                expected_every_minutes INTEGER NOT NULL,
                status VARCHAR NOT NULL
            );
            """
        )

        # Update Open-Meteo entry
        con.execute("DELETE FROM source_freshness WHERE source_name = 'Open-Meteo Hourly Weather API';")
        con.execute(
            """
            INSERT INTO source_freshness VALUES
            ('Open-Meteo Hourly Weather API', 'Open-Meteo', 'CC-BY-4.0', ?, 60, 'fresh');
            """,
            [finished_at],
        )

        # Only sources this run actually fetched are recorded. Do not invent radar,
        # grid, or permit feeds that were not downloaded.
        logger.info("Committed run_status (%s, %s) and updated source_freshness.", run_id, status)
    finally:
        con.close()


@flow(name="hourly-weather-pipeline")
def hourly_weather_flow(
    warehouse_path: str = "pipeline/data/processed/climateshield.duckdb",
) -> Dict[str, Any]:
    """
    Main scheduled flow orchestrating incremental weather ingest and inference.
    Schedule: Cron '5 * * * *'.
    """
    started_at = datetime.now(timezone.utc)
    run_id = f"flow_{started_at.strftime('%Y%m%dT%H%M%SZ')}"
    db_file = Path(warehouse_path)

    status = "success"
    notes_parts: List[str] = []

    try:
        latest_ts = get_latest_warehouse_timestamp(db_file)
        raw_items = fetch_task(run_id, latest_ts)
        notes_parts.append(f"Fetched {len(raw_items)} cities")

        cleaned_records = clean_task(raw_items, latest_ts)
        checked_records = quality_checks_task(cleaned_records)

        new_rows = update_processed_task(checked_records, db_file)
        notes_parts.append(f"New observations: {new_rows}")

        pred_summary = predict_task(db_file)
        notes_parts.append(f"Predicted {pred_summary.get('rows_written', 0)} rows")

    except Exception as exc:
        status = "failed"
        notes_parts.append(f"Failure: {exc}")
        logger.error("Flow failed with error: %s", exc, exc_info=True)
        raise exc
    finally:
        finished_at = datetime.now(timezone.utc)
        notes = " | ".join(notes_parts)
        update_status_task(run_id, started_at, finished_at, status, notes, db_file)

    return {
        "run_id": run_id,
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "status": status,
        "notes": notes,
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run or deploy Prefect hourly weather flow.")
    parser.add_argument(
        "--serve",
        action="store_true",
        help="Serve the flow with cron schedule '5 * * * *'.",
    )
    parser.add_argument(
        "--db-path",
        default="pipeline/data/processed/climateshield.duckdb",
        help="Path to DuckDB warehouse.",
    )
    args = parser.parse_args()

    if args.serve:
        logger.info("Serving hourly_weather_flow on cron schedule '5 * * * *'...")
        hourly_weather_flow.serve(
            name="hourly-weather-deployment",
            cron="5 * * * *",
        )
    else:
        logger.info("Executing one-off hourly_weather_flow run...")
        result = hourly_weather_flow(args.db_path)
        print("\n--- Flow Run Execution Result ---")
        print(result)
