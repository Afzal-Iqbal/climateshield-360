import React from 'react';

interface SampleBannerProps {
  isSample?: boolean;
}

export const SampleBanner: React.FC<SampleBannerProps> = ({ isSample = true }) => {
  if (!isSample) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-surface-container-high rounded-lg p-space-sm sm:px-space-md flex flex-wrap items-center justify-between gap-space-sm shadow-sm border border-outline-variant/40"
    >
      <div className="flex items-center gap-space-sm min-w-0">
        <span className="material-symbols-outlined text-secondary text-[20px] shrink-0" aria-hidden="true">
          info
        </span>
        <div className="flex flex-wrap items-center gap-x-space-sm gap-y-0.5">
          <span className="font-label-mono-sm text-label-mono-sm font-semibold uppercase text-secondary tracking-wider">
            Operational Simulation Mode:
          </span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            All figures tagged with
          </span>
          <span className="font-label-mono-sm text-label-mono-sm px-1.5 py-0.5 rounded bg-surface-container-lowest text-on-surface-variant uppercase font-bold border border-outline-variant/60">
            [Sample Data]
          </span>
          <span className="hidden md:inline font-body-sm text-body-sm text-on-surface-variant">
            · Synthetic demonstration database for Karachi disaster management.
          </span>
        </div>
      </div>
      <div className="flex items-center gap-space-xs font-label-mono-sm text-label-mono-sm text-on-surface-variant shrink-0">
        <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" aria-hidden="true"></span>
        <span className="font-medium">PDMA SIMULATION READY</span>
      </div>
    </div>
  );
};
