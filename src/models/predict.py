"""
PakRoad FloodWatch / ClimateShield 360 - Inference & Prediction Pipeline
Author: HackInsight 2026 Team (Climate & Infrastructure Analytics Track)

This module implements the production inference pipeline matching AGENT_RULES.md:
1. Loads the latest hourly weather records for all monitored cities from DuckDB.
2. Builds exact model features using feature_engineering imported from train_and_evaluate.py.
3. Loads the trained Multi-Quantile LightGBM models (Q10, Q50, Q90) without retraining.
4. Derives the continuous exceedance probability P(Rain >= 2.5 mm/hr) via CDF inversion.
5. Computes the 24-hour persistence baseline (rain_lag_24h).
6. Idempotently writes predictions to DuckDB (predictions table) without duplicates.
7. Populates the model_eval table with disaggregated fairness audit metrics from reports.
"""

from __future__ import annotations

import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import duckdb
import joblib
import numpy as np
import pandas as pd

# Setup logging for auditability and monitoring
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("climateshield.predict")

# Resolve repository paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(PROJECT_ROOT / "pipeline") not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT / "pipeline"))

# Import feature-building function from train_and_evaluate without rewriting it
try:
    from src.models.train_and_evaluate import feature_engineering, CITY_PROVINCE_MAP
except ImportError:
    from climateshield.models.train_and_evaluate import feature_engineering, CITY_PROVINCE_MAP

# Declared model metadata
MODEL_VERSION = "lightgbm_quantile_v1.0"
HEAVY_RAIN_THRESHOLD_MM = 2.5  # Official PMD/HackInsight heavy rain threshold (2.5 mm/hr)

# Exact 20 features required by quantile_regressors.joblib in order
EXPECTED_FEATURES = [
    "rain_lag_1h",
    "rain_lag_2h",
    "rain_lag_24h",
    "rain_rolling_3h_sum",
    "rain_rolling_6h_sum",
    "pressure_trend_3h",
    "soil_moisture_0_7cm",
    "relative_humidity_2m",
    "temperature_2m",
    "wind_speed_10m",
    "weather_code",
    "hour_sin",
    "hour_cos",
    "month_sin",
    "month_cos",
    "is_monsoon",
    "vapor_saturation_gap",
    "soil_rain_saturation_index",
    "convective_heat_trigger",
    "city_code",
]


def find_model_path() -> Path:
    """Locate the saved multi-quantile regressor binary without retraining."""
    candidates = [
        PROJECT_ROOT / "pipeline" / "models" / "quantile_regressors.joblib",
        PROJECT_ROOT / "models" / "quantile_regressors.joblib",
    ]
    for p in candidates:
        if p.is_file():
            return p
    raise FileNotFoundError(
        f"Could not find quantile_regressors.joblib. Checked: {[str(c) for c in candidates]}"
    )


def find_fairness_report_path() -> Path:
    """Locate the disaggregated fairness CSV report generated during model training."""
    candidates = [
        PROJECT_ROOT / "pipeline" / "reports" / "fairness_by_group.csv",
        PROJECT_ROOT / "reports" / "fairness_by_group.csv",
    ]
    for p in candidates:
        if p.is_file():
            return p
    raise FileNotFoundError(
        f"Could not find fairness_by_group.csv. Checked: {[str(c) for c in candidates]}"
    )


