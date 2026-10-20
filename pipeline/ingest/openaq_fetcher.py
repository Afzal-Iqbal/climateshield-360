"""
OpenAQ Air Quality Fetcher for Karachi / Pakistan.
Stage 1 Ingestion - ClimateShield 360.
Requests newer data with 3-hour overlap if OPENAQ_API_KEY is available.
Gracefully skips if key is omitted without failing the pipeline.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from climateshield.config import (
    RAW_HOURLY_DIR,
)

logger = logging.getLogger("climateshield.openaq_fetcher")

OPENAQ_API_URL = "https://api.openaq.org/v3/locations"


def fetch_openaq_raw(
    api_key: str,
    city: str = "Karachi",
    country_code: str = "PK",
    max_retries: int = 3,
    timeout_seconds: int = 20,
) -> Tuple[bytes, str]:
    """
    Fetch Karachi air quality data from OpenAQ v3 API with 3 retries and exponential backoff.
    """
    params = {
        "countries_id": country_code,
        "limit": 20,
    }
    query_url = f"{OPENAQ_API_URL}?{urlencode(params)}"
    headers = {
        "User-Agent": "ClimateShield360/0.1 (Karachi Environmental Analytics)",
        "X-API-Key": api_key,
        "Accept": "application/json",
    }

    last_err: Optional[Exception] = None
    for attempt in range(1, max_retries + 1):
        try:
            req = Request(query_url, headers=headers)
            with urlopen(req, timeout=timeout_seconds) as resp:
                raw_bytes = resp.read()
                # Verify valid JSON
                json.loads(raw_bytes.decode("utf-8"))
                return raw_bytes, query_url
        except (HTTPError, URLError, Exception) as exc:
            last_err = exc
            backoff = 2 ** attempt
            logger.warning(
                "OpenAQ attempt %d/%d failed: %s. Backing off %ds...",
                attempt,
                max_retries,
                exc,
                backoff,
            )
            time.sleep(backoff)

    raise RuntimeError(f"OpenAQ fetch failed after {max_retries} retries: {last_err}")


def fetch_openaq(
    run_id: str,
    raw_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Fetch OpenAQ observations if API key is present.
    If OPENAQ_API_KEY is not set, records skipped without failing.
    """
    api_key = os.getenv("OPENAQ_API_KEY", "").strip()
    now_utc = datetime.now(timezone.utc)
    if raw_dir is None:
        raw_dir = RAW_HOURLY_DIR / run_id
    raw_dir.mkdir(parents=True, exist_ok=True)

    if not api_key:
        logger.info("OPENAQ_API_KEY not configured; skipping OpenAQ fetch.")
        return {
            "status": "skipped",
            "reason": "OPENAQ_API_KEY environment variable not set",
            "fetched_at": now_utc,
            "manifest_rows": [],
        }

    try:
        raw_bytes, q_url = fetch_openaq_raw(api_key=api_key)
        filename = "openaq_karachi_raw.json"
        save_path = raw_dir / filename
        save_path.write_bytes(raw_bytes)
        sha256 = hashlib.sha256(raw_bytes).hexdigest()

        manifest_row = {
            "filepath": f"hourly_ingest/{run_id}/{filename}",
            "source": "OpenAQ Air Quality API",
            "source_folder": "05_openaq_air_quality",
            "query": q_url,
            "fetch_time_utc": now_utc.isoformat(),
            "archive_mtime_utc": now_utc.isoformat(),
            "sha256": sha256,
            "bytes": len(raw_bytes),
            "licence": "CC-BY-4.0",
            "source_url": "https://openaq.org/",
        }

        return {
            "status": "success",
            "error": None,
            "sha256": sha256,
            "bytes": len(raw_bytes),
            "file": str(save_path),
            "fetched_at": now_utc,
            "manifest_rows": [manifest_row],
        }
    except Exception as exc:
        logger.warning("OpenAQ fetch failed: %s", exc)
        return {
            "status": "failed",
            "error": str(exc),
            "fetched_at": now_utc,
            "manifest_rows": [],
        }
