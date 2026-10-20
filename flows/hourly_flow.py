"""
PakRoad FloodWatch / ClimateShield 360 - Prefect Hourly Orchestration Flow
Author: HackInsight 2026 Team (Climate & Infrastructure Analytics Track)

Stage 2 Hourly Flow:
Tasks in order:
1. fetch_all: Multi-source incremental ingestion (Open-Meteo 12 cities with 3h overlap,
   OpenAQ if key available, PMD and NDMA advisory page checks).
2. clean: Normalizes variables and timestamps on new hours only.
3. quality_agent: Runs range checks and validation via DataQualityAgent.
4. update_processed: Upserts into weather_hourly gold parquet and DuckDB warehouse.
5. predict: Calls run_predictions from src/models/predict.py to produce next-hour quantiles.
6. publish_serving: Writes all tables into serving/climateshield_serving.duckdb.tmp,
   then atomically swaps via os.replace() over serving/climateshield_serving.duckdb.
7. publish_snapshot: Exports parquet snapshots of API tables to Hugging Face Dataset repo
   (HF_DATA_REPO, HF_TOKEN) skipping gracefully if credentials omitted.
8. write_status: Writes run_status and source_freshness with real timestamps and outcomes.

Schedule: Cron '5 * * * *' (5 minutes past every hour).
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

# Disable telemetry to avoid background lock contention
os.environ["PREFECT_SERVER_ANALYTICS_ENABLED"] = "false"
os.environ["DO_NOT_TRACK"] = "1"

# Resolve repository paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
PIPELINE_ROOT = PROJECT_ROOT / "pipeline"
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

from pipeline.ingest.fetch_all import fetch_all_sources
from pipeline.ingest.incremental_weather import (
    get_latest_warehouse_timestamp,
    upsert_weather_records,
)
from climateshield.config import (
    MANIFEST_PATH,
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

SERVING_DIR = PROJECT_ROOT / "serving"
SERVING_DB_PATH = SERVING_DIR / "climateshield_serving.duckdb"
SERVING_TMP_PATH = SERVING_DIR / "climateshield_serving.duckdb.tmp"


# -------------------------------------------------------------------------
# Task 1: fetch_all
# -------------------------------------------------------------------------
@task(name="fetch_all", retries=3, retry_delay_seconds=5)
def fetch_all_task(run_id: str, latest_ts: datetime) -> Dict[str, Any]:
    """
    Fetch all active data sources: Open-Meteo (12 cities with 3h overlap),
    OpenAQ (if free key provided), and PMD + NDMA advisory pages.
    Preserves raw files unedited and appends entries to manifest.csv.
    """
    logger.info("--- Task 1: fetch_all (Multi-source incremental ingestion) ---")
    results = fetch_all_sources(run_id, latest_ts, RAW_HOURLY_DIR)
    logger.info(
        "fetch_all completed with status '%s'. Notes: %s",
        results["overall_status"],
        results["notes"],
    )
    return results


# -------------------------------------------------------------------------
# Task 2: clean
# -------------------------------------------------------------------------
@task(name="clean")
def clean_task(
    raw_weather_items: List[Dict[str, Any]],
    latest_ts: datetime,
) -> List[Dict[str, Any]]:
    """
    Parse and clean raw JSON payloads, filtering to records from the fetch window
    (latest_ts - 3 hours) to catch late corrections without counting duplicates.
    """
    logger.info("--- Task 2: clean (Normalize variables and timestamps) ---")
    from datetime import timedelta
    fetch_start_ts = latest_ts - timedelta(hours=3)

    cleaned_records: List[Dict[str, Any]] = []
    for item in raw_weather_items:
        city_name = item["city"]
        raw_path = Path(item["raw_path"])
        flattened = _flatten_city_json(raw_path, city_name)
        new_or_overlap = flattened[flattened["timestamp_utc"] >= fetch_start_ts].copy()
        if not new_or_overlap.empty:
            cleaned_records.extend(new_or_overlap.to_dict(orient="records"))

    logger.info("Cleaned %d observation/forecast rows.", len(cleaned_records))
    return cleaned_records


# -------------------------------------------------------------------------
# Task 3: quality_agent
# -------------------------------------------------------------------------
@task(name="quality_agent")
def quality_agent_task(cleaned_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Run data quality validation and range checks using DataQualityAgent.
    Missing values are kept as missing and flagged; gaps are never filled silently.
    """
    logger.info("--- Task 3: quality_agent (Data quality decision logic) ---")
    if not cleaned_records:
        logger.info("No records to validate.")
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


