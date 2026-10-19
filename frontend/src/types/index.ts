/**
 * TypeScript types matching ClimateShield 360 table contract and API conventions.
 * Defined in AGENT_RULES.md.
 */

export interface APIResponse<T> {
  data: T;
  generated_at: string;
  is_sample: boolean;
}

export interface ErrorResponse {
  error: string;
  detail?: string;
}

export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Severe';
export type HazardType = 'heat' | 'heavy_rain';
export type EvidenceStrength = 'low' | 'medium' | 'high';
export type SLAStatus = 'Fresh' | 'Late' | 'Stale';

export interface HealthData {
  status: string;
  db_connected: boolean;
  duckdb_version: string;
  tables_found: string[];
}

export interface LastRunSummary {
  run_id?: string;
  started_at?: string;
  finished_at?: string;
  status?: 'pending' | 'running' | 'success' | 'failed';
  notes?: string;
}

export interface MetaData {
  app_name: string;
  version: string;
  is_sample: boolean;
  timezone_stored: string;
  timezone_display: string;
  db_path: string;
  last_run?: LastRunSummary | null;
}

export interface RunStatus {
  run_id: string;
  started_at: string;
  finished_at?: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  notes?: string;
}

export interface RunStatusExtended extends RunStatus {
  duration_seconds?: number | null;
  is_latest?: boolean;
}

export interface SourceFreshness {
  source_name: string;
  publisher: string;
  licence: string;
  last_fetched_at: string;
  expected_every_minutes: number;
  status: 'fresh' | 'delayed' | 'stale' | 'error';
}

export interface SourceFreshnessComputed {
  source_name: string;
  publisher: string;
  licence: string;
  last_fetched_at: string;
  expected_every_minutes: number;
  stored_status: string;
  computed_status: SLAStatus;
  minutes_since_fetch: number;
  ratio: number;
  delay_minutes: number;
}

export interface FreshnessSummary {
  total: number;
  fresh: number;
  late: number;
  stale: number;
  availability_pct: number;
}

export interface FreshnessResponseData {
  sources: SourceFreshnessComputed[];
  summary: FreshnessSummary;
}

export interface QualitySummaryCounts {
  fix: number;
  fill: number;
  flag: number;
  total_actions: number;
  rules_audited: number;
}

export interface PipelineStatusData {
  latest_successful_run?: RunStatusExtended | null;
  latest_run?: RunStatusExtended | null;
  is_late: boolean;
  minutes_since_last_success?: number | null;
  status_indicator: 'ok' | 'late' | 'failed';
  quality_summary: QualitySummaryCounts;
}

export interface QualityLog {
  logged_at: string;
  source_name: string;
  rule: string;
  action: 'fix' | 'fill' | 'flag';
  rows_affected: number;
  explanation: string;
}

export interface QualitySummaryResponseData {
  total_checks: number;
  fixed: number;
  filled: number;
  flagged: number;
  total_anomalies: number;
  pass_rate_pct: number;
  sources_audited: number;
}

export interface QualityDecisionsResponseData {
  items: QualityLog[];
  total: number;
  limit: number;
  offset: number;
  sources: string[];
}

export interface DailyQualityCount {
  date: string;
  fix: number;
  fill: number;
  flag: number;
  total: number;
}

export interface Prediction {
  zone_id: string;
  forecast_time: string;
  hazard_type: HazardType;
  probability: number;
  interval_low: number;
  interval_high: number;
  baseline_value: number;
}

export interface ModelEval {
  group_type: string;
  group_value: string;
  metric: string;
  baseline_score: number;
  model_score: number;
}

export interface ModelEvalExtended extends ModelEval {
  error_reduction_pct?: number | null;
  is_weakest: boolean;
}

export interface ModelEvalResponseData {
  evaluations: ModelEvalExtended[];
  weakest_group?: ModelEvalExtended | null;
  overall_baseline_mae?: number | null;
  overall_model_mae?: number | null;
  overall_reduction_pct?: number | null;
}

export interface ExposureIndex {
  zone_id: string;
  hazard_type: HazardType;
  exposed_population: number;
  facilities_count: number;
  vulnerability_score: number;
  risk_level: RiskLevel;
  evidence_strength: EvidenceStrength;
}

export interface Facility {
  facility_id: string;
  type: string;
  name: string;
  zone_id: string;
  lat: number;
  lon: number;
}

export interface ImpactIndicator {
  zone_id: string;
  impact_area: string;
  indicator: string;
  value: number;
  evidence_strength: EvidenceStrength;
  source: string;
  row_ids: string;
}

