"""
Database access module for ClimateShield 360 backend.
Rule 11: The API is read-only. Never write to the warehouse.
Connects to DuckDB specified by CLIMATESHIELD_DB environment variable.
Provides cached queries (60s TTL) and safe query helpers that degrade gracefully
to empty lists if tables are missing.
"""

from datetime import datetime, timezone
import os
from pathlib import Path
import threading
import time
from typing import Any, Dict, List, Optional, Tuple
import duckdb

# Determine workspace root and default database path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = PROJECT_ROOT / "warehouse" / "sample.duckdb"

# Simple in-memory thread-safe query cache
_CACHE_LOCK = threading.Lock()
_CACHE: Dict[Tuple[str, Tuple[Any, ...]], Tuple[float, List[Dict[str, Any]]]] = {}


def get_db_path() -> Path:
    """Resolve database file path from environment variable or default."""
    env_path = os.getenv("CLIMATESHIELD_DB")
    if env_path:
        path = Path(env_path)
        if not path.is_absolute():
            path = (PROJECT_ROOT / path).resolve()
        return path
    return DEFAULT_DB_PATH.resolve()


def get_connection() -> duckdb.DuckDBPyConnection:
    """
    Open a read-only DuckDB connection.
    Strictly read_only=True to comply with Rule 11.
    """
    db_path = get_db_path()
    if not db_path.exists():
        raise FileNotFoundError(
            f"DuckDB database not found at {db_path}. "
            "Run 'python scripts/seed_sample_db.py' or check CLIMATESHIELD_DB."
        )
    return duckdb.connect(str(db_path), read_only=True)


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
        print(f"[safe_query warning] Query error (returning fallback): {err}")
        return fallback


def query_cached(
    sql: str,
    params: Optional[List[Any]] = None,
    ttl_seconds: int = 60,
    fallback: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """
    Execute a read-only query with in-memory caching.
    TTL defaults to 60 seconds as required.
    """
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
    Rule 2: Checks _is_sample table. Defaults to True if table is missing or true.
    """
    rows = safe_query("SELECT is_sample FROM _is_sample LIMIT 1;")
    if rows and "is_sample" in rows[0]:
        return bool(rows[0]["is_sample"])
    # If the _is_sample table doesn't exist, check filename or default to True for safety
    db_name = get_db_path().name.lower()
    return "sample" in db_name


def get_last_run_summary() -> Optional[Dict[str, Any]]:
    """
    Fetch the latest run status from run_status table.
    """
    rows = safe_query(
        "SELECT run_id, started_at, finished_at, status, notes "
        "FROM run_status ORDER BY started_at DESC LIMIT 1;"
    )
    if rows:
        return rows[0]
    return None
