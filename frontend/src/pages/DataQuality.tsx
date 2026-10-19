import React from 'react';
import { SampleBanner } from '../components/SampleBanner';
import { EmptyState } from '../components/EmptyState';

interface DataQualityProps {
  isSample?: boolean;
}

export const DataQuality: React.FC<DataQualityProps> = ({ isSample = true }) => {
  return (
    <div className="px-space-md lg:px-space-lg py-space-md flex flex-col gap-space-lg max-w-[1720px] mx-auto w-full">
      <SampleBanner isSample={isSample} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-outline-variant/30 pb-space-md">
        <div>
          <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight">
            Data Quality &amp; Anomaly Audit Log
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
            Transparent tracking of input data cleansing, sensor clamp limits, and missing telemetry imputations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface font-semibold border border-outline-variant/40">
            AUDIT TRAIL STRICT
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-space-md">
        <EmptyState
          icon="verified_user"
          title="Data Quality Audit Module Initialized"
          description="Quality log contract tables verified in DuckDB. In subsequent module, real-time audit rows (fix, fill, flag actions) will be displayed with rule explanations and affected row counts via /api/quality."
        />
      </div>
    </div>
  );
};
