"""
Forecast router for ClimateShield 360 Karachi.
Follows all conventions from AGENT_RULES.md:
- Rule 1: Never hard-code outputs. Every number, chart and table comes from DuckDB.
- Rule 2: Sample data reports is_sample=true.
- Rule 3: Store time in UTC; display in PKT (UTC+5).
- Rule 5: Always show uncertainty intervals and baseline comparison where predictions appear.
- Standard envelope: {data, generated_at, is_sample}
- Read-only DuckDB access
"""

from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Literal, Optional
from fastapi import APIRouter, Query

from db import is_sample_database, safe_query
from schemas import (
    APIResponse,
    BaselineInfo,
    ForecastResponseData,
    ForecastThresholds,
    ObservedWeatherPoint,
    PredictedPoint,
    ThresholdLevel,
)

router = APIRouter(prefix="/forecast", tags=["Forecast"])

PKT_OFFSET = timezone(timedelta(hours=5))

WMO_CODE_MAP = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


def format_pkt(dt: Any) -> str:
    """Format UTC datetime into PKT string."""
    if dt is None:
        return "—"
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except Exception:
            return dt
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        pkt_time = dt.astimezone(PKT_OFFSET)
        return pkt_time.strftime("%d %b %H:%M PKT")
    return str(dt)


