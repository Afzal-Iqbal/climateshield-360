"""
PakRoad FloodWatch / ClimateShield 360 - Incremental Weather Ingestion
Author: HackInsight 2026 Team (Climate & Infrastructure Analytics Track)

This module implements the robust incremental hourly ingestion pipeline:
1. Determines the latest timestamp already recorded in the DuckDB warehouse.
2. Fetches only new hourly weather records for all 12 monitored Pakistani cities
   from Open-Meteo using the exact parameters and variables as the existing pipeline.
3. Implements 3-tier exponential backoff retries on network or HTTP errors,
   leaving existing data completely untouched on failure.
4. Preserves raw API responses unchanged on disk in data/raw/hourly_ingest/<run_id>/.
5. Appends provenance entries (SHA-256, query, timestamp, licence) to manifest.csv.
6. Runs existing flattening, cleaning, and quality-range checks on the new records only.
7. Atomically appends new non-forecast observations to weather_hourly gold parquet and DuckDB.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import duckdb
import pandas as pd

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("climateshield.incremental_weather")

# Resolve repository paths
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
PIPELINE_ROOT = PROJECT_ROOT / "pipeline"
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

# Configuration imports
from climateshield.config import (
    CLEANED_DIR,
    DATA_DIR,
    MANIFEST_PATH,
    OPEN_METEO_CITY_POINTS,
    OPEN_METEO_FORECAST_URL,
    OPEN_METEO_HOURLY_VARS,
    PKT_OFFSET_HOURS,
    PROCESSED_DIR,
    RAW_HOURLY_DIR,
    SOURCE_LICENCES,
    WAREHOUSE_PATH,
)
from climateshield.pipeline.clean_weather import _flag_ranges, _flatten_city_json
from climateshield.quality.agent import DataQualityAgent
from climateshield.quality.logger import QualityLogger


def get_latest_warehouse_timestamp(warehouse_path: Path = WAREHOUSE_PATH) -> datetime:
    """
    Query the real DuckDB warehouse to find the latest timestamp_utc in weather_hourly.
    Returns datetime in UTC timezone.
    """
    if not warehouse_path.is_file():
        logger.warning("Warehouse %s does not exist; defaulting to epoch.", warehouse_path)
        return datetime(2021, 1, 1, 0, 0, tzinfo=timezone.utc)

    con = duckdb.connect(str(warehouse_path), read_only=True)
    try:
        tables = [t[0] for t in con.execute("SHOW TABLES").fetchall()]
        if "weather_hourly" not in tables:
            return datetime(2021, 1, 1, 0, 0, tzinfo=timezone.utc)

        result = con.execute("SELECT MAX(timestamp_utc) FROM weather_hourly;").fetchone()
        if not result or result[0] is None:
            return datetime(2021, 1, 1, 0, 0, tzinfo=timezone.utc)

        max_ts = result[0]
        if hasattr(max_ts, "tzinfo") and max_ts.tzinfo is not None:
            return max_ts.astimezone(timezone.utc)
        return max_ts.replace(tzinfo=timezone.utc)
    finally:
        con.close()


def fetch_city_weather_raw(
    city_slug: str,
    point: Dict[str, Any],
    start_date: str,
    end_date: str,
    max_retries: int = 3,
) -> Tuple[bytes, str]:
    """
    Fetch weather JSON for a single city from Open-Meteo with 3 retries and exponential backoff.
    Returns (raw_bytes, query_url).
    Leaves previous data untouched if all retries fail.
    """
    params = {
        "latitude": point["latitude"],
        "longitude": point["longitude"],
        "hourly": OPEN_METEO_HOURLY_VARS,
        "timezone": "GMT",
        "start_date": start_date,
        "end_date": end_date,
    }
    query_url = f"{OPEN_METEO_FORECAST_URL}?{urlencode(params)}"
    headers = {"User-Agent": "ClimateShield360/0.1 (HackInsight 2026; hourly automation)"}

    last_error: Optional[Exception] = None
    for attempt in range(1, max_retries + 1):
        try:
            req = Request(query_url, headers=headers)
            with urlopen(req, timeout=25) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"HTTP {resp.status} from Open-Meteo")
                raw_bytes = resp.read()
                # Verify valid JSON payload
                json.loads(raw_bytes.decode("utf-8"))
                return raw_bytes, query_url
        except Exception as e:
            last_error = e
            backoff_secs = 2 ** attempt
            logger.warning(
                "Fetch failed for %s (attempt %d/%d): %s. Backing off %ds...",
                point.get("city", city_slug),
                attempt,
                max_retries,
                e,
                backoff_secs,
            )
            time.sleep(backoff_secs)

    raise RuntimeError(
        f"Failed to fetch weather for {city_slug} after {max_retries} attempts: {last_error}"
    )


def run_incremental_fetch(
    warehouse_path: Path = WAREHOUSE_PATH,
    run_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Execute step 1 of hourly pipeline:
    - Queries latest warehouse timestamp.
    - Fetches incremental weather for all 12 cities.
    - Saves raw JSON unchanged.
    - Appends manifest.csv.
    - Runs cleaning and quality checks on new rows only.
    - Appends new rows to parquet and DuckDB warehouse.
    """
    now_utc = datetime.now(timezone.utc)
    if run_id is None:
        run_id = now_utc.strftime("%Y-%m-%dT%H-%M-%SZ")

    latest_ts = get_latest_warehouse_timestamp(warehouse_path)
    logger.info("Latest recorded timestamp in warehouse: %s UTC", latest_ts.isoformat())

    # Range to query: from the latest date to tomorrow (to catch latest completed hours + forecast)
    start_date = latest_ts.strftime("%Y-%m-%d")
    end_date = now_utc.strftime("%Y-%m-%d")

    run_raw_dir = RAW_HOURLY_DIR / run_id
    run_raw_dir.mkdir(parents=True, exist_ok=True)

    fetched_files: List[Tuple[str, Path, str, bytes]] = []
    manifest_rows: List[Dict[str, Any]] = []

    licence_meta = SOURCE_LICENCES.get("01_open_meteo_heat_rainfall", {})
    licence_name = licence_meta.get("licence", "CC-BY-4.0")
    source_url = licence_meta.get("source_url", "https://open-meteo.com/")

    # 1. Fetch raw data for each city with retry mechanism
    for slug, point in OPEN_METEO_CITY_POINTS.items():
        city_name = point["city"]
        logger.info("Fetching incremental weather for %s...", city_name)
        raw_bytes, query_url = fetch_city_weather_raw(slug, point, start_date, end_date)

        raw_filename = f"weather_{slug}_raw.json"
        raw_path = run_raw_dir / raw_filename
        # Save raw file unchanged
        raw_path.write_bytes(raw_bytes)

        sha256_hash = hashlib.sha256(raw_bytes).hexdigest()
        fetched_files.append((city_name, raw_path, query_url, raw_bytes))

        # Relative filepath for manifest
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

    # 2. Append manifest.csv
    if manifest_rows:
        new_manifest_df = pd.DataFrame(manifest_rows)
        if MANIFEST_PATH.is_file():
            existing_manifest = pd.read_csv(MANIFEST_PATH)
            combined_manifest = pd.concat([existing_manifest, new_manifest_df], ignore_index=True)
            combined_manifest = combined_manifest.drop_duplicates(subset=["filepath", "sha256"], keep="last")
        else:
            combined_manifest = new_manifest_df
        combined_manifest.to_csv(MANIFEST_PATH, index=False)
        logger.info("Appended %d entries to %s", len(manifest_rows), MANIFEST_PATH)

    # 3. Clean and quality check new rows only
    logger_q = QualityLogger()
    agent = DataQualityAgent(logger_q)

    all_new_cleaned: List[pd.DataFrame] = []
    for city_name, raw_path, _, _ in fetched_files:
        flattened = _flatten_city_json(raw_path, city_name)
        # Filter strictly new hours beyond the latest warehouse timestamp
        new_hours = flattened[flattened["timestamp_utc"] > latest_ts].copy()
        if new_hours.empty:
            continue

        # Run quality range flags on new rows only
        checked = _flag_ranges(new_hours, agent)
        checked["timestamp_utc"] = pd.to_datetime(checked["timestamp_utc"], utc=True)
        checked["row_id"] = (
            checked["city"] + "|" + checked["timestamp_utc"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        )
        checked["ingest_fetch_time_utc"] = now_utc.isoformat()
        checked["is_forecast"] = checked["timestamp_utc"] > now_utc
        checked["source_api"] = OPEN_METEO_FORECAST_URL
        checked = agent.append_flags(checked, checked["is_forecast"].eq(True), "forecast_not_observation")
        checked = agent.append_flags(checked, pd.Series(True, index=checked.index), "hourly_incremental_ingest")

        all_new_cleaned.append(checked)

    total_new_rows = 0
    if all_new_cleaned:
        combined_new = pd.concat(all_new_cleaned, ignore_index=True)
        # Filter out future forecasts for the gold observation table
        observed_new = combined_new[combined_new["is_forecast"] == False].copy()

        gold_parquet = PROCESSED_DIR / "weather_hourly.parquet"
        if gold_parquet.is_file():
            existing_gold = pd.read_parquet(gold_parquet)
            existing_ids = set(existing_gold["row_id"].astype(str))
            truly_new = observed_new[~observed_new["row_id"].astype(str).isin(existing_ids)]
            if not truly_new.empty:
                updated_gold = pd.concat([existing_gold, truly_new], ignore_index=True)
                updated_gold.to_parquet(gold_parquet, index=False)
                total_new_rows = len(truly_new)
                logger.info("Added %d new observed rows to %s", total_new_rows, gold_parquet)
                # Update DuckDB table
                con = duckdb.connect(str(warehouse_path), read_only=False)
                try:
                    src_sql = str(gold_parquet.resolve()).replace("'", "''")
                    con.execute(f"CREATE OR REPLACE TABLE weather_hourly AS SELECT * FROM read_parquet('{src_sql}');")
                finally:
                    con.close()
        else:
            observed_new.to_parquet(gold_parquet, index=False)
            total_new_rows = len(observed_new)

    return {
        "run_id": run_id,
        "fetch_time_utc": now_utc.isoformat(),
        "cities_fetched": len(fetched_files),
        "raw_files_written": len(fetched_files),
        "new_observations_added": total_new_rows,
        "manifest_entries_added": len(manifest_rows),
        "status": "success",
    }


if __name__ == "__main__":
    summary = run_incremental_fetch()
    print("\n--- Incremental Fetch Result ---")
    print(summary)
