import React from 'react';

export interface SelectOption {
  value: string;
  label: string;
  icon?: string;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  icon?: string;
  className?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  options,
  value,
  onChange,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  return (
    <div className={`flex flex-col gap-1 min-w-[140px] ${className}`}>
      {label && (
        <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {icon && (
          <span
            className="material-symbols-outlined text-[18px] text-slate-400 absolute left-3 pointer-events-none"
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full min-h-[42px] appearance-none rounded-xl bg-slate-900/80 dark:bg-slate-900/80 bg-white border border-white/10 dark:border-white/10 border-slate-300 text-slate-200 dark:text-slate-200 text-slate-900 text-xs sm:text-sm font-medium transition-colors focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            icon ? 'pl-9.5 pr-8' : 'pl-3.5 pr-8'
          } py-2`}
          {...props}
        >
          {options.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              className="bg-slate-900 text-slate-200 dark:bg-slate-900 dark:text-slate-200 py-1"
            >
              {opt.label}
            </option>
          ))}
        </select>
        <span
          className="material-symbols-outlined text-[18px] text-slate-400 absolute right-2.5 pointer-events-none"
          aria-hidden="true"
        >
          expand_more
        </span>
      </div>
    </div>
  );
};
