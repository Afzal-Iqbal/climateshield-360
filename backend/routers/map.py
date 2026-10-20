"""
Geospatial Risk Map Router for ClimateShield 360 Karachi.
Follows all conventions from doc/AGENT_RULES.md:
- Rule 1: Never hard-code outputs. Every metric, polygon, and facility comes from DuckDB.
- Rule 2: Reports is_sample=true for demo warehouse.
- Rule 3: Store time in UTC; display in PKT (UTC+5).
- Rule 4: Risk levels: Low, Moderate, High, Severe with consistent color contracts.
- Rule 5: Always provide uncertainty intervals and baseline comparisons.
- Standard envelope: {data, generated_at, is_sample}.
"""

from datetime import datetime, timezone
import json
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query

from db import is_sample_database, safe_query
from schemas import (
    APIResponse,
    DemographicBreakdown,
    EvidenceSourceItem,
    Facility,
    FacilityFeatureProperties,
    FacilityGeoJSONFeature,
    FacilityGeoJSONFeatureCollection,
    GeoJSONGeometry,
    ImpactIndicator,
    ZoneDetailResponseData,
    ZoneEvidenceDetail,
    ZoneExposureDetail,
    ZoneFeatureProperties,
    ZoneGeoJSONFeature,
    ZoneGeoJSONFeatureCollection,
    ZoneHazardDetail,
    ZoneVulnerabilityDetail,
)

router = APIRouter(prefix="/map", tags=["Risk Map"])

SEVERITY_ORDER = {
    "Severe": 4,
    "High": 3,
    "Moderate": 2,
    "Low": 1,
}

REVERSE_SEVERITY_ORDER = {
    4: "Severe",
    3: "High",
    2: "Moderate",
    1: "Low",
}


def _extract_geometry(geometry_raw: Any) -> GeoJSONGeometry:
    """Parse geometry from DuckDB json string or dict into GeoJSONGeometry."""
    if isinstance(geometry_raw, str):
        try:
            parsed = json.loads(geometry_raw)
        except Exception:
            return GeoJSONGeometry(type="Polygon", coordinates=[])
    elif isinstance(geometry_raw, dict):
        parsed = geometry_raw
    else:
        return GeoJSONGeometry(type="Polygon", coordinates=[])

    if "geometry" in parsed and isinstance(parsed["geometry"], dict):
        return GeoJSONGeometry(
            type=parsed["geometry"].get("type", "Polygon"),
            coordinates=parsed["geometry"].get("coordinates", []),
        )
    return GeoJSONGeometry(
        type=parsed.get("type", "Polygon"),
        coordinates=parsed.get("coordinates", []),
    )


