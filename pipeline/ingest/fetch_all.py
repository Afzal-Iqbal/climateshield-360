"""
PakRoad FloodWatch / ClimateShield 360 - Unified Multi-Source Ingestion Coordinator
Stage 1 Ingestion - ClimateShield 360

Coordinates:
1. Open-Meteo Hourly Weather for 12 cities (with 3-hour overlap window)
2. OpenAQ Air Quality (if free key available, else graceful skip)
3. PMD FFD Flood Advisory page checks
4. NDMA Warning Advisory page checks

Guarantees:
- Every fetch appends a manifest.csv entry (source, query, fetch time in UTC, SHA-256, licence).
- Raw files are never edited.
- Failed source does not stop other sources or corrupt earlier data.
- Records failures in run_status notes and marks failed/unreachable sources as Late.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import duckdb
import pandas as pd

from climateshield.config import (
    MANIFEST_PATH,
    OPEN_METEO_CITY_POINTS,
    RAW_HOURLY_DIR,
    SOURCE_LICENCES,
    WAREHOUSE_PATH,
)
from pipeline.ingest.advisory_fetcher import fetch_advisories
from pipeline.ingest.incremental_weather import (
    fetch_city_weather_raw,
    get_latest_warehouse_timestamp,
)
from pipeline.ingest.openaq_fetcher import fetch_openaq

logger = logging.getLogger("climateshield.fetch_all")


def fetch_all_sources(
    run_id: str,
    latest_ts: datetime,
    raw_hourly_dir: Path = RAW_HOURLY_DIR,
) -> Dict[str, Any]:
    """
    Fetch all active data sources for the current hourly run.
    Returns:
        dict containing:
        - raw_weather_items: list of fetched weather dicts
        - advisory_results: dict with PMD and NDMA fetch status
        - openaq_results: dict with OpenAQ fetch status
        - source_statuses: dict mapping source_name -> (status, notes, last_data_ts)
        - overall_status: "success" | "partial" | "failed"
        - notes: diagnostic summary
    """
    now_utc = datetime.now(timezone.utc)
    run_raw_dir = raw_hourly_dir / run_id
    run_raw_dir.mkdir(parents=True, exist_ok=True)

    manifest_entries: List[Dict[str, Any]] = []
    source_statuses: Dict[str, Dict[str, Any]] = {}
    notes_parts: List[str] = []

    # ---------------------------------------------------------
    # Source 1: Open-Meteo Hourly Weather (12 Cities)
    # ---------------------------------------------------------
    raw_weather_items: List[Dict[str, Any]] = []
    failed_cities: List[str] = []
    weather_licence = SOURCE_LICENCES.get("01_open_meteo_heat_rainfall", {}).get("licence", "CC-BY-4.0")
    weather_url = SOURCE_LICENCES.get("01_open_meteo_heat_rainfall", {}).get("source_url", "https://open-meteo.com/")

    # 3-hour overlap window to capture late corrections
    from datetime import timedelta
    overlap_window = timedelta(hours=3)
    start_ts = latest_ts - overlap_window
    start_date = start_ts.strftime("%Y-%m-%d")
    end_date = now_utc.strftime("%Y-%m-%d")

    for slug, point in OPEN_METEO_CITY_POINTS.items():
        city_name = point["city"]
        try:
            raw_bytes, q_url = fetch_city_weather_raw(slug, point, start_date, end_date)
            raw_filename = f"weather_{slug}_raw.json"
            raw_path = run_raw_dir / raw_filename
            raw_path.write_bytes(raw_bytes)

            import hashlib
            sha256 = hashlib.sha256(raw_bytes).hexdigest()

            manifest_entries.append({
                "filepath": f"hourly_ingest/{run_id}/{raw_filename}",
                "source": "Open-Meteo Hourly Weather API",
                "source_folder": "01_open_meteo_heat_rainfall",
                "query": q_url,
                "fetch_time_utc": now_utc.isoformat(),
                "archive_mtime_utc": now_utc.isoformat(),
                "sha256": sha256,
                "bytes": len(raw_bytes),
                "licence": weather_licence,
                "source_url": weather_url,
            })
            raw_weather_items.append({
                "city": city_name,
                "raw_path": str(raw_path),
                "query_url": q_url,
                "sha256": sha256,
            })
        except Exception as exc:
            logger.error("Fetch failed for weather city %s: %s", city_name, exc)
            failed_cities.append(f"{city_name}: {exc}")

    if len(raw_weather_items) == len(OPEN_METEO_CITY_POINTS):
        source_statuses["open_meteo_weather"] = {
            "source_name": "open_meteo_weather",
            "publisher": "Open-Meteo",
            "licence": weather_licence,
            "status": "fresh",
            "last_fetched_at": now_utc,
            "last_data_timestamp": latest_ts,
            "expected_every_minutes": 60,
        }
        notes_parts.append(f"Open-Meteo: {len(raw_weather_items)}/12 cities fetched")
    elif raw_weather_items:
        source_statuses["open_meteo_weather"] = {
            "source_name": "open_meteo_weather",
            "publisher": "Open-Meteo",
            "licence": weather_licence,
            "status": "late",
            "last_fetched_at": now_utc,
            "last_data_timestamp": latest_ts,
            "expected_every_minutes": 60,
        }
        notes_parts.append(f"Open-Meteo: partial ({len(raw_weather_items)}/12 cities fetched; failures: {', '.join(failed_cities)})")
    else:
        source_statuses["open_meteo_weather"] = {
            "source_name": "open_meteo_weather",
            "publisher": "Open-Meteo",
            "licence": weather_licence,
            "status": "failed",
            "last_fetched_at": now_utc,
            "last_data_timestamp": latest_ts,
            "expected_every_minutes": 60,
        }
        notes_parts.append(f"Open-Meteo: all cities failed ({', '.join(failed_cities)})")

    # ---------------------------------------------------------
    # Source 2: Advisory Page Checks (PMD and NDMA)
    # ---------------------------------------------------------
    advisory_res = fetch_advisories(run_id, run_raw_dir)
    manifest_entries.extend(advisory_res.get("manifest_rows", []))

    # PMD
    pmd_status = advisory_res["pmd"]["status"]
    pmd_stat_label = "fresh" if pmd_status == "success" else "late"
    source_statuses["pmd_ffd_homepage"] = {
        "source_name": "pmd_ffd_homepage",
        "publisher": "Pakistan Meteorological Department",
        "licence": "licence_unspecified_official_publication",
        "status": pmd_stat_label,
        "last_fetched_at": now_utc,
        "last_data_timestamp": now_utc if pmd_status == "success" else latest_ts,
        "expected_every_minutes": 180,
    }
    notes_parts.append(f"PMD Advisory: {pmd_status}")

    # NDMA
    ndma_status = advisory_res["ndma"]["status"]
    ndma_stat_label = "fresh" if ndma_status == "success" else "late"
    source_statuses["ndma_homepage"] = {
        "source_name": "ndma_homepage",
        "publisher": "National Disaster Management Authority",
        "licence": "licence_unspecified_official_publication",
        "status": ndma_stat_label,
        "last_fetched_at": now_utc,
        "last_data_timestamp": now_utc if ndma_status == "success" else latest_ts,
        "expected_every_minutes": 180,
    }
    notes_parts.append(f"NDMA Advisory: {ndma_status}")

    # ---------------------------------------------------------
    # Source 3: OpenAQ Air Quality (if configured)
    # ---------------------------------------------------------
    openaq_res = fetch_openaq(run_id, run_raw_dir)
    manifest_entries.extend(openaq_res.get("manifest_rows", []))
    if openaq_res["status"] == "success":
        source_statuses["openaq_air_quality"] = {
            "source_name": "openaq_air_quality",
            "publisher": "OpenAQ",
            "licence": "CC-BY-4.0",
            "status": "fresh",
            "last_fetched_at": now_utc,
            "last_data_timestamp": now_utc,
            "expected_every_minutes": 60,
        }
        notes_parts.append("OpenAQ: fetched")
    elif openaq_res["status"] == "failed":
        source_statuses["openaq_air_quality"] = {
            "source_name": "openaq_air_quality",
            "publisher": "OpenAQ",
            "licence": "CC-BY-4.0",
            "status": "late",
            "last_fetched_at": now_utc,
            "last_data_timestamp": latest_ts,
            "expected_every_minutes": 60,
        }
        notes_parts.append(f"OpenAQ: failed ({openaq_res.get('error')})")
    else:
        # Skipped because key not provided
        notes_parts.append("OpenAQ: skipped (no API key configured)")

    # ---------------------------------------------------------
    # Append all new manifest entries to manifest.csv
    # ---------------------------------------------------------
    if manifest_entries:
        new_manifest_df = pd.DataFrame(manifest_entries)
        if MANIFEST_PATH.is_file():
            existing_manifest = pd.read_csv(MANIFEST_PATH)
            combined_manifest = pd.concat([existing_manifest, new_manifest_df], ignore_index=True)
            combined_manifest = combined_manifest.drop_duplicates(subset=["filepath", "sha256"], keep="last")
        else:
            combined_manifest = new_manifest_df
        combined_manifest.to_csv(MANIFEST_PATH, index=False)
        logger.info("Committed %d entries to %s", len(manifest_entries), MANIFEST_PATH)

    # ---------------------------------------------------------
    # Determine overall status: success, partial, failed
    # ---------------------------------------------------------
    weather_ok = len(raw_weather_items) == len(OPEN_METEO_CITY_POINTS)
    any_failed = (
        failed_cities
        or pmd_status != "success"
        or ndma_status != "success"
        or openaq_res.get("status") == "failed"
    )

    if weather_ok and not any_failed:
        overall_status = "success"
    elif raw_weather_items:
        overall_status = "partial"
    else:
        overall_status = "failed"

    return {
        "raw_weather_items": raw_weather_items,
        "advisory_results": advisory_res,
        "openaq_results": openaq_res,
        "source_statuses": source_statuses,
        "overall_status": overall_status,
        "notes": " | ".join(notes_parts),
        "fetch_time_utc": now_utc,
    }