export interface Zone {
  zone_id: string;
  name: string;
  geometry_geojson: string;
}

// --- Overview & Priorities Interfaces ---

export interface PredictionPoint {
  forecast_time: string;
  hours_ahead: number;
  probability: number;
  interval_low: number;
  interval_high: number;
  baseline_value: number;
  hazard_type: string;
}

export interface HazardMetricSummary {
  hazard_type: string;
  hazard_level: RiskLevel;
  headline_value: number;
  unit: string;
  interval_low: number;
  interval_high: number;
  source: string;
  label: string;
}

export interface FreshnessMetricSummary {
  status: string;
  fresh_sources: number;
  total_sources: number;
  lagging_source?: string | null;
  integrity_pct: number;
}

export interface SevereZonesMetricSummary {
  severe_count: number;
  total_count: number;
  hotspots: string[];
  risk_level: RiskLevel;
}

export interface OverviewData {
  time_range: '24h' | '48h' | '7d';
  heat_hazard_level: RiskLevel;
  rain_hazard_level: RiskLevel;
  severe_zones_count: number;
  total_zones_count: number;
  severe_zone_names: string[];
  data_freshness_status: string;
  heat_summary: HazardMetricSummary;
  rain_summary: HazardMetricSummary;
  freshness_summary: FreshnessMetricSummary;
  severe_summary: SevereZonesMetricSummary;
  predictions_series: Record<string, PredictionPoint[]>;
}

export interface PriorityItem {
  rank: number;
  zone_id: string;
  zone_name: string;
  hazard_type: string;
  risk_level: RiskLevel;
  exposed_population: number;
  facilities_count: number;
  vulnerability_score: number;
  evidence_strength: string;
  score: number;
  action_title: string;
  reason: string;
}

// --- Map & Geospatial Types ---

export interface GeoJSONGeometry {
  type: string;
  coordinates: any;
}

export interface ZoneFeatureProperties {
  zone_id: string;
  name: string;
  hazard_type: string;
  risk_level: RiskLevel;
  probability: number;
  interval_low: number;
  interval_high: number;
  interval: [number, number];
  exposed_population: number;
  facilities_count: number;
  vulnerability_score: number;
  evidence_strength: EvidenceStrength;
  baseline_value: number;
}

export interface ZoneGeoJSONFeature {
  type: 'Feature';
  id: string;
  geometry: GeoJSONGeometry;
  properties: ZoneFeatureProperties;
}

export interface ZoneGeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: ZoneGeoJSONFeature[];
}

export interface FacilityFeatureProperties {
  facility_id: string;
  type: string;
  name: string;
  zone_id: string;
  lat: number;
  lon: number;
}

export interface FacilityGeoJSONFeature {
  type: 'Feature';
  id: string;
  geometry: GeoJSONGeometry;
  properties: FacilityFeatureProperties;
}

export interface FacilityGeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: FacilityGeoJSONFeature[];
}

export interface DemographicBreakdown {
  children_under_5: number;
  elderly_65_plus: number;
  informal_settlements_pct: number;
}

export interface ZoneHazardDetail {
  hazard_type: string;
  probability: number;
  interval_low: number;
  interval_high: number;
  interval: [number, number];
  baseline_value: number;
  heat_probability?: number | null;
  heat_interval?: [number, number] | null;
  rain_probability?: number | null;
  rain_interval?: [number, number] | null;
  wbgt_celsius?: number | null;
  rainfall_6h_mm?: number | null;
  warning_label: string;
}

export interface ZoneExposureDetail {
  exposed_population: number;
  facilities_count: number;
  demographics?: DemographicBreakdown | null;
  critical_facilities: Facility[];
}

export interface ZoneVulnerabilityDetail {
  vulnerability_score: number;
  risk_level: RiskLevel;
  heat_risk_level: string;
  rain_risk_level: string;
  chokepoint_notes?: string | null;
  indicators: ImpactIndicator[];
}

export interface EvidenceSourceItem {
  source: string;
  row_ids: string;
  indicator: string;
  impact_area: string;
  evidence_strength: string;
}

export interface ZoneEvidenceDetail {
  evidence_strength: EvidenceStrength;
  sources_count: number;
  sources: EvidenceSourceItem[];
  model_provenance: string;
  last_calibrated?: string | null;
}

export interface ZoneDetailData {
  zone_id: string;
  name: string;
  geometry?: GeoJSONGeometry | null;
  hazard: ZoneHazardDetail;
  exposure: ZoneExposureDetail;
  vulnerability: ZoneVulnerabilityDetail;
  evidence: ZoneEvidenceDetail;
}

