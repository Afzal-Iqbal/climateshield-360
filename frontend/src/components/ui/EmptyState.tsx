import React from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  title?: string;
  reason?: string;
  pipelineSource?: string;
  icon?: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No Data Available',
  reason = 'No records found for the selected filters or timeframe.',
  pipelineSource = 'The automated hourly pipeline writes these observations and predictions to DuckDB.',
  icon = 'inbox',
  actionText,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-6 sm:p-8 text-center rounded-2xl bg-slate-900/40 dark:bg-slate-900/40 bg-slate-100/70 border border-white/10 dark:border-white/10 border-slate-200 backdrop-blur-md ${className}`}
      role="region"
      aria-label={title}
    >
      <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-3 text-cyan-400">
        <span className="material-symbols-outlined text-[26px]" aria-hidden="true">
          {icon}
        </span>
      </div>
      <h4 className="text-sm sm:text-base font-semibold text-white dark:text-white text-slate-900 font-display mb-1.5">
        {title}
      </h4>
      <p className="text-xs text-slate-400 dark:text-slate-400 text-slate-600 max-w-md mb-2 font-body">
        {reason}
      </p>
      {pipelineSource && (
        <p className="text-[11px] text-slate-500 dark:text-slate-500 text-slate-400 max-w-sm italic mb-4 font-mono-val">
          ℹ {pipelineSource}
        </p>
      )}
      {actionText && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction} icon="refresh">
          {actionText}
        </Button>
      )}
    </div>
  );
};
