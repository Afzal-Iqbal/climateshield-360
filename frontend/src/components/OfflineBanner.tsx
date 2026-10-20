import React from 'react';
import { formatPKT } from '../api/client';

interface OfflineBannerProps {
  isOffline: boolean;
  lastGoodDataTime?: string | Date | null;
  onRetry?: () => void;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  isOffline,
  lastGoodDataTime,
  onRetry,
}) => {
  if (!isOffline) return null;

  const timeDisplay = lastGoodDataTime
    ? formatPKT(lastGoodDataTime, { second: undefined })
    : 'previous sync';

  return (
    <div
      role="alert"
      className="w-full bg-gradient-to-r from-amber-950/90 via-amber-900/90 to-amber-950/90 border-b border-amber-500/40 text-amber-200 px-4 py-2 flex items-center justify-between gap-3 text-xs font-mono-val shadow-lg z-50 animate-pulse"
    >
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px] text-amber-400 shrink-0">
          cloud_off
        </span>
        <span>
          <strong className="font-semibold text-amber-100">Offline</strong> — Showing data from{' '}
          <span className="underline decoration-amber-400/50">{timeDisplay}</span>
        </span>
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-100 text-[11px] font-semibold transition-colors cursor-pointer shrink-0"
        >
          Retry Connection
        </button>
      )}
    </div>
  );
};
