"""
Pydantic schemas matching the ClimateShield 360 table contract and API conventions.
Defined in AGENT_RULES.md.
"""

from datetime import datetime
from typing import Generic, List, Literal, Optional, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


# --- API Standard Response Wrappers ---

class APIResponse(BaseModel, Generic[T]):
    """Standard API response structure adhering to AGENT_RULES.md convention."""
    data: T
    generated_at: datetime = Field(
        description="Timestamp in UTC when this response payload was generated"
    )
    is_sample: bool = Field(
        description="True if the data originates from synthetic or seeded demo warehouse"
    )


class ErrorResponse(BaseModel):
    """Standard error response structure adhering to AGENT_RULES.md convention."""
    error: str
    detail: Optional[str] = None


# --- Table Contract Models ---

class RunStatus(BaseModel):
    """Contract: run_status(run_id, started_at, finished_at, status, notes)"""
    run_id: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    status: Literal["pending", "running", "success", "failed"]
    notes: Optional[str] = None


class SourceFreshness(BaseModel):
    """Contract: source_freshness(source_name, publisher, licence, last_fetched_at, expected_every_minutes, status)"""
    source_name: str
    publisher: str
    licence: str
    last_fetched_at: datetime
    expected_every_minutes: int
    status: Literal["fresh", "delayed", "stale", "error"]


class QualityLog(BaseModel):
    """Contract: quality_log(logged_at, source_name, rule, action[fix|fill|flag], rows_affected, explanation)"""
    logged_at: datetime
    source_name: str
    rule: str
    action: Literal["fix", "fill", "flag"]
    rows_affected: int
    explanation: str


class Prediction(BaseModel):
    """Contract: predictions(zone_id, forecast_time, hazard_type, probability, interval_low, interval_high, baseline_value)"""
    zone_id: str
    forecast_time: datetime
    hazard_type: Literal["heat", "heavy_rain"]
    probability: float
    interval_low: float
    interval_high: float
    baseline_value: float


class ModelEval(BaseModel):
    """Contract: model_eval(group_type, group_value, metric, baseline_score, model_score)"""
    group_type: str
    group_value: str
    metric: str
    baseline_score: float
    model_score: float


class ExposureIndex(BaseModel):
    """Contract: exposure_index(zone_id, hazard_type, exposed_population, facilities_count, vulnerability_score, risk_level, evidence_strength)"""
    zone_id: str
    hazard_type: Literal["heat", "heavy_rain"]
    exposed_population: int
    facilities_count: int
    vulnerability_score: float
    risk_level: Literal["Low", "Moderate", "High", "Severe"]
    evidence_strength: Literal["low", "medium", "high"]


class Facility(BaseModel):
    """Contract: facilities(facility_id, type, name, zone_id, lat, lon)"""
    facility_id: str
    type: str
    name: str
    zone_id: str
    lat: float
    lon: float


class ImpactIndicator(BaseModel):
    """Contract: impact_indicators(zone_id, impact_area, indicator, value, evidence_strength, source, row_ids)"""
    zone_id: str
    impact_area: str
    indicator: str
    value: float
    evidence_strength: Literal["low", "medium", "high"]
    source: str
    row_ids: str


class Zone(BaseModel):
    """Contract: zones(zone_id, name, geometry_geojson)"""
    zone_id: str
    name: str
    geometry_geojson: str


# --- Health & Metadata Models ---

class HealthData(BaseModel):
    status: str = "ok"
    db_connected: bool
    duckdb_version: str
    tables_found: List[str]


class LastRunSummary(BaseModel):
    run_id: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class MetaData(BaseModel):
    app_name: str = "ClimateShield 360"
    version: str = "0.1.0"
    is_sample: bool
    timezone_stored: str = "UTC"
    timezone_display: str = "PKT (UTC+5)"
    db_path: str
    last_run: Optional[LastRunSummary] = None