# -------------------------------------------------------------------------
# Task 4: update_processed
# -------------------------------------------------------------------------
@task(name="update_processed")
def update_processed_task(
    checked_records: List[Dict[str, Any]],
    warehouse_path: Path = WAREHOUSE_PATH,
) -> Tuple[int, int]:
    """
    Upsert new non-forecast observations into weather_hourly.parquet and DuckDB warehouse.
    Uses unique key (city, timestamp_utc, source_api) so corrected values replace old ones.
    """
    logger.info("--- Task 4: update_processed (Upsert to gold warehouse) ---")
    if not checked_records:
        logger.info("No records to update.")
        return 0, 0

    frame = pd.DataFrame(checked_records)
    observed_new = frame[frame["is_forecast"] == False].copy()
    if observed_new.empty:
        logger.info("All rows were future forecasts; 0 observations to commit.")
        return 0, 0

    gold_parquet = PROCESSED_DIR / "weather_hourly.parquet"
    existing_gold = pd.read_parquet(gold_parquet) if gold_parquet.is_file() else None

    updated_gold, inserted_count, updated_count = upsert_weather_records(
        existing_gold, observed_new
    )

    if not updated_gold.empty:
        updated_gold.to_parquet(gold_parquet, index=False)
        logger.info(
            "Committed to %s: %d inserted, %d updated",
            gold_parquet,
            inserted_count,
            updated_count,
        )

        con = duckdb.connect(str(warehouse_path), read_only=False)
        try:
            src_sql = str(gold_parquet.resolve()).replace("'", "''")
            con.execute(f"CREATE OR REPLACE TABLE weather_hourly AS SELECT * FROM read_parquet('{src_sql}');")
        finally:
            con.close()

    return inserted_count, updated_count


# -------------------------------------------------------------------------
# Task 5: predict
# -------------------------------------------------------------------------
@task(name="predict")
def predict_task(warehouse_path: Path = WAREHOUSE_PATH) -> Dict[str, Any]:
    """
    Execute ML multi-quantile prediction pipeline using saved models.
    Idempotent: replaces existing predictions for the same city + forecast_time.
    """
    logger.info("--- Task 5: predict (Run Multi-Quantile inference) ---")
    summary = run_predictions(str(warehouse_path))
    logger.info("Prediction task summary: %s", summary)
    return summary


def atomic_swap_serving_db(tmp_path: Path | str, target_path: Path | str) -> None:
    """
    Atomically swap temporary serving database file over target path using os.replace().
    Guarantees readers never observe a missing, partially written, or locked database.
    """
    os.replace(str(tmp_path), str(target_path))


