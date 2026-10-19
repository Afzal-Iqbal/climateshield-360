import React from 'react';
import { RiskLevel } from '../types';

interface RiskBadgeProps {
  level: RiskLevel;
  label?: string;
  value?: string | number;
  className?: string;
}

const RISK_CONFIG: Record<
  RiskLevel,
  {
    bg: string;
    text: string;
    border: string;
    icon: string;
    defaultLabel: string;
  }
> = {
  Low: {
    bg: 'bg-[#ECFDF5]',
    text: 'text-[#059669]',
    border: 'border-[#A7F3D0]',
    icon: 'check_circle',
    defaultLabel: 'Low (Green)',
  },
  Moderate: {
    bg: 'bg-[#FEF3C7]',
    text: 'text-[#B45309]',
    border: 'border-[#FDE68A]',
    icon: 'warning',
    defaultLabel: 'Moderate (Yellow)',
  },
  High: {
    bg: 'bg-[#FFEDD5]',
    text: 'text-[#C2410C]',
    border: 'border-[#FED7AA]',
    icon: 'warning',
    defaultLabel: 'High (Orange)',
  },
  Severe: {
    bg: 'bg-[#FEE2E2]',
    text: 'text-[#B91C1C]',
    border: 'border-[#FECACA]',
    icon: 'crisis_alert',
    defaultLabel: 'Severe (Red)',
  },
};

export const RiskBadge: React.FC<RiskBadgeProps> = ({
  level,
  label,
  value,
  className = '',
}) => {
  const config = RISK_CONFIG[level] || RISK_CONFIG.Low;
  const displayLabel = label || config.defaultLabel;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono border ${config.bg} ${config.text} ${config.border} shadow-sm ${className}`}
      role="status"
      aria-label={`Risk Level: ${level}`}
    >
      <span
        className="material-symbols-outlined text-[14px] leading-none shrink-0"
        aria-hidden="true"
      >
        {config.icon}
      </span>
      <span>{displayLabel}</span>
      {value !== undefined && (
        <span className="font-bold border-l pl-1 border-current opacity-90 tabular-nums">
          {value}
        </span>
      )}
    </span>
  );
};