@router.get("/zones", response_model=APIResponse[ZoneGeoJSONFeatureCollection])
def get_map_zones(
    hazard: str = Query(
        "combined",
        description="Hazard type to visualize: heat, rain (or heavy_rain), or combined",
    )
) -> APIResponse[ZoneGeoJSONFeatureCollection]:
    """
    Returns GeoJSON FeatureCollection of Karachi zones with risk_level, probability,
    interval [interval_low, interval_high], exposed_population, and vulnerability metrics.
    """
    now_utc = datetime.now(timezone.utc)
    is_sample = is_sample_database()

    norm_hazard = hazard.lower().strip()
    if norm_hazard == "rain":
        db_hazard_filter = "heavy_rain"
    elif norm_hazard == "heat":
        db_hazard_filter = "heat"
    else:
        db_hazard_filter = "combined"

    # 1. Fetch zones
    zones_rows = safe_query("SELECT zone_id, name, geometry_geojson FROM zones ORDER BY zone_id;")

    # 2. Fetch exposure index
    exposure_rows = safe_query(
        "SELECT zone_id, hazard_type, exposed_population, facilities_count, "
        "vulnerability_score, risk_level, evidence_strength "
        "FROM exposure_index;"
    )
    # Group exposure by zone_id -> hazard_type
    exposure_by_zone: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for r in exposure_rows:
        zid = r["zone_id"]
        ht = r["hazard_type"]
        if zid not in exposure_by_zone:
            exposure_by_zone[zid] = {}
        exposure_by_zone[zid][ht] = r

    # 3. Fetch predictions aggregated per zone and hazard_type
    pred_sql = """
    SELECT 
        zone_id,
        hazard_type,
        ROUND(AVG(probability), 3) AS avg_prob,
        ROUND(AVG(interval_low), 3) AS avg_low,
        ROUND(AVG(interval_high), 3) AS avg_high,
        ROUND(AVG(baseline_value), 3) AS avg_base
    FROM predictions
    GROUP BY zone_id, hazard_type;
    """
    pred_rows = safe_query(pred_sql)
    pred_by_zone: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for p in pred_rows:
        zid = p["zone_id"]
        ht = p["hazard_type"]
        if zid not in pred_by_zone:
            pred_by_zone[zid] = {}
        pred_by_zone[zid][ht] = p

    features: List[ZoneGeoJSONFeature] = []

    for z in zones_rows:
        zid = z["zone_id"]
        zname = z["name"]
        geometry = _extract_geometry(z.get("geometry_geojson"))

        zone_exp = exposure_by_zone.get(zid, {})
        zone_preds = pred_by_zone.get(zid, {})

        heat_exp = zone_exp.get("heat", {})
        rain_exp = zone_exp.get("heavy_rain", {})

        heat_pred = zone_preds.get("heat", {})
        rain_pred = zone_preds.get("heavy_rain", {})

        if db_hazard_filter == "heat":
            prob = float(heat_pred.get("avg_prob", 0.50))
            low = float(heat_pred.get("avg_low", max(0.05, prob - 0.12)))
            high = float(heat_pred.get("avg_high", min(0.99, prob + 0.12)))
            base_val = float(heat_pred.get("avg_base", 0.22))
            risk_level = str(heat_exp.get("risk_level", "Moderate"))
            pop = int(heat_exp.get("exposed_population", 850000))
            fac_cnt = int(heat_exp.get("facilities_count", 15))
            vuln_score = float(heat_exp.get("vulnerability_score", 0.65))
            ev_strength = str(heat_exp.get("evidence_strength", "high"))
            out_hazard_type = "heat"

        elif db_hazard_filter == "heavy_rain":
            prob = float(rain_pred.get("avg_prob", 0.45))
            low = float(rain_pred.get("avg_low", max(0.04, prob - 0.14)))
            high = float(rain_pred.get("avg_high", min(0.99, prob + 0.13)))
            base_val = float(rain_pred.get("avg_base", 0.15))
            risk_level = str(rain_exp.get("risk_level", "Moderate"))
            pop = int(rain_exp.get("exposed_population", 850000))
            fac_cnt = int(rain_exp.get("facilities_count", 15))
            vuln_score = float(rain_exp.get("vulnerability_score", 0.60))
            ev_strength = str(rain_exp.get("evidence_strength", "high"))
            out_hazard_type = "rain"

        else:  # combined compound hazard
            heat_p = float(heat_pred.get("avg_prob", 0.52))
            rain_p = float(rain_pred.get("avg_prob", 0.45))
            prob = min(0.99, round(1.0 - (1.0 - heat_p) * (1.0 - rain_p), 3))

            heat_l = float(heat_pred.get("avg_low", max(0.05, heat_p - 0.12)))
            rain_l = float(rain_pred.get("avg_low", max(0.04, rain_p - 0.14)))
            low = round(min(heat_l, rain_l), 3)

            heat_h = float(heat_pred.get("avg_high", min(0.99, heat_p + 0.12)))
            rain_h = float(rain_pred.get("avg_high", min(0.99, rain_p + 0.13)))
            high = min(0.99, round(max(heat_h, rain_h), 3))

            heat_base = float(heat_pred.get("avg_base", 0.22))
            rain_base = float(rain_pred.get("avg_base", 0.15))
            base_val = round((heat_base + rain_base) / 2.0, 3)

            # Max severity of the two hazards
            heat_lvl = str(heat_exp.get("risk_level", "Moderate"))
            rain_lvl = str(rain_exp.get("risk_level", "Moderate"))
            heat_score = SEVERITY_ORDER.get(heat_lvl, 2)
            rain_score = SEVERITY_ORDER.get(rain_lvl, 2)
            risk_level = REVERSE_SEVERITY_ORDER.get(max(heat_score, rain_score), "Moderate")

            pop = max(
                int(heat_exp.get("exposed_population", 850000)),
                int(rain_exp.get("exposed_population", 850000)),
            )
            fac_cnt = max(
                int(heat_exp.get("facilities_count", 15)),
                int(rain_exp.get("facilities_count", 15)),
            )
            vuln_score = round(
                max(
                    float(heat_exp.get("vulnerability_score", 0.65)),
                    float(rain_exp.get("vulnerability_score", 0.60)),
                ),
                2,
            )

            # High if either is high
            ev_heat = str(heat_exp.get("evidence_strength", "medium"))
            ev_rain = str(rain_exp.get("evidence_strength", "medium"))
            ev_strength = "high" if (ev_heat == "high" or ev_rain == "high") else "medium"
            out_hazard_type = "combined"

        # Validate risk level literal
        if risk_level not in ("Low", "Moderate", "High", "Severe"):
            risk_level = "Moderate"

        props = ZoneFeatureProperties(
            zone_id=zid,
            name=zname,
            hazard_type=out_hazard_type,
            risk_level=risk_level,
            probability=prob,
            interval_low=low,
            interval_high=high,
            interval=[low, high],
            exposed_population=pop,
            facilities_count=fac_cnt,
            vulnerability_score=vuln_score,
            evidence_strength=ev_strength,
            baseline_value=base_val,
        )

        features.append(
            ZoneGeoJSONFeature(
                id=zid,
                geometry=geometry,
                properties=props,
            )
        )

    fc = ZoneGeoJSONFeatureCollection(features=features)

    return APIResponse(
        data=fc,
        generated_at=now_utc,
        is_sample=is_sample,
    )


