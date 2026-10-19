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


class RunStatusExtended(RunStatus):
    """RunStatus with execution duration metrics for timeline visualization."""
    duration_seconds: Optional[float] = None
    is_latest: bool = False


class SourceFreshness(BaseModel):
    """Contract: source_freshness(source_name, publisher, licence, last_fetched_at, expected_every_minutes, status)"""
    source_name: str
    publisher: str
    licence: str
    last_fetched_at: datetime
    expected_every_minutes: int
    status: Literal["fresh", "delayed", "stale", "error"]


class SourceFreshnessComputed(BaseModel):
    """
    Source freshness with dynamically computed SLA status:
    - Fresh: <= 1.0x expected_every_minutes
    - Late: <= 3.0x expected_every_minutes
    - Stale: > 3.0x expected_every_minutes
    """
    source_name: str
    publisher: str
    licence: str
    last_fetched_at: datetime
    expected_every_minutes: int
    stored_status: str
    computed_status: Literal["Fresh", "Late", "Stale"]
    minutes_since_fetch: float
    ratio: float
    delay_minutes: float


class FreshnessSummary(BaseModel):
    total: int
    fresh: int
    late: int
    stale: int
    availability_pct: float


class FreshnessResponseData(BaseModel):
    sources: List[SourceFreshnessComputed]
    summary: FreshnessSummary


class QualityLog(BaseModel):
    """Contract: quality_log(logged_at, source_name, rule, action[fix|fill|flag], rows_affected, explanation)"""
    logged_at: datetime
    source_name: str
    rule: str
    action: Literal["fix", "fill", "flag"]
    rows_affected: int
    explanation: str


class QualitySummaryCounts(BaseModel):
    fix: int = 0
    fill: int = 0
    flag: int = 0
    total_actions: int = 0
    rules_audited: int = 0


class QualitySummaryResponseData(BaseModel):
    total_checks: int
    fixed: int
    filled: int
    flagged: int
    total_anomalies: int
    pass_rate_pct: float
    sources_audited: int


class QualityDecisionsResponseData(BaseModel):
    items: List[QualityLog]
    total: int
    limit: int
    offset: int
    sources: List[str]


class DailyQualityCount(BaseModel):
    date: str
    fix: int = 0
    fill: int = 0
    flag: int = 0
    total: int = 0


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


class ModelEvalExtended(ModelEval):
    """ModelEval with computed error reduction and weakest group flag."""
    error_reduction_pct: Optional[float] = None
    is_weakest: bool = False


class ModelEvalResponseData(BaseModel):
    evaluations: List[ModelEvalExtended]
    weakest_group: Optional[ModelEvalExtended] = None
    overall_baseline_mae: Optional[float] = None
    overall_model_mae: Optional[float] = None
    overall_reduction_pct: Optional[float] = None


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


# --- Pipeline Status Schemas ---

class PipelineStatusData(BaseModel):
    latest_successful_run: Optional[RunStatusExtended] = None
    latest_run: Optional[RunStatusExtended] = None
    is_late: bool
    minutes_since_last_success: Optional[float] = None
    status_indicator: Literal["ok", "late", "failed"]
    quality_summary: QualitySummaryCounts


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


# --- Overview & Priorities Schemas ---

class PredictionPoint(BaseModel):
    forecast_time: datetime
    hours_ahead: int
    probability: float
    interval_low: float
    interval_high: float
    baseline_value: float
    hazard_type: str


class HazardMetricSummary(BaseModel):
    hazard_type: str
    hazard_level: str  # Severe, High, Moderate, Low
    headline_value: float
    unit: str
    interval_low: float
    interval_high: float
    source: str
    label: str


class FreshnessMetricSummary(BaseModel):
    status: str  # Nominal, Degraded, Stale
    fresh_sources: int
    total_sources: int
    lagging_source: Optional[str] = None
    integrity_pct: float


class SevereZonesMetricSummary(BaseModel):
    severe_count: int
    total_count: int
    hotspots: List[str]
    risk_level: str = "Severe"


class OverviewData(BaseModel):
    time_range: str
    heat_hazard_level: str
    rain_hazard_level: str
    severe_zones_count: int
    total_zones_count: int
    severe_zone_names: List[str]
    data_freshness_status: str
    heat_summary: HazardMetricSummary
    rain_summary: HazardMetricSummary
    freshness_summary: FreshnessMetricSummary
    severe_summary: SevereZonesMetricSummary
    predictions_series: dict[str, List[PredictionPoint]]


class PriorityItem(BaseModel):
    rank: int
    zone_id: str
    zone_name: str
    hazard_type: str
    risk_level: str
    exposed_population: int
    facilities_count: int
    vulnerability_score: float
    evidence_strength: str
    score: float
    action_title: str
    reason: str
