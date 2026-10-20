import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  isKeyCard?: boolean;
  hoverLift?: boolean;
  padded?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  isKeyCard = false,
  hoverLift = true,
  padded = true,
  ...props
}) => {
  const cardStyle = isKeyCard ? 'command-card-key' : 'command-card';
  const hoverStyle = hoverLift ? 'command-card-hover' : '';
  const paddingStyle = padded ? 'p-4 sm:p-5' : '';

  return (
    <div
      className={`relative overflow-hidden transition-all duration-200 ${cardStyle} ${hoverStyle} ${paddingStyle} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}> = ({ children, className = '', action }) => (
  <div
    className={`flex items-start justify-between gap-3 mb-3.5 pb-2.5 border-b border-white/5 dark:border-white/5 border-slate-200/50 ${className}`}
  >
    <div className="flex flex-col gap-0.5 min-w-0">{children}</div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export const CardTitle: React.FC<{
  children: React.ReactNode;
  className?: string;
  icon?: string;
}> = ({ children, className = '', icon }) => (
  <h3
    className={`flex items-center gap-2 text-sm sm:text-base font-semibold text-white dark:text-white text-slate-900 font-display tracking-tight ${className}`}
  >
    {icon && (
      <span className="material-symbols-outlined text-[18px] text-cyan-400 dark:text-cyan-400 text-cyan-600 shrink-0">
        {icon}
      </span>
    )}
    <span className="truncate">{children}</span>
  </h3>
);

export const CardDescription: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <p className={`text-xs text-slate-400 dark:text-slate-400 text-slate-600 font-body leading-relaxed ${className}`}>
    {children}
  </p>
);

export const CardContent: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div className={`relative ${className}`}>{children}</div>
);

export const CardFooter: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div
    className={`mt-4 pt-3 border-t border-white/5 dark:border-white/5 border-slate-200/50 flex items-center justify-between gap-3 text-xs text-slate-400 dark:text-slate-400 text-slate-600 ${className}`}
  >
    {children}
  </div>
);
