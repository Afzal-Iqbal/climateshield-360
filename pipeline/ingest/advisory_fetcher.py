"""
Advisory page fetcher for PMD (Pakistan Meteorological Department)
and NDMA (National Disaster Management Authority).
Stage 1 Ingestion - ClimateShield 360.
"""

from __future__ import annotations

import hashlib
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.request import Request, urlopen

from climateshield.config import (
    MANIFEST_PATH,
    RAW_HOURLY_DIR,
    SOURCE_LICENCES,
)

logger = logging.getLogger("climateshield.advisory_fetcher")

# Official Advisory Endpoints
PMD_FFD_URL = "https://www.pmd.gov.pk/"
NDMA_ALERTS_URL = "https://ndma.gov.pk/"


def fetch_advisory_url(
    url: str,
    source_name: str,
    max_retries: int = 3,
    timeout_seconds: int = 15,
) -> Tuple[bytes, str]:
    """
    Fetch an advisory page with exponential backoff (3 tries) and timeout.
    Returns (raw_bytes, final_url).
    """
    headers = {
        "User-Agent": "ClimateShield360/0.1 (Sindh Emergency Operations; Advisory Ingestion)"
    }
    last_err: Optional[Exception] = None

    for attempt in range(1, max_retries + 1):
        try:
            req = Request(url, headers=headers)
            with urlopen(req, timeout=timeout_seconds) as resp:
                raw_bytes = resp.read()
                if not raw_bytes:
                    raise RuntimeError(f"Empty response from {url}")
                return raw_bytes, url
        except Exception as e:
            last_err = e
            backoff = 2 ** attempt
            logger.warning(
                "Attempt %d/%d failed for %s (%s): %s. Backing off %ds...",
                attempt,
                max_retries,
                source_name,
                url,
                e,
                backoff,
            )
            time.sleep(backoff)

    raise RuntimeError(
        f"Failed to fetch advisory for {source_name} after {max_retries} attempts: {last_err}"
    )


def fetch_advisories(
    run_id: str,
    raw_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Check PMD and NDMA advisory pages.
    Saves raw HTML unedited to data/raw/hourly_ingest/<run_id>/
    Appends entry to manifest.csv.
    A failed advisory fetch never crashes the pipeline; failure is recorded.
    """
    now_utc = datetime.now(timezone.utc)
    if raw_dir is None:
        raw_dir = RAW_HOURLY_DIR / run_id
    raw_dir.mkdir(parents=True, exist_ok=True)

    results: Dict[str, Any] = {
        "pmd": {"status": "pending", "error": None, "sha256": None, "bytes": 0},
        "ndma": {"status": "pending", "error": None, "sha256": None, "bytes": 0},
    }
    manifest_rows: List[Dict[str, Any]] = []

    licence_meta = SOURCE_LICENCES.get("03_ndma_pmd_hazards_warnings", {})
    licence_name = licence_meta.get("licence", "licence_unspecified_official_publication")
    source_url_meta = licence_meta.get("source_url", "https://ndma.gov.pk/ ; https://www.pmd.gov.pk/")

    # 1. PMD Advisory
    try:
        raw_bytes, q_url = fetch_advisory_url(PMD_FFD_URL, "PMD FFD Advisory")
        filename = "pmd_advisory_raw.html"
        save_path = raw_dir / filename
        save_path.write_bytes(raw_bytes)
        sha256 = hashlib.sha256(raw_bytes).hexdigest()

        manifest_rows.append({
            "filepath": f"hourly_ingest/{run_id}/{filename}",
            "source": "PMD FFD Advisory",
            "source_folder": "03_ndma_pmd_hazards_warnings",
            "query": q_url,
            "fetch_time_utc": now_utc.isoformat(),
            "archive_mtime_utc": now_utc.isoformat(),
            "sha256": sha256,
            "bytes": len(raw_bytes),
            "licence": licence_name,
            "source_url": source_url_meta,
        })
        results["pmd"] = {
            "status": "success",
            "error": None,
            "sha256": sha256,
            "bytes": len(raw_bytes),
            "file": str(save_path),
            "fetched_at": now_utc,
        }
    except Exception as exc:
        logger.error("PMD Advisory check failed: %s", exc)
        results["pmd"] = {"status": "failed", "error": str(exc), "fetched_at": now_utc}

    # 2. NDMA Advisory
    try:
        raw_bytes, q_url = fetch_advisory_url(NDMA_ALERTS_URL, "NDMA Warning Cell")
        filename = "ndma_advisory_raw.html"
        save_path = raw_dir / filename
        save_path.write_bytes(raw_bytes)
        sha256 = hashlib.sha256(raw_bytes).hexdigest()

        manifest_rows.append({
            "filepath": f"hourly_ingest/{run_id}/{filename}",
            "source": "NDMA Alerts Advisory",
            "source_folder": "03_ndma_pmd_hazards_warnings",
            "query": q_url,
            "fetch_time_utc": now_utc.isoformat(),
            "archive_mtime_utc": now_utc.isoformat(),
            "sha256": sha256,
            "bytes": len(raw_bytes),
            "licence": licence_name,
            "source_url": source_url_meta,
        })
        results["ndma"] = {
            "status": "success",
            "error": None,
            "sha256": sha256,
            "bytes": len(raw_bytes),
            "file": str(save_path),
            "fetched_at": now_utc,
        }
    except Exception as exc:
        logger.error("NDMA Advisory check failed: %s", exc)
        results["ndma"] = {"status": "failed", "error": str(exc), "fetched_at": now_utc}

    results["manifest_rows"] = manifest_rows
    return results
