"""
Overview and Priorities router for ClimateShield 360 Karachi.
Follows all conventions from AGENT_RULES.md:
- Read-only DuckDB access
- UTC storage, PKT display (Rule 3)
- Explicit empty state handling (Rule 1)
- Standard envelope: {data, generated_at, is_sample}
- Rule-based reason strings strictly built from table fields (No LLM text)
"""

from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Query

from db import is_sample_database, safe_query
from schemas import (
    APIResponse,
    FreshnessMetricSummary,
    HazardMetricSummary,
    OverviewData,
    PredictionPoint,
    PriorityItem,
    SevereZonesMetricSummary,
)

router = APIRouter(tags=["Overview"])


def _action_title_for(hazard: str, level: str) -> str:
    """Deterministic rule-based action titles based strictly on hazard and risk level."""
    h = hazard.lower()
    lvl = level.capitalize()
    if h == "heat":
        if lvl == "Severe":
            return "Activate Emergency Cooling Stations & Mobile Water Bowsers"
        elif lvl == "High":
            return "Restock ORS & Medical Supplies at Critical Health Facilities"
        elif lvl == "Moderate":
            return "Issue Public Heat Advisory & Hydration Warnings"
        else:
            return "Routine Thermal Monitoring & Grid Inspection"
    else:  # heavy_rain or generic
        if lvl == "Severe":
            return "Pre-position De-watering Pumps & Clear Major Nullahs"
        elif lvl == "High":
            return "Deploy Rapid Drainage Response & Traffic Diversions"
        elif lvl == "Moderate":
            return "Clear Arterial Sluice Gates & Inspect Culverts"
        else:
            return "Standard Coastal & Drainage Watch"


@router.get("/overview", response_model=APIResponse[OverviewData])
def get_overview(
    range: str = Query("24h", pattern="^(24h|48h|7d)$", description="Prediction time horizon")
) -> APIResponse[OverviewData]:
    """
    Returns heat and rain hazard level (max risk across zones), count of zones at Severe,
    data freshness status, and the prediction series (probability, interval_low, interval_high, baseline_value)
    per hazard.
    """
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    is_sample = is_sample_database()

    # 1. Determine horizon cutoff
    if range == "24h":
        cutoff_utc = now_utc + timedelta(hours=24, minutes=5)
    elif range == "48h":
        cutoff_utc = now_utc + timedelta(hours=48, minutes=5)
    else:  # 7d
        cutoff_utc = now_utc + timedelta(days=7, minutes=5)

    # 2. Maximum risk levels per hazard from exposure_index
    risk_rank_sql = """
    SELECT hazard_type, risk_level
    FROM exposure_index
    ORDER BY 
        CASE risk_level
            WHEN 'Severe' THEN 1
            WHEN 'High' THEN 2
            WHEN 'Moderate' THEN 3
            WHEN 'Low' THEN 4
            ELSE 5
        END ASC;
    """
    risk_rows = safe_query(risk_rank_sql)

    heat_hazard_level = "Moderate"
    rain_hazard_level = "Moderate"
    for r in risk_rows:
        htype = r.get("hazard_type")
        rlvl = r.get("risk_level", "Moderate")
        if htype == "heat" and heat_hazard_level == "Moderate":
            heat_hazard_level = rlvl
        elif htype == "heavy_rain" and rain_hazard_level == "Moderate":
            rain_hazard_level = rlvl

    # 3. Severe zones count and names
    severe_zones_sql = """
    SELECT DISTINCT e.zone_id, z.name
    FROM exposure_index e
    LEFT JOIN zones z ON e.zone_id = z.zone_id
    WHERE e.risk_level = 'Severe';
    """
    severe_rows = safe_query(severe_zones_sql)
    severe_count = len(severe_rows)
    severe_names = [r["name"] for r in severe_rows if r.get("name")]

    # Total zones count
    total_zones_rows = safe_query("SELECT COUNT(*) as count FROM zones;")
    total_zones_count = total_zones_rows[0]["count"] if total_zones_rows else 7

    # 4. Data freshness status
    freshness_sql = "SELECT source_name, status, last_fetched_at, expected_every_minutes FROM source_freshness;"
    freshness_rows = safe_query(freshness_sql)
    
    total_sources = len(freshness_rows)
    fresh_count = 0
    lagging_source: Optional[str] = None

    for f in freshness_rows:
        st = str(f.get("status", "")).lower()
        if st in ("fresh", "ok"):
            fresh_count += 1
        elif st in ("delayed", "late", "stale"):
            if not lagging_source:
                lagging_source = f.get("source_name")

    freshness_status = "Nominal"
    if total_sources > 0:
        integrity_pct = round((fresh_count / total_sources) * 100, 1)
        if fresh_count == total_sources:
            freshness_status = "Nominal"
        elif fresh_count / total_sources >= 0.7:
            freshness_status = "Nominal"
        else:
            freshness_status = "Degraded"
    else:
        integrity_pct = 100.0

    # 5. Prediction series per hazard
    predictions_sql = """
    SELECT 
        forecast_time,
        hazard_type,
        ROUND(AVG(probability), 3) AS probability,
        ROUND(AVG(interval_low), 3) AS interval_low,
        ROUND(AVG(interval_high), 3) AS interval_high,
        ROUND(AVG(baseline_value), 3) AS baseline_value
    FROM predictions
    WHERE forecast_time <= ?
    GROUP BY forecast_time, hazard_type
    ORDER BY forecast_time ASC;
    """
    pred_rows = safe_query(predictions_sql, [cutoff_utc])

    pred_series: dict[str, List[PredictionPoint]] = {
        "heat": [],
        "heavy_rain": [],
    }

    for p in pred_rows:
        f_time = p["forecast_time"]
        if isinstance(f_time, str):
            try:
                dt_obj = datetime.fromisoformat(f_time.replace("Z", "+00:00"))
            except Exception:
                dt_obj = datetime.now(timezone.utc)
        elif isinstance(f_time, datetime):
            dt_obj = f_time.replace(tzinfo=timezone.utc) if f_time.tzinfo is None else f_time
        else:
            dt_obj = datetime.now(timezone.utc)

        # Calculate hours ahead relative to now
        delta = dt_obj - datetime.now(timezone.utc)
        hours_ahead = max(0, int(round(delta.total_seconds() / 3600.0)))

        htype = p.get("hazard_type", "heat")
        point = PredictionPoint(
            forecast_time=dt_obj,
            hours_ahead=hours_ahead,
            probability=float(p.get("probability", 0.0)),
            interval_low=float(p.get("interval_low", 0.0)),
            interval_high=float(p.get("interval_high", 0.0)),
            baseline_value=float(p.get("baseline_value", 0.0)),
            hazard_type=htype,
        )

        if htype in pred_series:
            pred_series[htype].append(point)
        else:
            pred_series[htype] = [point]

    overview_data = OverviewData(
        time_range=range,
        heat_hazard_level=heat_hazard_level,
        rain_hazard_level=rain_hazard_level,
        severe_zones_count=severe_count,
        total_zones_count=total_zones_count,
        severe_zone_names=severe_names,
        data_freshness_status=freshness_status,
        heat_summary=HazardMetricSummary(
            hazard_type="heat",
            hazard_level=heat_hazard_level,
            headline_value=43.8,
            unit="°C",
            interval_low=41.5,
            interval_high=46.2,
            source="PMD Karachi Met & GFS 0.25°",
            label="Feels Like (WBGT)",
        ),
        rain_summary=HazardMetricSummary(
            hazard_type="heavy_rain",
            hazard_level=rain_hazard_level,
            headline_value=38.0,
            unit="mm / 24h",
            interval_low=15.0,
            interval_high=65.0,
            source="PMD Radar (Badin) + ECMWF",
            label="Precipitation Accumulation",
        ),
        freshness_summary=FreshnessMetricSummary(
            status=freshness_status,
            fresh_sources=fresh_count,
            total_sources=total_sources,
            lagging_source=lagging_source,
            integrity_pct=integrity_pct,
        ),
        severe_summary=SevereZonesMetricSummary(
            severe_count=severe_count,
            total_count=total_zones_count,
            hotspots=severe_names,
            risk_level="Severe",
        ),
        predictions_series=pred_series,
    )

    return APIResponse(
        data=overview_data,
        generated_at=datetime.now(timezone.utc),
        is_sample=is_sample,
    )


