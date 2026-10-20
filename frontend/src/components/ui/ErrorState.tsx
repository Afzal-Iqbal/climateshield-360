import React from 'react';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  error?: string | Error;
  detail?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Data Pipeline Interruption',
  error,
  detail,
  onRetry,
  className = '',
}) => {
  const errorMessage =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Failed to retrieve telemetry data.';

  return (
    <div
      className={`flex flex-col items-center justify-center p-6 sm:p-8 text-center rounded-2xl bg-red-500/10 dark:bg-red-500/10 bg-red-50 border border-red-500/30 backdrop-blur-md ${className}`}
      role="alert"
    >
      <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center mb-3 text-red-400">
        <span className="material-symbols-outlined text-[26px]" aria-hidden="true">
          warning
        </span>
      </div>
      <h4 className="text-sm sm:text-base font-semibold text-red-400 dark:text-red-400 text-red-700 font-display mb-1.5">
        {title}
      </h4>
      <p className="text-xs text-slate-300 dark:text-slate-300 text-slate-700 max-w-md mb-1 font-body">
        {errorMessage}
      </p>
      {detail && (
        <p className="text-[11px] text-slate-400 dark:text-slate-400 text-slate-500 font-mono-val max-w-sm mb-4">
          {detail}
        </p>
      )}
      {onRetry && (
        <div className="mt-2">
          <Button variant="danger" size="sm" onClick={onRetry} icon="refresh">
            Retry Connection
          </Button>
        </div>
      )}
    </div>
  );
};
