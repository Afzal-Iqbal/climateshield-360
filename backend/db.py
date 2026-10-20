"""
Database access module for ClimateShield 360 backend.
Rule 11: The API is read-only. Never write to the warehouse.
Connects to DuckDB serving database or fallback warehouse in read_only mode.

Near-Real-Time Features (Stage 3):
- Reopens connection and clears query cache automatically when DB file's mtime changes.
- Caches query results with at most 30 seconds TTL.
- Tracks data_as_of timestamp, next scheduled run, and source freshness SLAs.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import duckdb

logger = logging.getLogger("climateshield.backend.db")

# Determine workspace root and default database paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
SERVING_DB_PATH = PROJECT_ROOT / "serving" / "climateshield_serving.duckdb"
REAL_DB_PATH = PROJECT_ROOT / "pipeline" / "data" / "processed" / "climateshield.duckdb"
DEFAULT_DB_PATH = PROJECT_ROOT / "warehouse" / "sample.duckdb"

# Thread-safe query cache and file mtime state
_CACHE_LOCK = threading.Lock()
_CACHE: Dict[Tuple[str, Tuple[Any, ...]], Tuple[float, List[Dict[str, Any]]]] = {}
_LAST_MTIME: Optional[float] = None
_CACHED_CONN: Optional[duckdb.DuckDBPyConnection] = None


def get_db_path() -> Path:
    """
    Resolve database file path.
    Prioritizes:
    1. Explicit CLIMATESHIELD_DB environment variable
    2. Sample DB if CLIMATESHIELD_MODE == 'sample'
    3. Serving DB (serving/climateshield_serving.duckdb) from atomic swap
    4. Warehouse DB (pipeline/data/processed/climateshield.duckdb)
    5. Sample DB (warehouse/sample.duckdb)
    """
    env_path = os.getenv("CLIMATESHIELD_DB")
    if env_path:
        path = Path(env_path)
        if not path.is_absolute():
            path = (PROJECT_ROOT / path).resolve()
        return path

    if os.getenv("CLIMATESHIELD_MODE") == "sample":
        return DEFAULT_DB_PATH.resolve()

    if SERVING_DB_PATH.exists():
        return SERVING_DB_PATH.resolve()

    if REAL_DB_PATH.exists():
        return REAL_DB_PATH.resolve()

    return DEFAULT_DB_PATH.resolve()


def get_db_mtime() -> float:
    """Return the current modified time (st_mtime) of the active database file."""
    path = get_db_path()
    if path.exists():
        return path.stat().st_mtime
    return 0.0


def check_and_handle_db_change() -> bool:
    """
    Check if the database file modified time has changed.
    If changed, invalidate cached connections and query cache.
    Returns True if changed, False otherwise.
    """
    global _LAST_MTIME
    current_mtime = get_db_mtime()
    with _CACHE_LOCK:
        if _LAST_MTIME is not None and current_mtime != _LAST_MTIME:
            logger.info(
                "Database mtime changed from %s to %s. Invalidation triggered.",
                _LAST_MTIME,
                current_mtime,
            )
            _CACHE.clear()
            _LAST_MTIME = current_mtime
            return True
        elif _LAST_MTIME is None:
            _LAST_MTIME = current_mtime
    return False


def get_connection() -> duckdb.DuckDBPyConnection:
    """
    Open a read-only DuckDB connection.
    Strictly read_only=True to comply with Rule 11.
    Sets up views over attached secondary warehouse if needed.
    """
    check_and_handle_db_change()
    db_path = get_db_path()

    if not db_path.exists():
        raise FileNotFoundError(
            f"DuckDB database not found at {db_path}. "
            "Run 'python scripts/seed_sample_db.py' or check CLIMATESHIELD_DB."
        )

    conn = duckdb.connect(str(db_path), read_only=True)

    # Cross-attach for full feature compatibility across tables if needed
    try:
        tables = [t[0] for t in conn.execute("SHOW TABLES;").fetchall()]
        if DEFAULT_DB_PATH.exists() and str(DEFAULT_DB_PATH) != str(db_path):
            attached = [a[1] for a in conn.execute("PRAGMA database_list;").fetchall()]
            if "sample_db" not in attached:
                conn.execute(f"ATTACH '{DEFAULT_DB_PATH}' AS sample_db (READ_ONLY);")
            for t_name in [
                "zones",
                "facilities",
                "exposure_index",
                "impact_indicators",
                "run_status",
                "source_freshness",
                "model_eval",
                "predictions",
                "_is_sample",
            ]:
                if t_name not in tables:
                    try:
                        conn.execute(
                            f"CREATE TEMPORARY VIEW IF NOT EXISTS {t_name} AS SELECT * FROM sample_db.{t_name};"
                        )
                    except Exception:
                        pass
        if "quality_log" not in tables and "quality_logs" in tables:
            conn.execute(
                'CREATE TEMPORARY VIEW IF NOT EXISTS quality_log AS '
                'SELECT timestamp_utc as logged_at, dataset as source_name, '
                'rule_id as rule, action, "column", n_rows as rows_affected, '
                'reason as explanation, details FROM quality_logs;'
            )
    except Exception as attach_err:
        logger.debug("Cross-attach best effort notice: %s", attach_err)

    return conn


def safe_query(
    sql: str,
    params: Optional[List[Any]] = None,
    fallback: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """
    Safely execute a query against DuckDB.
    Returns list of dicts. If table is missing or DB file is absent,
    catches the error and returns fallback (default empty list []).
    """
    if fallback is None:
        fallback = []
    try:
        conn = get_connection()
        try:
            rel = conn.execute(sql, params or [])
            columns = [desc[0] for desc in rel.description] if rel.description else []
            rows = rel.fetchall()
            return [dict(zip(columns, row)) for row in rows]
        finally:
            conn.close()
    except (duckdb.CatalogException, FileNotFoundError, duckdb.Error) as err:
        logger.warning("safe_query warning (returning fallback): %s", err)
        return fallback


def query_cached(
    sql: str,
    params: Optional[List[Any]] = None,
    ttl_seconds: int = 30,
    fallback: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """
    Execute a read-only query with in-memory caching.
    TTL defaults to 30 seconds as required by Stage 3 (Requirement 12).
    """
    check_and_handle_db_change()
    key_params = tuple(params) if params else ()
    cache_key = (sql.strip(), key_params)
    now = time.monotonic()

    with _CACHE_LOCK:
        if cache_key in _CACHE:
            cached_at, cached_rows = _CACHE[cache_key]
            if now - cached_at < ttl_seconds:
                return cached_rows

    # Cache miss: execute query
    rows = safe_query(sql, params, fallback=fallback)

    with _CACHE_LOCK:
        _CACHE[cache_key] = (now, rows)

    return rows


def clear_query_cache() -> None:
    """Flush the in-memory query cache."""
    with _CACHE_LOCK:
        _CACHE.clear()


def is_sample_database() -> bool:
    """
    Check if the connected warehouse is sample data.
    Rule 2: Checks CLIMATESHIELD_MODE and _is_sample table.
    """
    if os.getenv("CLIMATESHIELD_MODE") == "sample":
        return True
    db_name = get_db_path().name.lower()
    if "sample" in db_name:
        return True
    if "climateshield" in db_name or "serving" in db_name:
        # Check explicit table flag if present
        rows = safe_query("SELECT is_sample FROM _is_sample LIMIT 1;")
        if rows and "is_sample" in rows[0]:
            return bool(rows[0]["is_sample"])
        return False
    rows = safe_query("SELECT is_sample FROM _is_sample LIMIT 1;")
    if rows and "is_sample" in rows[0]:
        return bool(rows[0]["is_sample"])
    return False


def get_last_run_summary() -> Optional[Dict[str, Any]]:
    """Fetch the latest run status from run_status table."""
    rows = safe_query(
        "SELECT run_id, started_at, finished_at, status, notes "
        "FROM run_status ORDER BY started_at DESC LIMIT 1;"
    )
    if rows:
        return rows[0]
    return None


def get_data_as_of() -> Optional[datetime]:
    """
    Find latest recorded data timestamp in the warehouse.
    Checks weather_hourly and predictions.
    """
    rows = safe_query("SELECT MAX(timestamp_utc) as max_ts FROM weather_hourly;")
    if rows and rows[0].get("max_ts") is not None:
        ts = rows[0]["max_ts"]
        if hasattr(ts, "tzinfo") and ts.tzinfo is not None:
            return ts.astimezone(timezone.utc)
        return ts.replace(tzinfo=timezone.utc)

    # Fallback to predictions table
    pred_rows = safe_query("SELECT MAX(forecast_time) as max_ts FROM predictions;")
    if pred_rows and pred_rows[0].get("max_ts") is not None:
        ts = pred_rows[0]["max_ts"]
        if hasattr(ts, "tzinfo") and ts.tzinfo is not None:
            return ts.astimezone(timezone.utc)
        return ts.replace(tzinfo=timezone.utc)

    return None


def get_next_run_time() -> datetime:
    """
    Compute next scheduled occurrence of cron '5 * * * *' (5 mins past every hour).
    """
    now = datetime.now(timezone.utc)
    target = now.replace(minute=5, second=0, microsecond=0)
    if target <= now:
        target += timedelta(hours=1)
    return target


def evaluate_freshness_status(age_mins: float, expected_every_minutes: int, recorded_status: Optional[str] = None) -> str:
    """
    Freshness classification rules:
    - Fresh: age <= 1.0x expected interval (and not recorded as failed/late)
    - Late:  age <= 3.0x expected interval or recorded as late/partial
    - Stale: age >  3.0x expected interval
    """
    if recorded_status in ("failed", "late", "partial") and age_mins > expected_every_minutes:
        return "Late" if age_mins <= (expected_every_minutes * 3.0) else "Stale"

    expected = max(1, expected_every_minutes)
    ratio = age_mins / expected
    if ratio <= 1.0:
        return "Fresh"
    elif ratio <= 3.0:
        return "Late"
    else:
        return "Stale"


def get_sources_freshness_meta() -> Tuple[List[Dict[str, Any]], bool]:
    """
    Fetch source_freshness rows, compute age_minutes and status:
    - Fresh: age <= 1.0x expected interval
    - Late:  age <= 3.0x expected interval
    - Stale: age >  3.0x expected interval
    Returns (sources_list, is_live).
    is_live is True ONLY when all critical sources are Fresh.
    """
    now_utc = datetime.now(timezone.utc)
    rows = safe_query(
        "SELECT source_name, publisher, licence, last_fetched_at, expected_every_minutes, status "
        "FROM source_freshness ORDER BY last_fetched_at DESC;"
    )

    sources: List[Dict[str, Any]] = []
    all_critical_fresh = True
    found_any = False

    for r in rows:
        found_any = True
        src_name = r["source_name"]
        last_dt = r.get("last_fetched_at")
        if last_dt is not None:
            if hasattr(last_dt, "tzinfo") and last_dt.tzinfo is not None:
                last_dt = last_dt.astimezone(timezone.utc)
            else:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            age_mins = max(0.0, (now_utc - last_dt).total_seconds() / 60.0)
        else:
            age_mins = 999999.0

        expected_min = max(1, int(r.get("expected_every_minutes") or 60))
        status = evaluate_freshness_status(age_mins, expected_min, r.get("status"))

        # Critical sources must be Fresh for is_live to be True
        if status != "Fresh":
            all_critical_fresh = False

        sources.append({
            "source_name": src_name,
            "publisher": r.get("publisher"),
            "licence": r.get("licence"),
            "age_minutes": round(age_mins, 1),
            "status": status,
            "expected_every_minutes": expected_min,
            "last_fetched_at": last_dt,
            "last_data_timestamp": r.get("last_data_timestamp") or last_dt,
        })

    is_live = found_any and all_critical_fresh
    return sources, is_live
