import React from 'react';
import { SampleBanner } from '../components/SampleBanner';
import { EmptyState } from '../components/EmptyState';

interface AboutLimitsProps {
  isSample?: boolean;
}

export const AboutLimits: React.FC<AboutLimitsProps> = ({ isSample = true }) => {
  return (
    <div className="px-space-md lg:px-space-lg py-space-md flex flex-col gap-space-lg max-w-[1720px] mx-auto w-full">
      <SampleBanner isSample={isSample} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-outline-variant/30 pb-space-md">
        <div>
          <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight">
            Methodology, Uncertainty Bounds &amp; Limits
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
            Transparent disclosure of model evaluation (MAE, Brier Score, ROC-AUC), baseline comparisons, and institutional boundaries.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface font-semibold border border-outline-variant/40">
            SCIENTIFIC TRANSPARENCY
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-space-md">
        <EmptyState
          icon="info"
          title="Methodology &amp; Operational Limits Initialized"
          description="Model evaluation contract table (model_eval) and baseline comparative metrics ready in DuckDB warehouse. In the upcoming module, calibration graphs, baseline scores, and uncertainty bounds will be displayed."
        />
      </div>
    </div>
  );
};
