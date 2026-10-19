import React from 'react';
import { formatPKT } from '../api/client';
import { MetaData } from '../types';

interface StatusBarProps {
  meta?: MetaData | null;
  isLoading?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({ meta, isLoading = false }) => {
  const lastRunTime = meta?.last_run?.started_at
    ? formatPKT(meta.last_run.started_at)
    : '14:02 PKT (18m ago)';

  const runStatus = meta?.last_run?.status || 'OK';

  return (
    <div className="flex items-center gap-space-md">
      {/* Pipeline Status Indicator */}
      <div className="flex items-center gap-space-xs px-3 py-1 rounded-full bg-surface-container-low border border-outline-variant/30 text-on-surface">
        <span className="flex h-2 w-2 relative" aria-hidden="true">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary"></span>
        </span>
        <span className="font-mono text-[11px] font-medium tracking-tight">
          {isLoading ? (
            'Syncing warehouse...'
          ) : (
            <>
              Last run: <span className="font-semibold">{lastRunTime}</span> · Status:{' '}
              <span className="text-secondary font-semibold uppercase">{runStatus}</span>
            </>
          )}
        </span>
      </div>

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