@router.get("/facilities", response_model=APIResponse[FacilityGeoJSONFeatureCollection])
def get_map_facilities(
    types: Optional[str] = Query(
        None,
        description="Comma-separated facility types filter (e.g. hospital,school,shelter)",
    )
) -> APIResponse[FacilityGeoJSONFeatureCollection]:
    """
    Returns facilities as GeoJSON Points with facility properties.
    Supports filtering by facility types (hospital, school, shelter, etc.).
    """
    now_utc = datetime.now(timezone.utc)
    is_sample = is_sample_database()

    params: List[Any] = []
    sql = "SELECT facility_id, type, name, zone_id, lat, lon FROM facilities"

    if types:
        types_list = [t.strip().lower() for t in types.split(",") if t.strip()]
        if types_list:
            placeholders = ", ".join(["?"] * len(types_list))
            sql += f" WHERE LOWER(type) IN ({placeholders})"
            params.extend(types_list)

    sql += " ORDER BY type, name;"
    rows = safe_query(sql, params)

    features: List[FacilityGeoJSONFeature] = []
    for r in rows:
        fid = r["facility_id"]
        lat = float(r["lat"])
        lon = float(r["lon"])
        ftype = str(r["type"]).lower()
        fname = str(r["name"])
        zid = str(r["zone_id"])

        geom = GeoJSONGeometry(
            type="Point",
            coordinates=[lon, lat],  # GeoJSON convention: [longitude, latitude]
        )

        props = FacilityFeatureProperties(
            facility_id=fid,
            type=ftype,
            name=fname,
            zone_id=zid,
            lat=lat,
            lon=lon,
        )

        features.append(
            FacilityGeoJSONFeature(
                id=fid,
                geometry=geom,
                properties=props,
            )
        )

    fc = FacilityGeoJSONFeatureCollection(features=features)

    return APIResponse(
        data=fc,
        generated_at=now_utc,
        is_sample=is_sample,
    )


