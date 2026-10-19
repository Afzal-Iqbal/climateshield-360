import React from 'react';
import { SampleBanner } from '../components/SampleBanner';
import { EmptyState } from '../components/EmptyState';

interface PipelineFreshnessProps {
  isSample?: boolean;
}

export const PipelineFreshness: React.FC<PipelineFreshnessProps> = ({ isSample = true }) => {
  return (
    <div className="px-space-md lg:px-space-lg py-space-md flex flex-col gap-space-lg max-w-[1720px] mx-auto w-full">
      <SampleBanner isSample={isSample} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-outline-variant/30 pb-space-md">
        <div>
          <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight">
            Pipeline &amp; Source Freshness
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
            Observability metrics, sync cadences, and license provenance across PMD, GFS, ECMWF, and KMC feeds.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] px-2.5 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-bold">
            6 DATA SOURCES TRACKED
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-space-md">
        <EmptyState
          icon="history_toggle_off"
          title="Pipeline Freshness Module Initialized"
          description="Source freshness schemas and cadence monitoring ready in DuckDB warehouse. Next module will connect live heartbeat indicators, expected fetch intervals, and status badges via /api/freshness."
        />
      </div>
    </div>
  );
};
