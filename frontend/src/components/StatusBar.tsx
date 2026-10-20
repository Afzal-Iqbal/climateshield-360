import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, formatPKT, formatRelativeMinutes } from '../api/client';
import { MetaData } from '../types';
import { Tooltip } from './ui/Tooltip';

interface StatusBarProps {
  meta?: MetaData | null;
  isLoading?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({ meta: initialMeta }) => {
  // Query metadata every 60 seconds (Stage 4 Requirement 16 & 18)
  const { data: metaResponse } = useQuery({
    queryKey: ['meta'],
    queryFn: api.getMeta,
    refetchInterval: 60000,
  });

  const { data: statusResponse } = useQuery({
    queryKey: ['pipeline-status'],
    queryFn: api.getStatus,
    refetchInterval: 60000,
  });

  const meta = metaResponse?.data || initialMeta;
  const statusData = statusResponse?.data;
  const quality = statusData?.quality_summary;

  const isLive = meta?.is_live ?? false;
  const sources = meta?.sources || [];

  // Determine overall freshness state from sources
  let hasStale = false;
  let hasLate = false;
  let maxAgeMinutes = 0;

  for (const s of sources) {
    if (s.age_minutes > maxAgeMinutes) {
      maxAgeMinutes = s.age_minutes;
    }
    if (s.status === 'Stale') {
      hasStale = true;
    } else if (s.status === 'Late') {
      hasLate = true;
    }
  }

  const freshnessPillStatus: 'Live' | 'Late' | 'Stale' = isLive
    ? 'Live'
    : hasStale
    ? 'Stale'
    : hasLate
    ? 'Late'
    : 'Late';

  const ageLabel = maxAgeMinutes > 0 ? formatRelativeMinutes(maxAgeMinutes) : '';

  // Tooltip content: list each source with its individual age and status
  const tooltipContent = (
    <div className="flex flex-col gap-1.5 p-1 min-w-[220px]">
      <div className="font-semibold text-xs border-b border-white/10 pb-1 text-slate-200">
        Telemetry Freshness by Source
      </div>
      {sources.length > 0 ? (
        sources.map((s) => {
          const statusColor =
            s.status === 'Fresh'
              ? 'text-emerald-400'
              : s.status === 'Late'
              ? 'text-amber-400'
              : 'text-rose-400';
          return (
            <div key={s.source_name} className="flex items-center justify-between gap-3 text-[11px] font-mono-val">
              <span className="text-slate-300 truncate max-w-[140px]" title={s.source_name}>
                {s.source_name.replace(/_/g, ' ')}
              </span>
              <span className={`${statusColor} font-medium shrink-0`}>
                {formatRelativeMinutes(s.age_minutes)} · {s.status}
              </span>
            </div>
          );
        })
      ) : (
        <span className="text-[11px] text-slate-400">No active sources tracked</span>
      )}
      <div className="text-[10px] text-slate-400 pt-1 border-t border-white/10">
        "Live" is shown only when all critical sources are Fresh (≤1x SLA).
      </div>
    </div>
  );

  return (
    <div
      className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1"
      role="status"
      aria-label="Pipeline Live Freshness Status"
    >
      {/* Dynamic Status Pill (Live / Late / Stale) - Requirement 18 */}
      <Tooltip content={tooltipContent} position="bottom">
        <div
          className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-mono-val font-semibold shadow-xs shrink-0 cursor-help transition-all ${
            freshnessPillStatus === 'Live'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
              : freshnessPillStatus === 'Late'
              ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          {freshnessPillStatus === 'Live' ? (
            <span className="flex h-2 w-2 relative" aria-hidden="true">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          ) : freshnessPillStatus === 'Late' ? (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-rose-500" aria-hidden="true" />
          )}

          <span>
            {freshnessPillStatus === 'Live'
              ? 'Live'
              : `${freshnessPillStatus} ${ageLabel ? `(${ageLabel})` : ''}`}
          </span>
        </div>
      </Tooltip>

      {/* Last Run Info */}
      {meta?.last_run && (
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 border border-white/10 text-slate-300 text-[11px] font-mono-val shrink-0">
          <span className="text-slate-400">Last run:</span>
          <span className="font-semibold text-slate-200">
            {meta.last_run_at
              ? formatPKT(meta.last_run_at, { second: undefined })
              : '—'}
          </span>
          <span className="text-slate-500">·</span>
          <span
            className={
              meta.last_run_status === 'success'
                ? 'text-emerald-400 font-bold'
                : meta.last_run_status === 'partial'
                ? 'text-amber-400 font-bold'
                : 'text-rose-400 font-bold'
            }
          >
            {(meta.last_run_status || 'ok').toUpperCase()}
          </span>
        </div>
      )}

      {/* Quality Summary Pill */}
      {quality && (quality.total_actions > 0 || quality.rules_audited > 0) && (
        <div
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 border border-white/10 font-mono-val text-[11px] text-slate-300 shrink-0"
          title={`Rules Audited: ${quality.rules_audited} | Actions: ${quality.fix} fixes, ${quality.fill} fills, ${quality.flag} flags`}
        >
          <span className="material-symbols-outlined text-[15px] text-cyan-400 shrink-0" aria-hidden="true">
            verified_user
          </span>
          <span className="text-slate-400 hidden sm:inline">Quality:</span>
          {quality.fix > 0 && <span className="font-semibold text-cyan-300">{quality.fix} fix</span>}
          {quality.fill > 0 && <span className="font-semibold text-cyan-300">· {quality.fill} fill</span>}
          {quality.flag > 0 && <span className="font-semibold text-amber-400">· {quality.flag} flag</span>}
        </div>
      )}

      {/* Timezone Info */}
      <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900/60 border border-white/5 font-mono-val text-[10px] text-slate-400 shrink-0">
        <span className="material-symbols-outlined text-[14px] text-cyan-400">schedule</span>
        <span>{meta?.timezone_display || 'PKT (UTC+5)'}</span>
      </div>
    </div>
  );
};