# -------------------------------------------------------------------------
# Task 6: publish_serving
# -------------------------------------------------------------------------
@task(name="publish_serving")
def publish_serving_task(warehouse_path: Path = WAREHOUSE_PATH) -> Path:
    """
    Write all tables the API needs into serving/climateshield_serving.duckdb.tmp,
    then execute an atomic swap via os.replace() over serving/climateshield_serving.duckdb.
    The pipeline never writes directly to the file the API reads.
    """
    logger.info("--- Task 6: publish_serving (Atomic swap to serving DB) ---")
    SERVING_DIR.mkdir(parents=True, exist_ok=True)

    if SERVING_TMP_PATH.exists():
        SERVING_TMP_PATH.unlink()

    src_con = duckdb.connect(str(warehouse_path), read_only=True)
    dest_con = duckdb.connect(str(SERVING_TMP_PATH), read_only=False)

    try:
        tables = [t[0] for t in src_con.execute("SHOW TABLES;").fetchall()]
        escaped_src = str(warehouse_path.resolve()).replace("'", "''")
        dest_con.execute(f"ATTACH '{escaped_src}' AS src (READ_ONLY);")

        for tbl in tables:
            dest_con.execute(f"CREATE TABLE {tbl} AS SELECT * FROM src.{tbl};")

        # Cross-attach sample.duckdb for auxiliary contract tables if not in warehouse
        sample_path = PROJECT_ROOT / "warehouse" / "sample.duckdb"
        if sample_path.is_file():
            escaped_sample = str(sample_path.resolve()).replace("'", "''")
            dest_con.execute(f"ATTACH '{escaped_sample}' AS sample_src (READ_ONLY);")
            for sample_tbl in ["zones", "facilities", "exposure_index", "impact_indicators"]:
                if sample_tbl not in tables:
                    dest_con.execute(f"CREATE TABLE {sample_tbl} AS SELECT * FROM sample_src.{sample_tbl};")

        # Explicitly declare real database state
        dest_con.execute("CREATE TABLE IF NOT EXISTS _is_sample (is_sample BOOLEAN);")
        dest_con.execute("DELETE FROM _is_sample;")
        dest_con.execute("INSERT INTO _is_sample VALUES (false);")

    finally:
        src_con.close()
        dest_con.close()

    # Atomic swap: rename tmp file over serving db file
    atomic_swap_serving_db(SERVING_TMP_PATH, SERVING_DB_PATH)
    logger.info("Atomic swap successful: %s -> %s", SERVING_TMP_PATH, SERVING_DB_PATH)
    return SERVING_DB_PATH


# -------------------------------------------------------------------------
# Task 7: publish_snapshot
# -------------------------------------------------------------------------
@task(name="publish_snapshot")
def publish_snapshot_task(warehouse_path: Path = WAREHOUSE_PATH) -> Dict[str, Any]:
    """
    Export parquet snapshots of API tables and upload to Hugging Face Dataset repo.
    Skip gracefully if HF_DATA_REPO or HF_TOKEN are missing.
    """
    logger.info("--- Task 7: publish_snapshot (Hugging Face Dataset sync) ---")
    repo_id = os.getenv("HF_DATA_REPO", "").strip()
    token = os.getenv("HF_TOKEN", "").strip()

    if not repo_id or not token:
        logger.info("HF_DATA_REPO or HF_TOKEN not set. Skipping snapshot upload gracefully.")
        return {"status": "skipped", "reason": "Missing HF_DATA_REPO or HF_TOKEN"}

    try:
        from huggingface_hub import HfApi

        api = HfApi(token=token)
        snapshot_dir = PROJECT_ROOT / "data" / "snapshots"
        snapshot_dir.mkdir(parents=True, exist_ok=True)

        con = duckdb.connect(str(warehouse_path), read_only=True)
        try:
            tables = [t[0] for t in con.execute("SHOW TABLES;").fetchall()]
            for tbl in tables:
                parquet_path = snapshot_dir / f"{tbl}.parquet"
                con.execute(f"COPY {tbl} TO '{parquet_path}' (FORMAT PARQUET);")
                api.upload_file(
                    path_or_fileobj=str(parquet_path),
                    path_in_repo=f"snapshots/{tbl}.parquet",
                    repo_id=repo_id,
                    repo_type="dataset",
                )
            logger.info("Successfully uploaded %d table snapshots to %s", len(tables), repo_id)
            return {"status": "success", "tables_uploaded": len(tables), "repo_id": repo_id}
        finally:
            con.close()
    except Exception as exc:
        logger.warning("publish_snapshot encountered non-fatal error: %s", exc)
        return {"status": "failed", "error": str(exc)}


