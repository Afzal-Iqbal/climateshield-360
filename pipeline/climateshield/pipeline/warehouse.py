"""DuckDB gold warehouse. Parquet/CSV stay as files; this is the query layer."""

from __future__ import annotations

from pathlib import Path

import duckdb
import pandas as pd

from climateshield.config import PROCESSED_DIR, WAREHOUSE_PATH
from climateshield.io_utils import assert_not_raw, write_csv

# File in data/processed/ -> warehouse table name.
GOLD_SOURCES: list[tuple[str, str]] = [
    ("weather_hourly", "weather_hourly.parquet"),
    ("weather_6h_sample", "weather_6h_sample.parquet"),
    ("glofas_river_discharge", "glofas_river_discharge.parquet"),
    ("weather_city_stats", "weather_city_stats.parquet"),
    ("city_locations", "city_locations.parquet"),
    ("district_snapshot", "district_snapshot.parquet"),
    ("pbs_district_demographics", "pbs_district_demographics.parquet"),
    ("pbs_district_rural_urban", "pbs_district_rural_urban.parquet"),
    ("osm_emergency_facilities", "osm_emergency_facilities.parquet"),
    ("osm_hospital_access", "osm_hospital_access.parquet"),
    ("osm_flood_exposure", "osm_flood_exposure.parquet"),
    ("osm_rural_access", "osm_rural_access.parquet"),
    ("pmd_river_danger_levels", "pmd_river_danger_levels.parquet"),
    ("health_facilities", "health_facilities.parquet"),
    ("populated_places", "populated_places.parquet"),
    ("document_catalog", "document_catalog.csv"),
    ("district_name_lookup", "district_name_lookup.csv"),
    ("excluded_columns", "excluded_columns.csv"),
]


def _quoted_path(path: Path) -> str:
    return path.resolve().as_posix().replace("'", "''")


def _load_file(con: duckdb.DuckDBPyConnection, table: str, path: Path) -> int:
    source = _quoted_path(path)
    if path.suffix.lower() == ".parquet":
        sql = f'CREATE OR REPLACE TABLE "{table}" AS SELECT * FROM read_parquet(\'{source}\')'
    elif path.suffix.lower() == ".csv":
        sql = (
            f'CREATE OR REPLACE TABLE "{table}" AS '
            f"SELECT * FROM read_csv_auto('{source}', header=true)"
        )
    else:
        raise ValueError(f"Unsupported warehouse source: {path}")
    con.execute(sql)
    return int(con.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0])


def build_warehouse(extra_csv: dict[str, Path] | None = None) -> dict[str, int]:
    """Replace data/processed/climateshield.duckdb from gold files. Never writes to raw."""
    assert_not_raw(WAREHOUSE_PATH)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    if WAREHOUSE_PATH.exists():
        WAREHOUSE_PATH.unlink()

    counts: dict[str, int] = {}
    con = duckdb.connect(str(WAREHOUSE_PATH))
    try:
        for table, filename in GOLD_SOURCES:
            path = PROCESSED_DIR / filename
            if not path.exists():
                if table == "glofas_river_discharge":
                    continue
                raise FileNotFoundError(f"Gold file missing for warehouse table {table}: {path}")
            counts[table] = _load_file(con, table, path)
        for table, path in (extra_csv or {}).items():
            if path.exists():
                counts[table] = _load_file(con, table, path)

        catalog_rows = [(name, n_rows) for name, n_rows in counts.items()]
        con.execute("CREATE OR REPLACE TABLE warehouse_catalog (table_name VARCHAR, n_rows BIGINT)")
        con.executemany("INSERT INTO warehouse_catalog VALUES (?, ?)", catalog_rows)
        counts["warehouse_catalog"] = len(catalog_rows)
    finally:
        con.close()

    write_csv(
        PROCESSED_DIR / "warehouse_catalog.csv",
        pd.DataFrame([{"table_name": k, "n_rows": v} for k, v in counts.items()]),
    )
    return counts