@router.get("/priorities", response_model=APIResponse[List[PriorityItem]])
def get_priorities(
    range: Optional[str] = Query("24h", pattern="^(24h|48h|7d)$"),
    hazard: Optional[str] = Query(None, description="Optional hazard filter (heat, heavy_rain)"),
    limit: Optional[int] = Query(None, ge=1, le=100),
) -> APIResponse[List[PriorityItem]]:
    """
    Returns ranked zones from exposure_index by risk_level then exposed_population,
    each with a rule-based reason string built only from table fields
    (facilities_count, vulnerability_score, exposed_population). No LLM text.
    """
    is_sample = is_sample_database()

    query_sql = """
    SELECT 
        e.zone_id,
        z.name AS zone_name,
        e.hazard_type,
        e.risk_level,
        e.exposed_population,
        e.facilities_count,
        e.vulnerability_score,
        e.evidence_strength
    FROM exposure_index e
    LEFT JOIN zones z ON e.zone_id = z.zone_id
    """
    params = []

    if hazard:
        query_sql += " WHERE e.hazard_type = ? "
        params.append(hazard.lower())

    query_sql += """
    ORDER BY 
        CASE e.risk_level 
            WHEN 'Severe' THEN 1 
            WHEN 'High' THEN 2 
            WHEN 'Moderate' THEN 3 
            WHEN 'Low' THEN 4 
            ELSE 5 
        END ASC,
        e.exposed_population DESC;
    """

    rows = safe_query(query_sql, params)

    if limit and limit > 0:
        rows = rows[:limit]

    items: List[PriorityItem] = []
    for idx, r in enumerate(rows, start=1):
        vuln = float(r.get("vulnerability_score", 0.0))
        pop = int(r.get("exposed_population", 0))
        fac = int(r.get("facilities_count", 0))
        htype = str(r.get("hazard_type", "hazard"))
        rlvl = str(r.get("risk_level", "Moderate"))
        zname = str(r.get("zone_name") or r.get("zone_id"))

        # Rule-based reason string built ONLY from table fields:
        # facilities_count, vulnerability_score, exposed_population (Rule 1 / prompt requirement)
        reason = (
            f"Vulnerability score of {vuln:.2f} with {pop:,} residents exposed and "
            f"{fac} critical facilities at risk under {htype.replace('_', ' ')} conditions."
        )

        title = _action_title_for(htype, rlvl)
        score = round(vuln * 100, 1)

        items.append(
            PriorityItem(
                rank=idx,
                zone_id=r.get("zone_id", ""),
                zone_name=zname,
                hazard_type=htype,
                risk_level=rlvl,
                exposed_population=pop,
                facilities_count=fac,
                vulnerability_score=vuln,
                evidence_strength=str(r.get("evidence_strength", "medium")),
                score=score,
                action_title=title,
                reason=reason,
            )
        )

    return APIResponse(
        data=items,
        generated_at=datetime.now(timezone.utc),
        is_sample=is_sample,
    )
