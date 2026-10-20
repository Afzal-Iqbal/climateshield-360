import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'outline' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: string;
  iconPosition?: 'left' | 'right';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      icon,
      iconPosition = 'left',
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      sm: 'min-h-[36px] px-3 py-1.5 text-xs rounded-lg gap-1.5',
      md: 'min-h-[44px] px-4 py-2 text-sm rounded-xl gap-2',
      lg: 'min-h-[48px] px-5 py-2.5 text-base rounded-xl gap-2.5',
    }[size];

    const variantClasses = {
      primary:
        'bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-semibold shadow-[0_0_18px_rgba(6,182,212,0.25)] border border-cyan-400/30',
      secondary:
        'bg-slate-800/80 hover:bg-slate-700/80 text-white border border-white/10 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 dark:text-white',
      ghost:
        'bg-transparent hover:bg-white/5 text-slate-300 hover:text-white border border-transparent dark:text-slate-300 dark:hover:text-white',
      danger:
        'bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200 border border-red-500/40 shadow-[0_0_14px_rgba(239,68,68,0.2)]',
      outline:
        'bg-transparent hover:bg-white/5 text-slate-300 hover:text-white border border-white/15 dark:border-white/15 border-slate-300',
    }[variant];

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`relative inline-flex items-center justify-center font-medium transition-all duration-150 active:scale-[0.98] select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none ${sizeClasses} ${variantClasses} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className="inline-flex items-center gap-2">
            <svg
              className="animate-spin h-4 w-4 text-current"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Loading...</span>
          </span>
        ) : (
          <>
            {icon && iconPosition === 'left' && (
              <span className="material-symbols-outlined text-[18px] shrink-0 leading-none" aria-hidden="true">
                {icon}
              </span>
            )}
            <span className="truncate">{children}</span>
            {icon && iconPosition === 'right' && (
              <span className="material-symbols-outlined text-[18px] shrink-0 leading-none" aria-hidden="true">
                {icon}
              </span>
            )}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
