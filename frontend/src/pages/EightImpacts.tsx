import React from 'react';
import { SampleBanner } from '../components/SampleBanner';
import { EmptyState } from '../components/EmptyState';
import { RiskBadge } from '../components/RiskBadge';

interface EightImpactsProps {
  isSample?: boolean;
}

export const EightImpacts: React.FC<EightImpactsProps> = ({ isSample = true }) => {
  return (
    <div className="px-space-md lg:px-space-lg py-space-md flex flex-col gap-space-lg max-w-[1720px] mx-auto w-full">
      <SampleBanner isSample={isSample} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-outline-variant/30 pb-space-md">
        <div>
          <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight">
            Eight Core Municipal Impact Sectors
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
            Health, Drainage, Power, Water, Transport, Ports, Vulnerable Settlements, and Civic Infrastructure.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RiskBadge level="High" label="8 Sectors Monitored" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-space-md">
        <EmptyState
          icon="grid_view"
          title="Eight Impacts Matrix Module Initialized"
          description="Sector indicator schemas and evidence-level tags configured in DuckDB contract. Ready for integration with /api/impacts."
        />
      </div>
    </div>
  );
};
