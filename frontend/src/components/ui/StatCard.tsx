import React from 'react';
import { Card } from './Card';
import { AnimatedNumber } from '../AnimatedNumber';

interface StatCardProps {
  label: string;
  value: number | string;
  unit?: string;
  decimals?: number;
  prefix?: string;
  uncertaintyRange?: { low: number; high: number; unit?: string } | string;
  baselineValue?: number | string;
  baselineLabel?: string;
  icon?: string;
  accent?: 'cyan' | 'heat' | 'rain' | 'low' | 'moderate' | 'high' | 'severe';
  isKeyCard?: boolean;
  sublabel?: string;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  unit,
  decimals = 0,
  prefix = '',
  uncertaintyRange,
  baselineValue,
  baselineLabel = 'Normal baseline',
  icon,
  accent = 'cyan',
  isKeyCard = false,
  sublabel,
  className = '',
}) => {
  const accentStyles = {
    cyan: {
      iconBg: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
      glow: 'shadow-[0_0_16px_rgba(6,182,212,0.15)]',
      valueColor: 'text-white dark:text-white text-slate-900',
    },
    heat: {
      iconBg: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      glow: 'shadow-[0_0_16px_rgba(245,158,11,0.15)]',
      valueColor: 'text-amber-400',
    },
    rain: {
      iconBg: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
      glow: 'shadow-[0_0_16px_rgba(56,189,248,0.15)]',
      valueColor: 'text-sky-400',
    },
    low: {
      iconBg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      glow: 'shadow-[0_0_16px_rgba(16,185,129,0.15)]',
      valueColor: 'text-emerald-400',
    },
    moderate: {
      iconBg: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      glow: 'shadow-[0_0_16px_rgba(245,158,11,0.15)]',
      valueColor: 'text-amber-400',
    },
    high: {
      iconBg: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
      glow: 'shadow-[0_0_16px_rgba(249,115,22,0.15)]',
      valueColor: 'text-orange-400',
    },
    severe: {
      iconBg: 'bg-red-500/15 text-red-400 border-red-500/30',
      glow: 'shadow-[0_0_20px_rgba(239,68,68,0.25)]',
      valueColor: 'text-red-400',
    },
  }[accent];

  const isNumeric = typeof value === 'number';

  return (
    <Card
      isKeyCard={isKeyCard}
      className={`flex flex-col justify-between ${accentStyles.glow} ${className}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-medium text-slate-400 dark:text-slate-400 text-slate-600 truncate uppercase tracking-wider">
            {label}
          </span>
          {icon && (
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center border shrink-0 ${accentStyles.iconBg}`}
            >
              <span className="material-symbols-outlined text-[17px]">{icon}</span>
            </div>
          )}
        </div>

        <div className="flex items-baseline gap-1.5 my-1">
          {prefix && (
            <span className="text-lg font-semibold text-slate-400 font-mono-val">
              {prefix}
            </span>
          )}
          <span
            className={`text-2xl sm:text-3xl font-bold font-display tabular-nums tracking-tight ${accentStyles.valueColor}`}
          >
            {isNumeric ? (
              <AnimatedNumber value={value as number} decimals={decimals} />
            ) : (
              value
            )}
          </span>
          {unit && (
            <span className="text-xs sm:text-sm font-medium text-slate-400 dark:text-slate-400 text-slate-500 ml-0.5">
              {unit}
            </span>
          )}
        </div>

        {sublabel && (
          <p className="text-[11px] text-slate-400 dark:text-slate-400 text-slate-500 mt-0.5 truncate">
            {sublabel}
          </p>
        )}
      </div>

      {(uncertaintyRange || baselineValue !== undefined) && (
        <div className="mt-3 pt-2.5 border-t border-white/5 dark:border-white/5 border-slate-200/50 flex flex-col gap-1 text-[11px] text-slate-400 font-mono-val">
          {uncertaintyRange && (
            <div className="flex items-center justify-between gap-1">
              <span className="text-slate-500">90% CI:</span>
              <span className="font-semibold text-slate-300 dark:text-slate-300 text-slate-700">
                {typeof uncertaintyRange === 'string'
                  ? uncertaintyRange
                  : `[${uncertaintyRange.low} – ${uncertaintyRange.high}${uncertaintyRange.unit || ''}]`}
              </span>
            </div>
          )}
          {baselineValue !== undefined && (
            <div className="flex items-center justify-between gap-1">
              <span className="text-slate-500">{baselineLabel}:</span>
              <span className="text-slate-400">{baselineValue}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
