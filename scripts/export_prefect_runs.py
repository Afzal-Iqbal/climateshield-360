"""
PakRoad FloodWatch / ClimateShield 360 - Export Prefect Run History
Author: HackInsight 2026 Team (Climate & Infrastructure Analytics Track)

This script exports all recorded Prefect orchestration flow runs unedited
to `prefect_runs.csv` for reproducibility and viva presentation.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s]: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("export_prefect_runs")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_CSV = PROJECT_ROOT / "doc" / "prefect_runs.csv"


async def fetch_runs_via_api() -> List[Dict[str, Any]]:
    """Attempt fetching flow runs through the running Prefect API client."""
    from prefect.client.orchestration import get_client

    async with get_client() as client:
        runs = await client.read_flow_runs()
        records: List[Dict[str, Any]] = []
        for r in runs:
            if hasattr(r, "model_dump"):
                records.append(r.model_dump())
            elif hasattr(r, "dict"):
                records.append(r.dict())
            else:
                records.append(vars(r))
        return records


def fetch_runs_via_sqlite() -> List[Dict[str, Any]]:
    """Direct unedited read from Prefect's local SQLite database (~/.prefect/prefect.db)."""
    db_path = Path(os.path.expanduser("~/.prefect/prefect.db"))
    if not db_path.is_file():
        logger.warning("No Prefect SQLite DB found at: %s", db_path)
        return []

    conn = sqlite3.connect(str(db_path))
    try:
        df = pd.read_sql_query("SELECT * FROM flow_run ORDER BY created DESC;", conn)
        return df.to_dict(orient="records")
    finally:
        conn.close()


def export_runs(output_path: Path = OUTPUT_CSV) -> Path:
    """Export flow runs unedited to CSV."""
    records: List[Dict[str, Any]] = []

    # 1. Try API client first if server is running
    try:
        logger.info("Attempting export via Prefect API client...")
        records = asyncio.run(fetch_runs_via_api())
        logger.info("Retrieved %d run records from Prefect API.", len(records))
    except Exception as exc:
        logger.info("Prefect API offline or unreachable (%s); reading directly from local SQLite...", exc)
        records = fetch_runs_via_sqlite()
        logger.info("Retrieved %d run records from local SQLite.", len(records))

    if not records:
        logger.warning("No flow run history records found to export.")
        df = pd.DataFrame(
            columns=[
                "id",
                "name",
                "flow_id",
                "state_type",
                "state_name",
                "start_time",
                "end_time",
                "total_run_time",
                "created",
            ]
        )
    else:
        df = pd.DataFrame(records)

    # Save unedited to CSV
    df.to_csv(output_path, index=False)
    logger.info("Successfully exported %d run records to %s", len(df), output_path)
    return output_path


if __name__ == "__main__":
    out_file = export_runs()
    print(f"\n[OK] Prefect runs exported unedited to: {out_file}")
