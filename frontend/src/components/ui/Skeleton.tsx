import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`skeleton-shimmer rounded-lg ${className}`}
    aria-hidden="true"
  />
);

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`p-5 rounded-2xl bg-slate-900/60 dark:bg-slate-900/60 bg-white border border-white/10 dark:border-white/10 border-slate-200 flex flex-col gap-3.5 shadow-md ${className}`}
    aria-hidden="true"
  >
    <div className="flex items-center justify-between">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
    <Skeleton className="h-8 w-32" />
    <Skeleton className="h-3 w-48" />
  </div>
);

export const SkeletonRow: React.FC<{ count?: number; className?: string }> = ({
  count = 4,
  className = '',
}) => (
  <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);

export const SkeletonChart: React.FC<{ className?: string; height?: string }> = ({
  className = '',
  height = 'h-64',
}) => (
  <div
    className={`p-5 rounded-2xl bg-slate-900/60 dark:bg-slate-900/60 bg-white border border-white/10 dark:border-white/10 border-slate-200 flex flex-col gap-4 ${className}`}
    aria-hidden="true"
  >
    <div className="flex items-center justify-between">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-24" />
    </div>
    <div className={`w-full ${height} flex items-end gap-3 pt-6`}>
      <Skeleton className="h-[40%] flex-1" />
      <Skeleton className="h-[65%] flex-1" />
      <Skeleton className="h-[85%] flex-1" />
      <Skeleton className="h-[55%] flex-1" />
      <Skeleton className="h-[75%] flex-1" />
      <Skeleton className="h-[30%] flex-1" />
    </div>
  </div>
);
