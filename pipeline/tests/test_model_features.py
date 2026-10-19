from __future__ import annotations

import pandas as pd

from climateshield.models.train_and_evaluate import _prepare_weather_frame, feature_engineering


def test_rolling_rain_excludes_current_hour() -> None:
    stamps = pd.date_range("2024-01-01", periods=6, freq="h", tz="UTC")
    frame = pd.DataFrame(
        {
            "city": ["Lahore"] * 6,
            "timestamp_utc": stamps,
            "rain_mm": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
            "precipitation_mm": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
            "temperature_2m_c": [20.0] * 6,
            "relative_humidity_pct": [40.0] * 6,
            "soil_moisture_0_to_7cm_m3m3": [0.2] * 6,
            "wind_speed_10m_kmh": [5.0] * 6,
            "weather_code_wmo": [0] * 6,
            "surface_pressure_hpa": [1000.0] * 6,
        }
    )
    prepared = _prepare_weather_frame(frame)
    # At t corresponding to rain=4 (index 3), prior 3h sum should be 1+2+3=6, not 2+3+4.
    row = prepared.iloc[3]
    assert row["rain"] == 4.0
    assert row["rain_lag_1h"] == 3.0
    assert row["rain_rolling_3h_sum"] == 6.0
    assert pd.isna(row["rain_lag_24h"])
    assert row["weather_code"] == 0
    engineered = feature_engineering(prepared)
    assert "hour_sin" in engineered.columns
    assert engineered.iloc[3]["rain_rolling_3h_sum"] != engineered.iloc[3]["precipitation"]


def test_meteorological_covariates_are_lagged() -> None:
    stamps = pd.date_range("2024-06-01", periods=4, freq="h", tz="UTC")
    frame = pd.DataFrame(
        {
            "city": ["Karachi"] * 4,
            "timestamp_utc": stamps,
            "rain_mm": [0.0, 0.0, 12.0, 0.0],
            "precipitation_mm": [0.0, 0.0, 12.0, 0.0],
            "temperature_2m_c": [30.0, 31.0, 32.0, 33.0],
            "relative_humidity_pct": [40.0, 50.0, 90.0, 60.0],
            "soil_moisture_0_to_7cm_m3m3": [0.1, 0.2, 0.9, 0.3],
            "wind_speed_10m_kmh": [1.0, 2.0, 3.0, 4.0],
            "weather_code_wmo": [0, 1, 65, 2],
        }
    )
    prepared = _prepare_weather_frame(frame)
    rainy = prepared.iloc[2]
    assert rainy["precipitation"] == 12.0
    assert rainy["weather_code"] == 1
    assert rainy["temperature_2m"] == 31.0
    assert rainy["relative_humidity_2m"] == 50.0
