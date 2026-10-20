import React from 'react';
import { useReducedMotion } from 'framer-motion';
import { RiskLevel } from '../../types';

export interface RiskBadgeProps {
  level: RiskLevel | string;
  label?: string;
  value?: string | number;
  size?: 'sm' | 'md' | 'lg';
  showPulsingDot?: boolean;
  className?: string;
}

const RISK_CONFIG: Record<
  string,
  {
    bg: string;
    text: string;
    border: string;
    icon: string;
    defaultLabel: string;
  }
> = {
  Low: {
    bg: 'bg-emerald-500/15 dark:bg-emerald-500/15 bg-emerald-50',
    text: 'text-emerald-400 dark:text-emerald-400 text-emerald-700',
    border: 'border-emerald-500/35 dark:border-emerald-500/35 border-emerald-300',
    icon: 'check_circle',
    defaultLabel: 'Low Risk',
  },
  Moderate: {
    bg: 'bg-amber-500/15 dark:bg-amber-500/15 bg-amber-50',
    text: 'text-amber-400 dark:text-amber-400 text-amber-800',
    border: 'border-amber-500/35 dark:border-amber-500/35 border-amber-300',
    icon: 'warning',
    defaultLabel: 'Moderate Risk',
  },
  High: {
    bg: 'bg-orange-500/15 dark:bg-orange-500/15 bg-orange-50',
    text: 'text-orange-400 dark:text-orange-400 text-orange-800',
    border: 'border-orange-500/40 dark:border-orange-500/40 border-orange-300',
    icon: 'warning',
    defaultLabel: 'High Risk',
  },
  Severe: {
    bg: 'bg-red-500/15 dark:bg-red-500/15 bg-red-50',
    text: 'text-red-400 dark:text-red-400 text-red-800',
    border: 'border-red-500/45 dark:border-red-500/45 border-red-300',
    icon: 'crisis_alert',
    defaultLabel: 'Severe Risk',
  },
};

export const RiskBadge: React.FC<RiskBadgeProps> = ({
  level,
  label,
  value,
  size = 'md',
  showPulsingDot = true,
  className = '',
}) => {
  const shouldReduceMotion = useReducedMotion();
  const config = RISK_CONFIG[level] || RISK_CONFIG.Low;
  const displayLabel = label || config.defaultLabel;
  const isSevere = level === 'Severe';

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[11px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  }[size];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold font-mono-val border select-none transition-colors ${config.bg} ${config.text} ${config.border} ${sizeClasses} ${className}`}
      role="status"
      aria-label={`Risk Level: ${level}`}
    >
      {/* Animated pulsing red dot for Severe risk only */}
      {isSevere && showPulsingDot && !shouldReduceMotion && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
      )}

      <span
        className="material-symbols-outlined text-[14px] leading-none shrink-0"
        aria-hidden="true"
      >
        {config.icon}
      </span>
      <span className="truncate">{displayLabel}</span>
      {value !== undefined && (
        <span className="font-bold border-l pl-1.5 border-current opacity-90 tabular-nums">
          {value}
        </span>
      )}
    </span>
  );
};
