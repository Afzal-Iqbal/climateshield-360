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
