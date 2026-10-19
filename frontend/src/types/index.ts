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

export interface SourceFreshness {
  source_name: string;
  publisher: string;
  licence: string;
  last_fetched_at: string;
  expected_every_minutes: number;
  status: 'fresh' | 'delayed' | 'stale' | 'error';
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
