import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, formatPKT, formatRelativeMinutes } from '../api/client';

import { MetaData } from '../types';

interface StatusBarProps {
  meta?: MetaData | null;
  isLoading?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = () => {
  // TanStack Query with 60s refetch interval per requirement
  const { data: statusResponse, isLoading } = useQuery({
    queryKey: ['pipeline-status'],
    queryFn: api.getStatus,
    refetchInterval: 60000,
  });

  const statusData = statusResponse?.data;
  const isSample = statusResponse?.is_sample ?? true;

  const lastSuccessTime = statusData?.latest_successful_run?.started_at
    ? formatPKT(statusData.latest_successful_run.started_at, { second: undefined })
    : '—';

  const relTime = statusData?.minutes_since_last_success !== undefined && statusData.minutes_since_last_success !== null
    ? `(${formatRelativeMinutes(statusData.minutes_since_last_success)})`
    : '';

  const indicator = statusData?.status_indicator || 'ok';
  const quality = statusData?.quality_summary;

  return (
    <div className="flex items-center gap-space-sm sm:gap-space-md" role="status" aria-label="Pipeline Status">
      {/* Sample Marker in Status Bar (Rule 2) */}
      {isSample && (
        <span
          className="font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-surface-container-highest text-secondary border border-secondary/30"
          title="Warehouse data originates from synthetic demo seed script"
        >
          [Sample Data]
        </span>
      )}

      {/* Main Execution Status Chip (OK / Late / Failed) */}
      <div className="flex items-center gap-space-xs px-2.5 sm:px-3 py-1 rounded-full bg-surface-container-low border border-outline-variant/30 text-on-surface shadow-xs">
        {indicator === 'ok' && (
          <span className="flex h-2 w-2 relative" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#059669] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#059669]"></span>
          </span>
        )}
        {indicator === 'late' && (
          <span className="w-2 h-2 rounded-full bg-[#B45309] animate-pulse" aria-hidden="true"></span>
        )}
        {indicator === 'failed' && (
          <span className="w-2 h-2 rounded-full bg-[#B91C1C]" aria-hidden="true"></span>
        )}

        <span className="font-mono text-[11px] font-medium tracking-tight">
          {isLoading ? (
            'Syncing status...'
          ) : (
            <>
              Last run: <span className="font-semibold">{lastSuccessTime}</span>{' '}
              <span className="text-on-surface-variant hidden sm:inline">{relTime}</span> · Status:{' '}
              {indicator === 'ok' && (
                <span className="text-[#059669] font-bold uppercase">OK</span>
              )}
              {indicator === 'late' && (
                <span className="text-[#B45309] font-bold uppercase">LATE</span>
              )}
              {indicator === 'failed' && (
                <span className="text-[#B91C1C] font-bold uppercase">FAILED</span>
              )}
            </>
          )}
        </span>
      </div>

      {/* Quality Summary Pill from Newest quality_log Batch */}
      {quality && (quality.total_actions > 0 || quality.rules_audited > 0) && (
        <div
          className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container border border-outline-variant/30 font-mono text-[11px] text-on-surface"
          title={`Quality Rules Audited: ${quality.rules_audited} | Actions: ${quality.fix} fixes, ${quality.fill} fills, ${quality.flag} flags`}
        >
          <span className="material-symbols-outlined text-[15px] text-secondary">verified_user</span>
          <span className="text-on-surface-variant">Quality:</span>
          {quality.fix > 0 && <span className="font-semibold text-secondary">{quality.fix} fix</span>}
          {quality.fill > 0 && <span className="font-semibold text-secondary">· {quality.fill} fill</span>}
          {quality.flag > 0 && <span className="font-semibold text-tertiary-fixed-dim">· {quality.flag} flag</span>}
        </div>
      )}

      {/* Atmospheric Telemetry Banner */}
      <div className="hidden 2xl:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-secondary-fixed text-on-secondary-fixed border border-secondary/20">
        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
          thermostat
        </span>
        <span className="font-mono text-[11px] font-medium">
          Karachi Port: <span className="font-semibold tabular-nums">36.4°C</span> · RH:{' '}
          <span className="tabular-nums">71%</span> · Wind:{' '}
          <span className="tabular-nums">18 kt SW</span>
        </span>
      </div>
    </div>
  );
};