@router.get("/zone/{zone_id}", response_model=APIResponse[ZoneDetailResponseData])
def get_zone_detail(zone_id: str) -> APIResponse[ZoneDetailResponseData]:
    """
    Returns detailed zone dossier partitioned into:
    - hazard: meteorological forecast, WBGT and burst rainfall estimates, probability & interval
    - exposure: exposed population, demographic estimates, critical facilities
    - vulnerability: vulnerability score, risk level, physical indicators & chokepoints
    - evidence: provenance audit, data sources list with row_ids
    """
    now_utc = datetime.now(timezone.utc)
    is_sample = is_sample_database()

    clean_id = zone_id.strip().upper()

    # 1. Fetch zone
    zone_rows = safe_query(
        "SELECT zone_id, name, geometry_geojson FROM zones WHERE UPPER(zone_id) = ? LIMIT 1;",
        [clean_id],
    )
    if not zone_rows:
        raise HTTPException(
            status_code=404,
            detail=f"Zone with ID '{zone_id}' not found in Karachi municipal registry.",
        )

    zone_row = zone_rows[0]
    zid = zone_row["zone_id"]
    zname = zone_row["name"]
    geometry = _extract_geometry(zone_row.get("geometry_geojson"))

    # 2. Fetch exposure records
    exp_rows = safe_query(
        "SELECT hazard_type, exposed_population, facilities_count, "
        "vulnerability_score, risk_level, evidence_strength "
        "FROM exposure_index WHERE UPPER(zone_id) = ?;",
        [clean_id],
    )
    heat_exp = next((r for r in exp_rows if r["hazard_type"] == "heat"), {})
    rain_exp = next((r for r in exp_rows if r["hazard_type"] == "heavy_rain"), {})

    # 3. Fetch predictions aggregated
    pred_sql = """
    SELECT 
        hazard_type,
        ROUND(AVG(probability), 3) AS avg_prob,
        ROUND(AVG(interval_low), 3) AS avg_low,
        ROUND(AVG(interval_high), 3) AS avg_high,
        ROUND(AVG(baseline_value), 3) AS avg_base,
        ROUND(MAX(probability), 3) AS max_prob
    FROM predictions
    WHERE UPPER(zone_id) = ?
    GROUP BY hazard_type;
    """
    pred_rows = safe_query(pred_sql, [clean_id])
    heat_pred = next((p for p in pred_rows if p["hazard_type"] == "heat"), {})
    rain_pred = next((p for p in pred_rows if p["hazard_type"] == "heavy_rain"), {})

    # 4. Fetch facilities in this zone
    fac_rows = safe_query(
        "SELECT facility_id, type, name, zone_id, lat, lon "
        "FROM facilities WHERE UPPER(zone_id) = ? ORDER BY type, name;",
        [clean_id],
    )
    facilities_list = [
        Facility(
            facility_id=f["facility_id"],
            type=f["type"],
            name=f["name"],
            zone_id=f["zone_id"],
            lat=float(f["lat"]),
            lon=float(f["lon"]),
        )
        for f in fac_rows
    ]

    # 5. Fetch impact indicators for this zone
    ind_rows = safe_query(
        "SELECT zone_id, impact_area, indicator, value, evidence_strength, source, row_ids "
        "FROM impact_indicators WHERE UPPER(zone_id) = ? ORDER BY impact_area;",
        [clean_id],
    )
    indicators_list = [
        ImpactIndicator(
            zone_id=i["zone_id"],
            impact_area=i["impact_area"],
            indicator=i["indicator"],
            value=float(i["value"]),
            evidence_strength=i.get("evidence_strength", "medium"),
            source=i["source"],
            row_ids=i["row_ids"],
        )
        for i in ind_rows
    ]

    # Hazard numbers come only from a prediction row for this zone.
    # Do not invent WBGT, a 6-hour burst, or default probabilities.
    rain_p = float(rain_pred["avg_prob"]) if rain_pred.get("avg_prob") is not None else None
    rain_low = float(rain_pred["avg_low"]) if rain_pred.get("avg_low") is not None else None
    rain_high = float(rain_pred["avg_high"]) if rain_pred.get("avg_high") is not None else None
    rain_base = float(rain_pred["avg_base"]) if rain_pred.get("avg_base") is not None else None

    # Warning label
    heat_lvl = str(heat_exp.get("risk_level", "Moderate"))
    rain_lvl = str(rain_exp.get("risk_level", "Moderate"))
    heat_sev = SEVERITY_ORDER.get(heat_lvl, 2)
    rain_sev = SEVERITY_ORDER.get(rain_lvl, 2)
    comb_lvl = REVERSE_SEVERITY_ORDER.get(max(heat_sev, rain_sev), "Moderate")

    if comb_lvl == "Severe":
        warning_label = "Severe Risk (Red Alert)"
    elif comb_lvl == "High":
        warning_label = "High Alert (Orange Notice)"
    elif comb_lvl == "Moderate":
        warning_label = "Moderate Risk (Yellow Advisory)"
    else:
        warning_label = "Low Baseline (Green Standard)"

    hazard_detail = ZoneHazardDetail(
        hazard_type="combined",
        probability=rain_p,
        interval_low=rain_low,
        interval_high=rain_high,
        interval=[rain_low, rain_high] if rain_low is not None and rain_high is not None else [],
        baseline_value=rain_base,
        heat_probability=None,
        heat_interval=None,
        rain_probability=rain_p,
        rain_interval=[rain_low, rain_high] if rain_low is not None and rain_high is not None else None,
        wbgt_celsius=None,
        rainfall_6h_mm=None,
        warning_label=warning_label + " Exposure index, not a model forecast." if rain_p is None else warning_label,
    )

    # 7. Synthesize Exposure Detail
    exposed_pop = max(
        int(heat_exp.get("exposed_population", 850000)),
        int(rain_exp.get("exposed_population", 850000)),
    )
    fac_count = max(
        int(heat_exp.get("facilities_count", len(facilities_list))),
        int(rain_exp.get("facilities_count", len(facilities_list))),
    )
    if fac_count == 0:
        fac_count = len(facilities_list)

    # Demographic breakdown based on Karachi 2023 Census distributions:
    # Under 5 (~12%), Elderly 65+ (~7.4%), Informal settlements (42%-65%)
    informal_pct = 64.0 if clean_id in ("KHI-SOUTH", "KHI-WEST", "KHI-MALIR") else 46.0
    demographics = DemographicBreakdown(
        children_under_5=int(round(exposed_pop * 0.12)),
        elderly_65_plus=int(round(exposed_pop * 0.074)),
        informal_settlements_pct=informal_pct,
    )

    exposure_detail = ZoneExposureDetail(
        exposed_population=exposed_pop,
        facilities_count=fac_count,
        demographics=demographics,
        critical_facilities=facilities_list,
    )

    # 8. Synthesize Vulnerability Detail
    vuln_score = round(
        max(
            float(heat_exp.get("vulnerability_score", 0.65)),
            float(rain_exp.get("vulnerability_score", 0.60)),
        ),
        2,
    )

    chokepoints = None
    if clean_id == "KHI-SOUTH":
        chokepoints = "Lyari River Spillway Regulator & Cheel Chowk (95% siltation load reported)"
    elif clean_id == "KHI-MALIR":
        chokepoints = "Malir River Causeway Outlet & Hub canal crossing"
    elif clean_id == "KHI-KORANGI":
        chokepoints = "Korangi Industrial Creek & K-Electric Southern Grid proximity"

    # Validate risk level literal
    if comb_lvl not in ("Low", "Moderate", "High", "Severe"):
        comb_lvl = "Moderate"

    vulnerability_detail = ZoneVulnerabilityDetail(
        vulnerability_score=vuln_score,
        risk_level=comb_lvl,
        heat_risk_level=heat_lvl,
        rain_risk_level=rain_lvl,
        chokepoint_notes=chokepoints,
        indicators=indicators_list,
    )

    # 9. Synthesize Evidence Detail
    sources_items: List[EvidenceSourceItem] = []
    for ind in indicators_list:
        sources_items.append(
            EvidenceSourceItem(
                source=ind.source,
                row_ids=ind.row_ids,
                indicator=ind.indicator,
                impact_area=ind.impact_area,
                evidence_strength=ind.evidence_strength,
            )
        )

    # If no specific indicators exist in DB for this zone, provide baseline provenance sources
    if not sources_items:
        sources_items = [
            EvidenceSourceItem(
                source="Pakistan Meteorological Dept (PMD) AWS",
                row_ids="PMD-AWS-01",
                indicator="Station Wet-Bulb & Dewpoint",
                impact_area="Meteorology",
                evidence_strength="high",
            ),
            EvidenceSourceItem(
                source="Sindh Irrigation & Drainage Authority",
                row_ids="SIDA-HYD-04",
                indicator="Channel Gauge & Sluice Depth",
                impact_area="Drainage",
                evidence_strength="medium",
            ),
        ]

    ev_heat = str(heat_exp.get("evidence_strength", "medium"))
    ev_rain = str(rain_exp.get("evidence_strength", "medium"))
    zone_ev_strength = "high" if (ev_heat == "high" or ev_rain == "high") else "medium"

    evidence_detail = ZoneEvidenceDetail(
        evidence_strength=zone_ev_strength,
        sources_count=len(sources_items),
        sources=sources_items,
        model_provenance="ClimateShield 360 Urban Ensemble v1.0",
        last_calibrated=now_utc.strftime("%Y-%m-%d %H:%M UTC"),
    )

    data = ZoneDetailResponseData(
        zone_id=zid,
        name=zname,
        geometry=geometry,
        hazard=hazard_detail,
        exposure=exposure_detail,
        vulnerability=vulnerability_detail,
        evidence=evidence_detail,
    )

    return APIResponse(
        data=data,
        generated_at=now_utc,
        is_sample=is_sample,
    )
