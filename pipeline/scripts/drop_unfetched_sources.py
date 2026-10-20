"""Remove freshness rows for feeds this pipeline never downloads."""

import duckdb
from pathlib import Path

DB = Path(__file__).resolve().parents[1] / "data" / "processed" / "climateshield.duckdb"
KEEP = "Open-Meteo Hourly Weather API"

connection = duckdb.connect(str(DB))
connection.execute(
    "DELETE FROM source_freshness WHERE source_name <> ?",
    [KEEP],
)
print(connection.execute("SELECT source_name, last_fetched_at, status FROM source_freshness").fetchall())
connection.close()
