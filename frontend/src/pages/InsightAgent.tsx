import React from 'react';
import { SampleBanner } from '../components/SampleBanner';
import { EmptyState } from '../components/EmptyState';

interface InsightAgentProps {
  isSample?: boolean;
}

export const InsightAgent: React.FC<InsightAgentProps> = ({ isSample = true }) => {
  return (
    <div className="px-space-md lg:px-space-lg py-space-md flex flex-col gap-space-lg max-w-[1720px] mx-auto w-full">
      <SampleBanner isSample={isSample} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-outline-variant/30 pb-space-md">
        <div>
          <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight">
            AI Decision Support &amp; Insight Agent
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
            Grounded operational query engine synthesizing weather NWP forecasts, sensor telemetry, and municipal action playbooks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] px-2.5 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-bold border border-secondary/20">
            EVIDENCE CITATIONS REQUIRED
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-space-md">
        <EmptyState
          icon="auto_awesome"
          title="Insight Agent Module Initialized"
          description="Grounded query interface skeleton ready. Subsequent module will connect conversational reasoning with verified table row citations and action protocol synthesis via /api/insight."
        />
      </div>
    </div>
  );
};
