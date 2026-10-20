import React from 'react';
import { formatPKT } from '../../api/client';

interface PageHeaderProps {
  title: string | React.ReactNode;
  subtitle?: string | React.ReactNode;
  actions?: React.ReactNode;
  lastUpdated?: string | null;
  badge?: React.ReactNode;
  isLive?: boolean;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actions,
  lastUpdated,
  badge,
  isLive = false,
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
          {isLive && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Pipeline
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-400 text-slate-600 font-body max-w-3xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
        {lastUpdated && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/20 dark:bg-black/20 bg-slate-100 text-slate-400 dark:text-slate-400 text-slate-600 text-[11px] border border-white/5 dark:border-white/5 border-slate-200 font-mono-val">
            <span className="material-symbols-outlined text-[14px]">update</span>
            <span>As of: {formatPKT(lastUpdated)}</span>
          </div>
        )}
        {actions}
      </div>
    </div>
  );
};