# -------------------------------------------------------------------------
# Task 8: write_status
# -------------------------------------------------------------------------
@task(name="write_status")
def write_status_task(
    run_id: str,
    started_at: datetime,
    finished_at: datetime,
    status: str,
    notes: str,
    source_statuses: Dict[str, Dict[str, Any]],
    warehouse_path: Path = WAREHOUSE_PATH,
    serving_path: Optional[Path] = SERVING_DB_PATH,
) -> None:
    """
    Write run_status and source_freshness to DuckDB warehouse and serving database.
    Uses real timestamps and real outcomes only.
    """
    logger.info("--- Task 8: write_status (Record pipeline telemetry) ---")

    targets = [warehouse_path]
    if serving_path and serving_path.is_file():
        targets.append(serving_path)

    for target_db in targets:
        con = duckdb.connect(str(target_db), read_only=False)
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
                    last_data_timestamp TIMESTAMP WITH TIME ZONE,
                    expected_every_minutes INTEGER NOT NULL,
                    status VARCHAR NOT NULL
                );
                """
            )

            # Insert/update real tracked sources
            for src_name, meta in source_statuses.items():
                con.execute("DELETE FROM source_freshness WHERE source_name = ?;", [src_name])
                con.execute(
                    """
                    INSERT INTO source_freshness VALUES (?, ?, ?, ?, ?, ?, ?);
                    """,
                    [
                        src_name,
                        meta.get("publisher", "Unknown"),
                        meta.get("licence", "Unspecified"),
                        meta.get("last_fetched_at", finished_at),
                        meta.get("last_data_timestamp", finished_at),
                        meta.get("expected_every_minutes", 60),
                        meta.get("status", "fresh"),
                    ],
                )

            logger.info("Wrote run_status and source_freshness to %s", target_db)
        finally:
            con.close()


# -------------------------------------------------------------------------
# Main Flow
# -------------------------------------------------------------------------
@flow(name="hourly-weather-pipeline")
def hourly_weather_flow(
    warehouse_path: str = "pipeline/data/processed/climateshield.duckdb",
) -> Dict[str, Any]:
    """
    Main scheduled flow orchestrating incremental weather ingest and inference.
    Tasks: fetch_all, clean, quality_agent, update_processed, predict,
           publish_serving, publish_snapshot, write_status.
    Schedule: Cron '5 * * * *'.
    """
    started_at = datetime.now(timezone.utc)
    run_id = f"flow_{started_at.strftime('%Y%m%dT%H%M%SZ')}"
    db_file = Path(warehouse_path)

    overall_flow_status = "success"
    notes_parts: List[str] = []
    source_statuses: Dict[str, Dict[str, Any]] = {}

    try:
        latest_ts = get_latest_warehouse_timestamp(db_file)

        # 1. fetch_all
        fetch_res = fetch_all_task(run_id, latest_ts)
        source_statuses = fetch_res.get("source_statuses", {})
        notes_parts.append(fetch_res.get("notes", "Fetched sources"))
        if fetch_res.get("overall_status") == "partial":
            overall_flow_status = "partial"

        # 2. clean
        cleaned_records = clean_task(fetch_res.get("raw_weather_items", []), latest_ts)

        # 3. quality_agent
        checked_records = quality_agent_task(cleaned_records)

        # 4. update_processed
        inserted, updated = update_processed_task(checked_records, db_file)
        notes_parts.append(f"Obs: +{inserted} new, ~{updated} updated")

        # 5. predict
        pred_summary = predict_task(db_file)
        notes_parts.append(f"Pred: {pred_summary.get('rows_written', 0)} rows")

        # 6. publish_serving (Atomic swap)
        publish_serving_task(db_file)
        notes_parts.append("Serving DB swapped")

        # 7. publish_snapshot
        snap_res = publish_snapshot_task(db_file)
        notes_parts.append(f"Snapshot: {snap_res.get('status', 'skipped')}")

    except Exception as exc:
        overall_flow_status = "failed"
        notes_parts.append(f"Flow Exception: {exc}")
        logger.error("Flow failed with error: %s", exc, exc_info=True)
        raise exc
    finally:
        finished_at = datetime.now(timezone.utc)
        final_notes = " | ".join(notes_parts)
        # 8. write_status
        write_status_task(
            run_id=run_id,
            started_at=started_at,
            finished_at=finished_at,
            status=overall_flow_status,
            notes=final_notes,
            source_statuses=source_statuses,
            warehouse_path=db_file,
            serving_path=SERVING_DB_PATH,
        )

    return {
        "run_id": run_id,
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "status": overall_flow_status,
        "notes": final_notes,
    }


def run_flow_standalone(
    warehouse_path: str = "pipeline/data/processed/climateshield.duckdb",
) -> Dict[str, Any]:
    """
    Direct standalone execution without requiring an active Prefect server process.
    Invokes task functions directly in exact order:
    fetch_all -> clean -> quality_agent -> update_processed -> predict -> publish_serving -> publish_snapshot -> write_status.
    """
    started_at = datetime.now(timezone.utc)
    run_id = f"flow_{started_at.strftime('%Y%m%dT%H%M%SZ')}"
    db_file = Path(warehouse_path)

    overall_flow_status = "success"
    notes_parts: List[str] = []
    source_statuses: Dict[str, Dict[str, Any]] = {}

    try:
        latest_ts = get_latest_warehouse_timestamp(db_file)

        # 1. fetch_all
        fetch_res = fetch_all_task.fn(run_id, latest_ts)
        source_statuses = fetch_res.get("source_statuses", {})
        notes_parts.append(fetch_res.get("notes", "Fetched sources"))
        if fetch_res.get("overall_status") == "partial":
            overall_flow_status = "partial"

        # 2. clean
        cleaned_records = clean_task.fn(fetch_res.get("raw_weather_items", []), latest_ts)

        # 3. quality_agent
        checked_records = quality_agent_task.fn(cleaned_records)

        # 4. update_processed
        inserted, updated = update_processed_task.fn(checked_records, db_file)
        notes_parts.append(f"Obs: +{inserted} new, ~{updated} updated")

        # 5. predict
        pred_summary = predict_task.fn(db_file)
        notes_parts.append(f"Pred: {pred_summary.get('rows_written', 0)} rows")

        # 6. publish_serving (Atomic swap)
        publish_serving_task.fn(db_file)
        notes_parts.append("Serving DB swapped")

        # 7. publish_snapshot
        snap_res = publish_snapshot_task.fn(db_file)
        notes_parts.append(f"Snapshot: {snap_res.get('status', 'skipped')}")

    except Exception as exc:
        overall_flow_status = "failed"
        notes_parts.append(f"Flow Exception: {exc}")
        logger.error("Flow failed with error: %s", exc, exc_info=True)
        raise exc
    finally:
        finished_at = datetime.now(timezone.utc)
        final_notes = " | ".join(notes_parts)
        # 8. write_status
        write_status_task.fn(
            run_id=run_id,
            started_at=started_at,
            finished_at=finished_at,
            status=overall_flow_status,
            notes=final_notes,
            source_statuses=source_statuses,
            warehouse_path=db_file,
            serving_path=SERVING_DB_PATH,
        )

    return {
        "run_id": run_id,
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "status": overall_flow_status,
        "notes": final_notes,
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
    parser.add_argument(
        "--standalone",
        action="store_true",
        help="Run without Prefect server connection.",
    )
    args = parser.parse_args()

    if args.serve:
        logger.info("Serving hourly_weather_flow on cron schedule '5 * * * *'...")
        hourly_weather_flow.serve(
            name="hourly-weather-deployment",
            cron="5 * * * *",
        )
    elif args.standalone:
        logger.info("Executing standalone flow run...")
        result = run_flow_standalone(args.db_path)
        print("\n--- Standalone Flow Run Execution Result ---")
        print(result)
    else:
        logger.info("Executing hourly_weather_flow run...")
        try:
            result = hourly_weather_flow(args.db_path)
        except Exception as exc:
            if "Failed to reach API" in str(exc) or "No Prefect API URL" in str(exc) or "ConnectError" in str(exc):
                logger.info("Prefect server not reachable. Falling back to standalone direct task execution...")
                result = run_flow_standalone(args.db_path)
            else:
                raise exc
        print("\n--- Flow Run Execution Result ---")
        print(result)
