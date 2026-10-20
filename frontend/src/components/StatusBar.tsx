import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, formatPKT, formatRelativeMinutes } from '../api/client';
import { MetaData } from '../types';

interface StatusBarProps {
  meta?: MetaData | null;
  isLoading?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({ meta }) => {
  const { data: statusResponse, isLoading } = useQuery({
    queryKey: ['pipeline-status'],
    queryFn: api.getStatus,
    refetchInterval: 60000,
  });

  const statusData = statusResponse?.data;
  const lastSuccessTime = statusData?.latest_successful_run?.started_at
    ? formatPKT(statusData.latest_successful_run.started_at, { second: undefined })
    : '—';

  const relTime = statusData?.minutes_since_last_success !== undefined && statusData.minutes_since_last_success !== null
    ? `(${formatRelativeMinutes(statusData.minutes_since_last_success)})`
    : '';

  const indicator = statusData?.status_indicator || 'ok';
  const quality = statusData?.quality_summary;

  return (
    <div
      className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1"
      role="status"
      aria-label="Pipeline Telemetry Status"
    >
      {/* Execution Status Chip */}
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container dark:bg-surface-container-high border border-outline-variant/30 text-on-surface shadow-xs shrink-0 text-xs">
        {indicator === 'ok' && (
          <span className="flex h-2 w-2 relative" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#059669] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#059669]" />
          </span>
        )}
        {indicator === 'late' && (
          <span className="w-2 h-2 rounded-full bg-[#B45309] animate-pulse" aria-hidden="true" />
        )}
        {indicator === 'failed' && (
          <span className="w-2 h-2 rounded-full bg-[#B91C1C]" aria-hidden="true" />
        )}

        <span className="font-mono text-[11px] font-medium tracking-tight whitespace-nowrap">
          {isLoading ? (
            'Syncing status...'
          ) : (
            <>
              Last run: <span className="font-semibold">{lastSuccessTime}</span>{' '}
              <span className="text-on-surface-variant hidden sm:inline">{relTime}</span> · Status:{' '}
              {indicator === 'ok' && <span className="text-[#059669] font-bold">OK</span>}
              {indicator === 'late' && <span className="text-[#B45309] font-bold">LATE</span>}
              {indicator === 'failed' && <span className="text-[#B91C1C] font-bold">FAILED</span>}
            </>
          )}
        </span>
      </div>

      {/* Quality Summary Pill from API */}
      {quality && (quality.total_actions > 0 || quality.rules_audited > 0) && (
        <div
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container dark:bg-surface-container-high border border-outline-variant/30 font-mono text-[11px] text-on-surface shrink-0"
          title={`Rules Audited: ${quality.rules_audited} | Actions: ${quality.fix} fixes, ${quality.fill} fills, ${quality.flag} flags`}
        >
          <span className="material-symbols-outlined text-[15px] text-secondary shrink-0" aria-hidden="true">
            verified_user
          </span>
          <span className="text-on-surface-variant hidden sm:inline">Quality:</span>
          {quality.fix > 0 && <span className="font-semibold text-secondary">{quality.fix} fix</span>}
          {quality.fill > 0 && <span className="font-semibold text-secondary">· {quality.fill} fill</span>}
          {quality.flag > 0 && <span className="font-semibold text-amber-500">· {quality.flag} flag</span>}
        </div>
      )}

      {/* Timezone Info from Meta API */}
      <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high/60 dark:bg-surface-container-highest/40 font-mono text-[10px] text-on-surface-variant shrink-0">
        <span className="material-symbols-outlined text-[14px]">schedule</span>
        <span>{meta?.timezone_display || 'PKT (UTC+5)'}</span>
      </div>
    </div>
  );
};