@router.get("", response_model=APIResponse[ForecastResponseData])
def get_forecast(
    hazard: Literal["heavy_rain", "heat"] = Query("heavy_rain", description="Hazard type: heavy_rain or heat"),
    city: str = Query("Karachi", description="Monitored city name (e.g. Karachi, Lahore, Islamabad)"),
    range: Literal["24h", "48h", "7d"] = Query("24h", description="Time range horizon: 24h, 48h, 7d"),
) -> APIResponse[ForecastResponseData]:
    """
    Returns observed time-series, ML predicted series (with uncertainty intervals),
    24h persistence baseline, declared targets, and official thresholds.
    For hazard=heat: observed values and thresholds only, predicted=null.
    """
    now_utc = datetime.now(timezone.utc)
    is_sample = is_sample_database()

    # Determine hour limit
    limit_hours = 24
    if range == "48h":
        limit_hours = 48
    elif range == "7d":
        limit_hours = 168

    # 1. Query observed weather from DuckDB warehouse
    obs_query = """
        SELECT 
            timestamp_utc,
            timestamp_pkt,
            temperature_2m_c,
            precipitation_mm,
            rain_mm,
            relative_humidity_pct,
            wind_speed_10m_kmh,
            weather_code_wmo
        FROM weather_hourly
        WHERE lower(city) = lower(?)
        ORDER BY timestamp_utc DESC
        LIMIT ?;
    """
    obs_rows = safe_query(obs_query, [city.strip(), limit_hours])
    # Chronological ordering for charts
    obs_rows.reverse()

    observed_series: List[ObservedWeatherPoint] = []
    historical_values: List[float] = []

    for r in obs_rows:
        ts_utc = r.get("timestamp_utc")
        if isinstance(ts_utc, str):
            try:
                ts_utc = datetime.fromisoformat(ts_utc.replace("Z", "+00:00"))
            except Exception:
                ts_utc = now_utc
        elif not isinstance(ts_utc, datetime):
            ts_utc = now_utc

        if ts_utc.tzinfo is None:
            ts_utc = ts_utc.replace(tzinfo=timezone.utc)

        ts_pkt = format_pkt(ts_utc)

        if hazard == "heat":
            val = float(r.get("temperature_2m_c") or 0.0)
            unit = "°C"
        else:
            precip = r.get("precipitation_mm")
            rain = r.get("rain_mm")
            val = float(precip if precip is not None else (rain or 0.0))
            unit = "mm"

        historical_values.append(val)
        wmo_code = r.get("weather_code_wmo")
        condition = WMO_CODE_MAP.get(int(wmo_code), "Normal") if wmo_code is not None else None

        observed_series.append(
            ObservedWeatherPoint(
                timestamp_utc=ts_utc,
                timestamp_pkt=ts_pkt,
                value=round(val, 2),
                unit=unit,
                relative_humidity_pct=float(r["relative_humidity_pct"]) if r.get("relative_humidity_pct") is not None else None,
                wind_speed_kmh=round(float(r["wind_speed_10m_kmh"]), 1) if r.get("wind_speed_10m_kmh") is not None else None,
                weather_condition=condition,
            )
        )

    # 2. Configure hazard-specific baseline, thresholds, and predictions
    if hazard == "heat":
        # Heat: observed values against thresholds, ML predictions are NOT applicable
        thresholds = ForecastThresholds(
            unit="°C",
            primary_threshold=40.0,
            primary_label="Extreme Heat Danger (>= 40.0°C)",
            levels=[
                ThresholdLevel(level="advisory", value=35.0, label="Caution / High Heat (35.0°C)", color="#B45309"),
                ThresholdLevel(level="warning", value=40.0, label="Danger / Extreme Heat (40.0°C)", color="#C2410C"),
                ThresholdLevel(level="severe", value=45.0, label="Severe Heatwave (45.0°C)", color="#B91C1C"),
            ],
        )
        declared_target = "KMC / NDMA Heat Action Plan monitoring against physical threshold tiers (35°C Caution, 40°C Danger, 45°C Severe)"
        baseline_val = historical_values[-24] if len(historical_values) >= 24 else (historical_values[0] if historical_values else None)
        baseline = BaselineInfo(
            name="24h Persistence Baseline",
            description="Temperature observed 24 hours prior (y_hat_t = y_{t-24h})",
            value=round(baseline_val, 2) if baseline_val is not None else None,
        )
        predicted_series = None
        note = "heat is observed against thresholds and is not ML-predicted"
        model_version = None

    else:
        # Heavy rain: ML predicted series with uncertainty bounds
        thresholds = ForecastThresholds(
            unit="mm/hr",
            primary_threshold=2.5,
            primary_label="Heavy Rain Action Threshold (>= 2.5 mm/hr)",
            levels=[
                ThresholdLevel(level="advisory", value=1.0, label="Advisory / Light Rain (1.0 mm/hr)", color="#B45309"),
                ThresholdLevel(level="warning", value=2.5, label="Heavy Rain Action Threshold (2.5 mm/hr)", color="#C2410C"),
                ThresholdLevel(level="severe", value=10.0, label="Severe Inundation Risk (10.0 mm/hr)", color="#B91C1C"),
            ],
        )
        declared_target = "20% improvement in MAE over 24h persistence baseline; threshold = 2.5 mm/hr for heavy rain"

        # Query predictions from DuckDB
        pred_query = """
            SELECT 
                city,
                forecast_time,
                hazard_type,
                probability,
                interval_low,
                interval_high,
                baseline_value,
                model_version,
                generated_at,
                median
            FROM predictions
            WHERE (lower(city) = lower(?) OR lower(zone_id) = lower(?))
              AND hazard_type = 'heavy_rain'
            ORDER BY forecast_time ASC;
        """
        pred_rows = safe_query(pred_query, [city.strip(), city.strip()])

        predicted_series: List[PredictedPoint] = []
        model_version = "lightgbm_quantile_v1.0"
        baseline_val = None

        if pred_rows:
            model_version = pred_rows[0].get("model_version") or "lightgbm_quantile_v1.0"
            baseline_val = float(pred_rows[0].get("baseline_value") or 0.0)
            for pr in pred_rows:
                f_time = pr.get("forecast_time")
                if isinstance(f_time, str):
                    try:
                        f_time = datetime.fromisoformat(f_time.replace("Z", "+00:00"))
                    except Exception:
                        f_time = now_utc
                elif not isinstance(f_time, datetime):
                    f_time = now_utc
                if f_time.tzinfo is None:
                    f_time = f_time.replace(tzinfo=timezone.utc)

                predicted_series.append(
                    PredictedPoint(
                        forecast_time_utc=f_time,
                        forecast_time_pkt=format_pkt(f_time),
                        probability=round(float(pr.get("probability") or 0.0), 4),
                        interval_low=round(float(pr.get("interval_low") or 0.0), 3),
                        interval_high=round(float(pr.get("interval_high") or 0.0), 3),
                        median=round(float(pr.get("median") or pr.get("probability") or 0.0), 3),
                        baseline_value=round(float(pr.get("baseline_value") or 0.0), 3),
                        unit="mm/hr",
                    )
                )
            note = None
        else:
            predicted_series = []
            note = "No active ML predictions recorded for this city in the warehouse."
            baseline_val = historical_values[-24] if len(historical_values) >= 24 else 0.0

        baseline = BaselineInfo(
            name="24h Persistence Baseline",
            description="24h persistence (y_hat_t = y_{t-24h})",
            value=round(baseline_val, 3) if baseline_val is not None else None,
        )

    forecast_data = ForecastResponseData(
        hazard=hazard,
        city=city,
        range=range,
        observed=observed_series,
        predicted=predicted_series,
        baseline=baseline,
        declared_target=declared_target,
        thresholds=thresholds,
        note=note,
        model_version=model_version,
        generated_at=now_utc,
    )

    return APIResponse(
        data=forecast_data,
        generated_at=now_utc,
        is_sample=is_sample,
    )
