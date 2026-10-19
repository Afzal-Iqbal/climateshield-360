from __future__ import annotations

import pytest

from climateshield.config import PROCESSED_DIR, WAREHOUSE_PATH


def test_warehouse_matches_gold_files() -> None:
    parquet = PROCESSED_DIR / "weather_hourly.parquet"
    if not parquet.exists() or not WAREHOUSE_PATH.exists():
        pytest.skip("warehouse has not been built yet")

    import duckdb
    import pandas as pd

    file_rows = len(pd.read_parquet(parquet, columns=["row_id"]))
    con = duckdb.connect(str(WAREHOUSE_PATH), read_only=True)
    try:
        db_rows = con.execute("SELECT COUNT(*) FROM weather_hourly").fetchone()[0]
        tables = {row[0] for row in con.execute("SHOW TABLES").fetchall()}
    finally:
        con.close()
    assert db_rows == file_rows
    assert {"weather_hourly", "district_snapshot", "warehouse_catalog"} <= tables
