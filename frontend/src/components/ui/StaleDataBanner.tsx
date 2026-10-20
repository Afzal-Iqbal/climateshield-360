import React from 'react';
import { formatPKT } from '../../api/client';

interface StaleDataBannerProps {
  lastUpdated?: string | null;
  expectedMinutes?: number;
  status?: 'Late' | 'Stale' | string;
  onRefresh?: () => void;
  className?: string;
}

export const StaleDataBanner: React.FC<StaleDataBannerProps> = ({
  lastUpdated,
  expectedMinutes = 60,
  status = 'Late',
  onRefresh,
  className = '',
}) => {
  return (
    <div
      className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-amber-500/10 dark:bg-amber-500/10 bg-amber-50 border border-amber-500/30 text-amber-300 dark:text-amber-300 text-amber-800 text-xs ${className}`}
      role="alert"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="material-symbols-outlined text-amber-400 text-[18px] shrink-0">
          schedule
        </span>
        <div className="truncate">
          <span className="font-semibold uppercase tracking-wider text-[11px] mr-1.5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200">
            {status}
          </span>
          <span>
            Telemetry exceeds expected {expectedMinutes}m refresh interval. Last updated:{' '}
            <strong className="font-mono-val">{formatPKT(lastUpdated)}</strong>.
          </span>
        </div>
      </div>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          className="shrink-0 font-medium underline hover:text-white transition-colors cursor-pointer text-xs"
        >
          Check now
        </button>
      )}
    </div>
  );
};
