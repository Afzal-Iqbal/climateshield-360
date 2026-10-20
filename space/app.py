"""
Hugging Face Space entry point for ClimateShield 360.

Shows the three items the hackathon dashboard must show:
data freshness, the latest Data Quality Agent result, and the last successful run.
Numbers come from the DuckDB warehouse. Empty tables stay empty.
"""

from __future__ import annotations

import os
from pathlib import Path

import duckdb
import gradio as gr

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "pipeline" / "data" / "processed" / "climateshield.duckdb"


def warehouse_path() -> Path:
    configured = os.environ.get("CLIMATESHIELD_DB")
    if configured:
        return Path(configured)
    return DEFAULT_DB


def _query(sql: str) -> list[list]:
    path = warehouse_path()
    if not path.is_file():
        return [["warehouse missing", str(path)]]
    connection = duckdb.connect(str(path), read_only=True)
    try:
        rows = connection.execute(sql).fetchall()
        return [list(row) for row in rows] or [["no rows"]]
    except Exception as exc:  # noqa: BLE001
        return [["query failed", str(exc)]]
    finally:
        connection.close()


def freshness_table() -> list[list]:
    return _query(
        """
        SELECT source_name, publisher, status, last_fetched_at
        FROM source_freshness
        ORDER BY source_name
        """
    )


def quality_table() -> list[list]:
    return _query(
        """
        SELECT action, COUNT(*) AS decisions, SUM(n_rows) AS rows_touched
        FROM quality_logs
        GROUP BY action
        ORDER BY action
        """
    )


def last_run_table() -> list[list]:
    return _query(
        """
        SELECT run_id, started_at, finished_at, status, notes
        FROM run_status
        ORDER BY started_at DESC
        LIMIT 8
        """
    )


def load_status():
    return freshness_table(), quality_table(), last_run_table()


with gr.Blocks(title="ClimateShield 360 status") as demo:
    gr.Markdown(
        """
        # ClimateShield 360
        Information only, not professional advice. In an emergency contact Rescue 1122 or NDMA.
        This panel reads the warehouse. It does not invent a successful run.
        """
    )
    refresh = gr.Button("Read warehouse")
    with gr.Row():
        freshness = gr.Dataframe(label="Data freshness", interactive=False)
        quality = gr.Dataframe(label="Data Quality Agent", interactive=False)
        runs = gr.Dataframe(label="Pipeline runs", interactive=False)
    demo.load(load_status, outputs=[freshness, quality, runs])
    refresh.click(load_status, outputs=[freshness, quality, runs])


if __name__ == "__main__":
    demo.launch()