def derive_exceedance_probability(
    q10: float, q50: float, q90: float, threshold: float = HEAVY_RAIN_THRESHOLD_MM
) -> float:
    """
    Derive exceedance probability P(Rain >= threshold) from predicted quantiles [Q10, Q50, Q90].

    === Viva Explanation of Method ===
    1. The quantile regressors provide point predictions for three cumulative probability percentiles:
       - Q10: 10th percentile, where F(Q10) = P(Rain <= Q10) = 0.10
       - Q50: 50th percentile (median), where F(Q50) = P(Rain <= Q50) = 0.50
       - Q90: 90th percentile, where F(Q90) = P(Rain <= Q90) = 0.90
       - Physical lower bound: Rainfall cannot be negative, so F(0) = 0.0.

    2. To obtain P(Rain >= threshold), we invert the piecewise linear Cumulative Distribution
       Function (CDF) defined by the anchors [(0.0, 0.0), (Q10, 0.10), (Q50, 0.50), (Q90, 0.90)]:
       - If threshold <= Q10:
         Interpolate between (0.0, 0.0) and (Q10, 0.10).
       - If Q10 < threshold <= Q50:
         Interpolate between (Q10, 0.10) and (Q50, 0.50).
       - If Q50 < threshold <= Q90:
         Interpolate between (Q50, 0.50) and (Q90, 0.90).
       - If threshold > Q90:
         Extrapolate into the extreme upper tail (>90th percentile) using a physical exponential
         decay: P(Rain >= threshold) = 0.10 * exp(-(threshold - Q90) / scale), where scale reflects
         local dispersion (Q90 - Q50).

    3. Return P(Rain >= threshold) = 1.0 - F(threshold), clamped to the valid range [0.0, 1.0].
    """
    # Enforce non-negativity and non-crossing
    y0 = 0.0
    y1 = max(0.0, float(q10))
    y2 = max(y1, float(q50))
    y3 = max(y2, float(q90))

    if threshold <= y0:
        return 1.0

    if y1 > y0 and threshold <= y1:
        # Interpolate between (0.0, 0.0) and (y1, 0.10)
        cdf = 0.0 + (0.10 - 0.0) * (threshold - y0) / (y1 - y0)
    elif threshold <= y1:
        # y1 is 0.0, so at threshold == 0, CDF is at least 0.10
        cdf = 0.10
    elif threshold <= y2:
        # Interpolate between (y1, 0.10) and (y2, 0.50)
        spread = y2 - y1
        cdf = 0.10 + (0.40 * (threshold - y1) / spread) if spread > 1e-6 else 0.50
    elif threshold <= y3:
        # Interpolate between (y2, 0.50) and (y3, 0.90)
        spread = y3 - y2
        cdf = 0.50 + (0.40 * (threshold - y2) / spread) if spread > 1e-6 else 0.90
    else:
        # Beyond Q90: Exponential tail model for extreme convective events
        scale = max(y3 - y2, 1.0)
        tail_prob = 0.10 * np.exp(-(threshold - y3) / scale)
        return float(np.clip(tail_prob, 0.0, 0.10))

    exceed_prob = 1.0 - cdf
    return float(np.clip(exceed_prob, 0.0, 1.0))


