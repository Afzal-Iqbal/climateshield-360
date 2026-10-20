import { z } from 'zod';

/**
 * Zod Schemas for ClimateShield 360 data contracts.
 * AGENT_RULES.md and Step 4 validation compliance.
 */

export const RiskLevelSchema = z.enum(['Low', 'Moderate', 'High', 'Severe']);
export const HazardTypeSchema = z.enum(['heat', 'heavy_rain']);
export const SLAStatusSchema = z.enum(['Fresh', 'Late', 'Stale']);

// Run Status Schema
export const RunStatusSchema = z.object({
  run_id: z.string().optional(),
  started_at: z.string().optional(),
  finished_at: z.string().optional().nullable(),
  status: z.enum(['pending', 'running', 'success', 'failed']).optional(),
  notes: z.string().optional().nullable(),
  duration_seconds: z.number().optional().nullable(),
  is_latest: z.boolean().optional(),
});

// Meta Schema
export const MetaSchema = z.object({
  app_name: z.string().optional(),
  version: z.string().optional(),
  is_sample: z.boolean().default(true),
  timezone_stored: z.string().optional(),
  timezone_display: z.string().optional(),
  db_path: z.string().optional(),
  last_run: RunStatusSchema.optional().nullable(),
});

// Priority Item Schema
export const PriorityItemSchema = z.object({
  zone_id: z.string(),
  name: z.string(),
  hazard_type: z.string(),
  risk_level: z.string(),
  probability: z.number().min(0).max(1).catch(0),
  interval_low: z.number().min(0).max(1).catch(0),
  interval_high: z.number().min(0).max(1).catch(0),
  baseline_value: z.number().catch(0),
  exposed_population: z.number().catch(0),
  facilities_count: z.number().catch(0),
  evidence_strength: z.string().catch('medium'),
  rank: z.number().optional(),
  risk_score: z.number().optional(),
  display_score: z.number().optional(),
  key_drivers: z.array(z.string()).optional(),
  recommended_actions: z.array(z.string()).optional(),
});

// Forecast Point Schema
export const ForecastPointSchema = z.object({
  forecast_time: z.string(),
  probability: z.number().min(0).max(1).catch(0),
  interval_low: z.number().min(0).max(1).catch(0),
  interval_high: z.number().min(0).max(1).catch(0),
  baseline_value: z.number().catch(0),
  observed_value: z.number().nullable().optional(),
  is_observed: z.boolean().optional(),
});

export const ForecastDataSchema = z.object({
  hazard: z.string(),
  city: z.string().optional(),
  range: z.string().optional(),
  time_points: z.array(ForecastPointSchema).catch([]),
  summary_metrics: z.record(z.string(), z.any()).optional(),
  model_label: z.string().optional(),
});

// Zone Feature Schema for GeoJSON
export const ZoneFeaturePropertiesSchema = z.object({
  zone_id: z.string(),
  name: z.string(),
  risk_level: z.string().catch('Low'),
  hazard_type: z.string().optional(),
  probability: z.number().min(0).max(1).catch(0),
  interval_low: z.number().min(0).max(1).catch(0),
  interval_high: z.number().min(0).max(1).catch(0),
  baseline_value: z.number().catch(0),
  exposed_population: z.number().catch(0),
  facilities_count: z.number().catch(0),
  vulnerability_score: z.number().catch(0),
  evidence_strength: z.string().catch('medium'),
});

export const ZoneFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: z.any(),
  properties: ZoneFeaturePropertiesSchema,
});

export const ZoneGeoJSONSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(ZoneFeatureSchema).catch([]),
});

/**
 * Validation helper function with error logging
 */
export function validateResponse<T>(
  schema: z.ZodType<T>,
  data: unknown,
  contextLabel: string = 'API'
): { success: true; data: T } | { success: false; error: string } {
  try {
    const result = schema.safeParse(data);
    if (!result.success) {
      console.warn(`[DataValidation] Schema mismatch in ${contextLabel}:`, result.error.format());
      return { success: false, error: 'Unexpected data format' };
    }
    return { success: true, data: result.data };
  } catch (err) {
    console.error(`[DataValidation] Fatal error validating ${contextLabel}:`, err);
    return { success: false, error: 'Unexpected data format' };
  }
}

/**
 * Safe numeric helper to guard against null, undefined, NaN, negative
 */
export function safeNumber(val: unknown, fallback: number = 0): number {
  if (typeof val === 'number' && !isNaN(val) && isFinite(val)) {
    return val;
  }
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && isFinite(parsed)) return parsed;
  }
  return fallback;
}

/**
 * Format probability as 0% - 100% with clamping
 */
export function formatProbability(val: unknown, decimals: number = 1): string {
  const num = safeNumber(val, -1);
  if (num < 0 || num > 1) return 'n/a';
  return `${(num * 100).toFixed(decimals)}%`;
}

/**
 * Format percentage as 0% - 100% with clamping
 */
export function formatPercentage(val: unknown, decimals: number = 0): string {
  const num = safeNumber(val, -1);
  if (num < 0) return 'n/a';
  return `${num.toFixed(decimals)}%`;
}
