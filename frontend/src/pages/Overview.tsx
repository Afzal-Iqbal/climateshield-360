import React from 'react';
import { SampleBanner } from '../components/SampleBanner';
import { EmptyState } from '../components/EmptyState';
import { RiskBadge } from '../components/RiskBadge';

interface OverviewProps {
  isSample?: boolean;
}

export const Overview: React.FC<OverviewProps> = ({ isSample = true }) => {
  return (
    <div className="px-space-md lg:px-space-lg py-space-md flex flex-col gap-space-lg max-w-[1720px] mx-auto w-full">
      {/* Sample Data Banner (Rule 2) */}
      <SampleBanner isSample={isSample} />

      {/* Header and Quick Hazard Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-outline-variant/30 pb-space-md">
        <div>
          <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight">
            Executive Overview &amp; Rapid Telemetry
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
            Real-time multi-hazard assessment and compound risk posture across Karachi Metropolitan Area.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RiskBadge level="Severe" label="Malir & Korangi: Severe Risk" />
          <RiskBadge level="High" label="Central & East: High Alert" />
          <RiskBadge level="Low" label="Keamari: Low" />
        </div>
      </div>

      {/* Main Content Area - EmptyState for Skeleton */}
      <div className="grid grid-cols-1 gap-space-md">
        <EmptyState
          icon="dashboard"
          title="Overview Telemetry Module Initialized"
          description="Backend database connection verified. The full-stack skeleton is ready for module integration. Next module will hydrate 24h heat index curves, rainfall ensemble bands, and automated priority directives from DuckDB."
          actionText="Refresh Telemetry Status"
          onAction={() => window.location.reload()}
        />
      </div>
    </div>
  );
};