def run_predictions(db_path: str = "pipeline/data/processed/climateshield.duckdb") -> Dict[str, Any]:
    """
    Execute end-to-end production inference on DuckDB warehouse.

    Step-by-step workflow for viva:
    1. Connect to DuckDB warehouse at `db_path`.
    2. Query the latest 48-hour weather window for each monitored city.
    3. Compute rolling rainfall sums, barometric pressure trend, and 24h lag baseline.
    4. Call feature_engineering() to build cyclic, meteorological, and interaction terms.
    5. Filter to the most recent hour for each city to produce next-hour forecasts.
    6. Run Multi-Quantile LightGBM models (Q10, Q50, Q90) to predict rainfall uncertainty.
    7. Enforce interval monotonicity (interval_low <= median <= interval_high).
    8. Derive heavy-rain exceedance probability P(Rain >= 2.5 mm/hr) via CDF inversion.
    9. Write predictions idempotently to the `predictions` table (replace existing city+forecast_time).
    10. Write per-city disaggregated fairness metrics to the `model_eval` table.
    11. Return and log execution summary dictionary.
    """
    logger.info("Starting prediction pipeline against warehouse: %s", db_path)
    db_file = Path(db_path)
    if not db_file.is_file():
        raise FileNotFoundError(f"DuckDB warehouse does not exist: {db_path}")

    # 1. Connect to DuckDB warehouse
    con = duckdb.connect(str(db_file), read_only=False)

    try:
        # 2. Query recent time-series window (last 48 hours per city) to allow exact lag/rolling calculation
        logger.info("Querying recent hourly weather observations across all cities...")
        query = """
            SELECT * EXCLUDE (rn) FROM (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY city ORDER BY timestamp_utc DESC) as rn
                FROM weather_hourly
            ) WHERE rn <= 48
            ORDER BY city, timestamp_utc ASC;
        """
        raw_df = con.execute(query).df()
        if raw_df.empty:
            raise ValueError("weather_hourly table returned no rows; cannot generate predictions.")

        logger.info("Loaded %d recent hourly observations across %d cities.", len(raw_df), raw_df["city"].nunique())

        # 3. Standardize column names to match training dataset schema
        df = raw_df.copy()
        time_col = "timestamp_pkt" if "timestamp_pkt" in df.columns else "timestamp_utc"
        df[time_col] = pd.to_datetime(df[time_col])
        df["year"] = df[time_col].dt.year
        df["month"] = df[time_col].dt.month
        df["day"] = df[time_col].dt.day
        df["hour"] = df[time_col].dt.hour

        if "province" not in df.columns:
            df["province"] = df["city"].map(CITY_PROVINCE_MAP).fillna("Other")

        rename_map = {
            "precipitation_mm": "precipitation",
            "rain_mm": "rain",
            "temperature_2m_c": "temperature_2m",
            "relative_humidity_pct": "relative_humidity_2m",
            "dew_point_c": "dew_point",
            "soil_moisture_0_to_7cm_m3m3": "soil_moisture_0_7cm",
            "wind_speed_10m_kmh": "wind_speed_10m",
            "weather_code_wmo": "weather_code",
        }
        for src, dest in rename_map.items():
            if src in df.columns and dest not in df.columns:
                df[dest] = df[src]

        # Fill missing values for baseline and rolling sums
        df["rain"] = df["rain"].fillna(0.0)
        df["precipitation"] = df["precipitation"].fillna(df["rain"])

        # Compute per-city lag and rolling features identically to training script
        df = df.sort_values(["city", time_col]).reset_index(drop=True)
        city_grp = df.groupby("city")

        df["rain_lag_1h"] = city_grp["rain"].shift(1).fillna(0.0)
        df["rain_lag_2h"] = city_grp["rain"].shift(2).fillna(0.0)
        df["rain_lag_24h"] = city_grp["rain"].shift(24).fillna(0.0)  # 24h persistence baseline
        df["rain_rolling_3h_sum"] = (
            city_grp["rain"].rolling(3, min_periods=1).sum().reset_index(0, drop=True).fillna(0.0)
        )
        df["rain_rolling_6h_sum"] = (
            city_grp["rain"].rolling(6, min_periods=1).sum().reset_index(0, drop=True).fillna(0.0)
        )

        if "surface_pressure_hpa" in df.columns:
            df["pressure_trend_3h"] = city_grp["surface_pressure_hpa"].diff(3).fillna(0.0)
        else:
            df["pressure_trend_3h"] = 0.0

        # 4. Import & construct model features using training script's feature_engineering
        df = feature_engineering(df)

        # Build consistent ordinal city_code mapping
        cities = sorted(df["city"].unique())
        city_to_code = {c: i for i, c in enumerate(cities)}
        df["city_code"] = df["city"].map(city_to_code).fillna(-1)

        # 5. Extract the single latest observation row for each city
        latest_df = df.groupby("city", as_index=False).last().reset_index(drop=True)
        X_latest = latest_df[EXPECTED_FEATURES]

        # 6. Load saved multi-quantile LightGBM regressors without retraining
        model_path = find_model_path()
        logger.info("Loading saved quantile regressors from: %s", model_path)
        quantile_models = joblib.load(model_path)
        if not all(q in quantile_models for q in [0.10, 0.50, 0.90]):
            raise KeyError("quantile_regressors.joblib must contain models for keys 0.1, 0.5, 0.9")

        # 7. Predict quantiles Q10, Q50 (median), and Q90
        raw_q10 = quantile_models[0.10].predict(X_latest)
        raw_q50 = quantile_models[0.50].predict(X_latest)
        raw_q90 = quantile_models[0.90].predict(X_latest)

        # Enforce non-negativity and monotonicity (interval_low <= median <= interval_high)
        # to prevent quantile crossing artifacts:
        pred_q10 = np.clip(raw_q10, 0.0, None)
        pred_q50 = np.maximum(pred_q10, np.clip(raw_q50, 0.0, None))
        pred_q90 = np.maximum(pred_q50, np.clip(raw_q90, 0.0, None))

        now_utc = datetime.now(timezone.utc)

        # 8. Prepare prediction records
        prediction_rows: List[Dict[str, Any]] = []
        for i, row in latest_df.iterrows():
            obs_time_utc = pd.to_datetime(row["timestamp_utc"], utc=True)
            # Forecast time is the next continuous hour (t + 1 hour)
            forecast_time_utc = obs_time_utc + pd.Timedelta(hours=1)

            low = round(float(pred_q10[i]), 4)
            med = round(float(pred_q50[i]), 4)
            high = round(float(pred_q90[i]), 4)

            # 24h persistence baseline (rain observed 24 hours prior to forecast time)
            baseline_val = round(float(row["rain_lag_24h"]), 4)

            # Derive continuous probability P(Rain >= 2.5 mm/hr) via CDF inversion
            prob = round(derive_exceedance_probability(low, med, high, HEAVY_RAIN_THRESHOLD_MM), 4)

            prediction_rows.append(
                {
                    "city": str(row["city"]),
                    "forecast_time": forecast_time_utc.to_pydatetime(),
                    "hazard_type": "heavy_rain",
                    "probability": prob,
                    "interval_low": low,
                    "interval_high": high,
                    "baseline_value": baseline_val,
                    "model_version": MODEL_VERSION,
                    "generated_at": now_utc,
                    "median": med,
                    "zone_id": str(row["city"]),  # Preserves AGENT_RULES.md contract
                }
            )

        # 9. Create/update table `predictions` idempotently
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS predictions (
                city VARCHAR NOT NULL,
                forecast_time TIMESTAMP WITH TIME ZONE NOT NULL,
                hazard_type VARCHAR NOT NULL,
                probability DOUBLE NOT NULL,
                interval_low DOUBLE NOT NULL,
                interval_high DOUBLE NOT NULL,
                baseline_value DOUBLE NOT NULL,
                model_version VARCHAR NOT NULL,
                generated_at TIMESTAMP WITH TIME ZONE NOT NULL,
                median DOUBLE NOT NULL,
                zone_id VARCHAR NOT NULL
            );
            """
        )

        # Delete existing entries with matching (city, forecast_time) before inserting to guarantee idempotency
        for r in prediction_rows:
            con.execute(
                """
                DELETE FROM predictions
                WHERE city = ? AND forecast_time = ? AND hazard_type = ?;
                """,
                [r["city"], r["forecast_time"], r["hazard_type"]],
            )
            con.execute(
                """
                INSERT INTO predictions (
                    city, forecast_time, hazard_type, probability, interval_low,
                    interval_high, baseline_value, model_version, generated_at, median, zone_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                [
                    r["city"],
                    r["forecast_time"],
                    r["hazard_type"],
                    r["probability"],
                    r["interval_low"],
                    r["interval_high"],
                    r["baseline_value"],
                    r["model_version"],
                    r["generated_at"],
                    r["median"],
                    r["zone_id"],
                ],
            )

        logger.info("Successfully wrote %d idempotent prediction rows to DuckDB.", len(prediction_rows))

        # 10. Write per-city error results from fairness_by_group.csv into `model_eval`
        fairness_path = find_fairness_report_path()
        logger.info("Loading group fairness metrics from: %s", fairness_path)
        fairness_df = pd.read_csv(fairness_path)

        con.execute(
            """
            CREATE TABLE IF NOT EXISTS model_eval (
                group_type VARCHAR NOT NULL,
                group_value VARCHAR NOT NULL,
                metric VARCHAR NOT NULL,
                baseline_score DOUBLE NOT NULL,
                model_score DOUBLE NOT NULL
            );
            """
        )

        # Clear existing city MAE rows to maintain idempotence
        con.execute("DELETE FROM model_eval WHERE group_type = 'city' AND metric = 'MAE';")

        eval_records_count = 0
        for _, frow in fairness_df.iterrows():
            city_name = str(frow["city"])
            b_mae = round(float(frow["baseline_mae"]), 4)
            m_mae = round(float(frow["model_mae"]), 4)
            con.execute(
                """
                INSERT INTO model_eval (group_type, group_value, metric, baseline_score, model_score)
                VALUES ('city', ?, 'MAE', ?, ?);
                """,
                [city_name, b_mae, m_mae],
            )
            eval_records_count += 1

        logger.info("Successfully wrote %d per-city evaluation rows to model_eval table.", eval_records_count)

        # 11. Compile summary dict
        time_stamps = [r["forecast_time"] for r in prediction_rows]
        min_time = min(time_stamps)
        max_time = max(time_stamps)
        unique_cities = sorted(list({r["city"] for r in prediction_rows}))

        summary: Dict[str, Any] = {
            "rows_written": len(prediction_rows),
            "cities": unique_cities,
            "time_range": {
                "start": min_time.isoformat(),
                "end": max_time.isoformat(),
            },
            "model_version": MODEL_VERSION,
            "eval_rows_written": eval_records_count,
        }

        logger.info("Summary of predictions run: %s", summary)
        return summary

    finally:
        con.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run next-hour rainfall inference using quantile regressors.")
    parser.add_argument(
        "--db-path",
        default="pipeline/data/processed/climateshield.duckdb",
        help="Path to DuckDB warehouse database.",
    )
    args = parser.parse_args()

    result = run_predictions(args.db_path)
    print("\n--- Model Prediction Run Result ---")
    print(result)
