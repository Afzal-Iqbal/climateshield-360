import React from 'react';
import { DataAsOf } from '../DataAsOf';

interface PageHeaderProps {
  title: string | React.ReactNode;
  subtitle?: string | React.ReactNode;
  actions?: React.ReactNode;
  lastUpdated?: string | null;
  badge?: React.ReactNode;
  isLive?: boolean;
  freshnessStatus?: 'Fresh' | 'Late' | 'Stale';
  ageMinutes?: number;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actions,
  lastUpdated,
  badge,
  isLive = false,
  freshnessStatus,
  ageMinutes,
  className = '',
}) => {
  return (
    <div
      className={`relative flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10 dark:border-white/10 border-slate-200/60 ${className}`}
    >
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-white dark:text-white text-slate-900 font-display">
            {title}
          </h1>
          {badge}

          {/* Dynamic Live / Late / Stale Status Badge (Requirement 18 & 21) */}
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono-val shadow-[0_0_10px_rgba(16,185,129,0.2)]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          ) : freshnessStatus === 'Late' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono-val">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Late {ageMinutes !== undefined ? `(${Math.round(ageMinutes)}m)` : ''}
            </span>
          ) : freshnessStatus === 'Stale' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 font-mono-val">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              Stale {ageMinutes !== undefined ? `(${Math.round(ageMinutes)}m)` : ''}
            </span>
          ) : null}
        </div>
        {subtitle && (
          <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-400 text-slate-600 font-body max-w-3xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
        {lastUpdated && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/20 dark:bg-black/20 bg-slate-100 text-slate-400 dark:text-slate-400 text-slate-600 text-[11px] border border-white/5 dark:border-white/5 border-slate-200">
            <DataAsOf timestamp={lastUpdated} />
          </div>
        )}
        {actions}
      </div>
    </div>
  );
};
