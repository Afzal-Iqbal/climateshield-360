/**
 * Typed API Client for ClimateShield 360 Karachi.
 * Adheres to AGENT_RULES.md:
 * - Base URL from environment or Vite proxy fallback
 * - Envelope unwrapping {data, generated_at, is_sample}
 * - Error structure handling {error, detail}
 * - UTC to PKT timestamp formatting helper (Rule 3)
 */

import {
  APIResponse,
  DailyQualityCount,
  ErrorResponse,
  FreshnessResponseData,
  HealthData,
  MetaData,
  ModelEvalResponseData,
  PipelineStatusData,
  QualityDecisionsResponseData,
  QualitySummaryResponseData,
  RunStatusExtended,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  detail?: string;
  status: number;

  constructor(status: number, error: string, detail?: string) {
    super(error);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<APIResponse<T>> {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const fullUrl = cleanEndpoint.startsWith('/api')
    ? cleanEndpoint
    : `${BASE_URL}${cleanEndpoint}`;

  const response = await fetch(fullUrl, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorMsg = `HTTP Error ${response.status}`;
    let detailMsg: string | undefined;

    try {
      const errBody = (await response.json()) as ErrorResponse;
      if (errBody.error) errorMsg = errBody.error;
      if (errBody.detail) detailMsg = errBody.detail;
    } catch {
      detailMsg = response.statusText;
    }

    throw new ApiError(response.status, errorMsg, detailMsg);
  }

  const payload = (await response.json()) as APIResponse<T>;
  return payload;
}

// Typed API convenience methods
export const api = {
  getHealth: () => apiFetch<HealthData>('/health'),
  getMeta: () => apiFetch<MetaData>('/meta'),
  getStatus: () => apiFetch<PipelineStatusData>('/status'),
  getFreshness: () => apiFetch<FreshnessResponseData>('/freshness'),
  getRuns: (hours: number = 24) =>
    apiFetch<RunStatusExtended[]>(`/runs?hours=${hours}`),
  getModelEval: () => apiFetch<ModelEvalResponseData>('/model-eval'),
  getQualitySummary: () =>
    apiFetch<QualitySummaryResponseData>('/quality/summary'),
  getQualityDecisions: (params: {
    source?: string;
    action?: string;
    limit?: number;
    offset?: number;
  } = {}) => {
    const q = new URLSearchParams();
    if (params.source) q.set('source', params.source);
    if (params.action && params.action !== 'all') q.set('action', params.action);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    if (params.offset !== undefined) q.set('offset', String(params.offset));
    const qs = q.toString();
    return apiFetch<QualityDecisionsResponseData>(`/quality/decisions${qs ? `?${qs}` : ''}`);
  },
  getQualityDaily: () =>
    apiFetch<DailyQualityCount[]>('/quality/daily'),
};

/**
 * Rule 3: Store time in UTC; display in PKT (UTC+5).
 * Formats a UTC ISO string into a human-readable PKT time.
 */
export function formatPKT(
  utcDateStr?: string | null,
  options: Intl.DateTimeFormatOptions = {}
): string {
  if (!utcDateStr) return '—';
  try {
    const date = new Date(utcDateStr);
    return (
      new Intl.DateTimeFormat('en-PK', {
        timeZone: 'Asia/Karachi',
        hour: '2-digit',
        minute: '2-digit',
        second: options.second,
        day: '2-digit',
        month: 'short',
        year: options.year,
        hour12: false,
        ...options,
      }).format(date) + ' PKT'
    );
  } catch {
    return utcDateStr;
  }
}

/**
 * Format relative minutes (e.g. "18m ago" or "2h ago").
 */
export function formatRelativeMinutes(minutes?: number | null): string {
  if (minutes === undefined || minutes === null) return '—';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = Math.round(minutes % 60);
  if (hours < 24) {
    return remainingMins > 0 ? `${hours}h ${remainingMins}m ago` : `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
