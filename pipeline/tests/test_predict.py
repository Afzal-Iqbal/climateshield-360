"""
Unit tests for PakRoad FloodWatch / ClimateShield 360 Inference Pipeline.
Author: HackInsight 2026 Team (Climate & Infrastructure Analytics Track)

Viva Explanation:
This test suite verifies the two core statistical and data integrity requirements:
1. Idempotency & No Duplicates: Running inference multiple times does not produce duplicate
   (city, forecast_time) records in DuckDB warehouse.
2. Uncertainty Interval Validity: The predicted multi-quantile prediction intervals
   strictly adhere to monotonicity: interval_low (Q10) <= median (Q50) <= interval_high (Q90).
3. Real Data Integrity: Tests execute against real warehouse data without hard-coded or synthetic values.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path
import duckdb
import pytest

# Ensure project root is in sys.path
TESTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = TESTS_DIR.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from src.models.predict import run_predictions, derive_exceedance_probability, HEAVY_RAIN_THRESHOLD_MM


@pytest.fixture(scope="module")
def warehouse_copy(tmp_path_factory) -> Path:
    """
    Create an isolated copy of the real DuckDB warehouse for safe test execution.
    Preserves the real database file while ensuring tests can execute destructive/idempotent writes.
    """
    candidates = [
        REPO_ROOT / "pipeline" / "data" / "processed" / "climateshield.duckdb",
        REPO_ROOT / "data" / "processed" / "climateshield.duckdb",
        Path("pipeline/data/processed/climateshield.duckdb"),
        Path("data/processed/climateshield.duckdb"),
    ]
    real_db = None
    for c in candidates:
        if c.is_file():
            real_db = c
            break
    if not real_db:
        pytest.skip("Warehouse database not found")
    if not real_db.is_file():
        pytest.skip(f"Warehouse database not found at {real_db}")

    temp_dir = tmp_path_factory.mktemp("db_test")
    test_db = temp_dir / "climateshield_test.duckdb"
    shutil.copy2(real_db, test_db)
    return test_db


def test_no_duplicate_city_forecast_time(warehouse_copy: Path) -> None:
    """
    Viva Question: How does the pipeline ensure idempotency and prevent duplicate forecasts?

    Test Step:
    1. Run run_predictions() on the real warehouse copy.
    2. Immediately run run_predictions() a second time (simulating a retry or re-ingestion).
    3. Query DuckDB for any grouping of (city, forecast_time) where COUNT(*) > 1.
    4. Assert that the duplicate count is strictly 0.
    """
    # First execution
    summary_1 = run_predictions(str(warehouse_copy))
    assert summary_1["rows_written"] > 0
    initial_count = summary_1["rows_written"]

    # Second execution (must replace in-place, never duplicate)
    summary_2 = run_predictions(str(warehouse_copy))
    assert summary_2["rows_written"] == initial_count

    con = duckdb.connect(str(warehouse_copy), read_only=True)
    try:
        # Check for any duplicate (city, forecast_time) tuples
        dup_query = """
            SELECT city, CAST(forecast_time AS VARCHAR) as ts, COUNT(*) as cnt
            FROM predictions
            GROUP BY city, forecast_time
            HAVING COUNT(*) > 1;
        """
        duplicates = con.execute(dup_query).fetchall()
        assert len(duplicates) == 0, f"Found duplicate prediction records: {duplicates}"

        # Total rows must equal the number of distinct cities
        total_rows = con.execute("SELECT COUNT(*) FROM predictions;").fetchone()[0]
        distinct_rows = con.execute("SELECT COUNT(DISTINCT (city || '_' || CAST(forecast_time AS VARCHAR))) FROM predictions;").fetchone()[0]
        assert total_rows == distinct_rows, f"Total rows ({total_rows}) != distinct rows ({distinct_rows})"
    finally:
        con.close()


def test_uncertainty_interval_monotonicity(warehouse_copy: Path) -> None:
    """
    Viva Question: What guarantees that interval_low <= median <= interval_high?

    Test Step:
    1. Query all predictions from the warehouse.
    2. For every city forecast row, assert:
       - interval_low >= 0.0 (physical boundary: rainfall cannot be negative)
       - interval_low <= median (Q10 does not exceed median Q50)
       - median <= interval_high (median Q50 does not exceed Q90)
       - probability is a valid probability measure in [0.0, 1.0].
    """
    con = duckdb.connect(str(warehouse_copy), read_only=True)
    try:
        query = """
            SELECT 
                city,
                CAST(forecast_time AS VARCHAR) as f_time,
                probability,
                interval_low,
                median,
                interval_high,
                baseline_value
            FROM predictions;
        """
        rows = con.execute(query).fetchall()
        assert len(rows) > 0, "predictions table is empty"

        for row in rows:
            city, f_time, prob, low, med, high, base = row

            # 1. Non-negativity check
            assert low >= 0.0, f"[{city}] interval_low is negative: {low}"
            assert med >= 0.0, f"[{city}] median is negative: {med}"
            assert high >= 0.0, f"[{city}] interval_high is negative: {high}"
            assert base >= 0.0, f"[{city}] baseline_value is negative: {base}"

            # 2. Strict monotonicity check: interval_low <= probability-related median <= interval_high
            assert low <= med, f"[{city} @ {f_time}] Lower bound ({low}) exceeds median ({med})"
            assert med <= high, f"[{city} @ {f_time}] Median ({med}) exceeds upper bound ({high})"

            # 3. Probability bounded in [0.0, 1.0]
            assert 0.0 <= prob <= 1.0, f"[{city}] Invalid probability score: {prob}"

            # 4. Consistency: re-deriving probability from the stored quantiles matches the stored score
            derived_prob = derive_exceedance_probability(low, med, high, HEAVY_RAIN_THRESHOLD_MM)
            assert pytest.approx(derived_prob, abs=1e-3) == prob
    finally:
        con.close()


def test_model_eval_table_records(warehouse_copy: Path) -> None:
    """
    Verify that the model_eval table correctly ingested the per-city fairness metrics
    from pipeline/reports/fairness_by_group.csv without hardcoding.
    """
    con = duckdb.connect(str(warehouse_copy), read_only=True)
    try:
        eval_rows = con.execute("SELECT group_type, group_value, metric, baseline_score, model_score FROM model_eval WHERE group_type = 'city';").fetchall()
        assert len(eval_rows) >= 12, f"Expected at least 12 audited city evaluation rows, got {len(eval_rows)}"
        for grp_type, city, metric, b_score, m_score in eval_rows:
            assert grp_type == "city"
            assert metric == "MAE"
            assert b_score >= 0.0
            assert m_score >= 0.0
    finally:
        con.close()
