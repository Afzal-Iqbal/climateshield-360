import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'cyan' | 'teal' | 'heat' | 'rain' | 'success' | 'warning' | 'danger' | 'outline';
  size?: 'sm' | 'md';
  icon?: string;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  icon,
  className = '',
}) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  const variantClasses = {
    default: 'bg-white/10 dark:bg-white/10 bg-slate-200 text-slate-300 dark:text-slate-300 text-slate-700 border-white/10',
    cyan: 'bg-cyan-500/15 text-cyan-400 dark:text-cyan-400 text-cyan-700 border-cyan-500/30',
    teal: 'bg-teal-500/15 text-teal-400 dark:text-teal-400 text-teal-700 border-teal-500/30',
    heat: 'bg-amber-500/15 text-amber-400 dark:text-amber-400 text-amber-700 border-amber-500/30',
    rain: 'bg-sky-500/15 text-sky-400 dark:text-sky-400 text-sky-700 border-sky-500/30',
    success: 'bg-emerald-500/15 text-emerald-400 dark:text-emerald-400 text-emerald-700 border-emerald-500/30',
    warning: 'bg-amber-500/15 text-amber-400 dark:text-amber-400 text-amber-700 border-amber-500/30',
    danger: 'bg-red-500/15 text-red-400 dark:text-red-400 text-red-700 border-red-500/30',
    outline: 'bg-transparent text-slate-400 dark:text-slate-400 text-slate-600 border-white/15 dark:border-white/15 border-slate-300',
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium font-mono-val border select-none ${sizeClasses} ${variantClasses} ${className}`}
    >
      {icon && (
        <span className="material-symbols-outlined text-[13px] leading-none shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="truncate">{children}</span>
    </span>
  );
};
