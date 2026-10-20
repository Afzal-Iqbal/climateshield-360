"""Record the latest hourly ingest status into the warehouse."""

import json
from datetime import datetime, timezone
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
STATUS = ROOT / "reports" / "hourly_ingest_status.json"
DB = ROOT / "data" / "processed" / "climateshield.duckdb"

payload = json.loads(STATUS.read_text(encoding="utf-8"))
started = datetime.fromisoformat(payload["generated_at_utc"])
finished = datetime.now(timezone.utc)
connection = duckdb.connect(str(DB))
connection.execute("DELETE FROM source_freshness")
connection.execute("DELETE FROM run_status WHERE run_id = ?", [payload["run_id"]])
connection.execute(
    "INSERT INTO run_status VALUES (?, ?, ?, ?, ?)",
    [payload["run_id"], started, finished, "success", "hourly ingest of fetched sources only"],
)
for item in payload["connectors"]:
    if item["status"] not in {"success", "partial", "unchanged"}:
        continue
    expected = 60 if item["publication_frequency"] == "hourly" else 1440
    connection.execute(
        "INSERT INTO source_freshness VALUES (?, ?, ?, ?, ?, ?)",
        [item["source_id"], item["publisher"], item["licence"], item["fetch_time_utc"], expected, "fresh"],
    )
print(connection.execute("SELECT source_name, last_fetched_at, status FROM source_freshness").fetchall())
connection.close()
