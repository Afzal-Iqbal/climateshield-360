import React from 'react';
import { SampleBanner } from '../components/SampleBanner';
import { EmptyState } from '../components/EmptyState';
import { RiskBadge } from '../components/RiskBadge';

interface RiskMapProps {
  isSample?: boolean;
}

export const RiskMap: React.FC<RiskMapProps> = ({ isSample = true }) => {
  return (
    <div className="px-space-md lg:px-space-lg py-space-md flex flex-col gap-space-lg max-w-[1720px] mx-auto w-full">
      <SampleBanner isSample={isSample} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-outline-variant/30 pb-space-md">
        <div>
          <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight">
            Spatial Risk Map &amp; Critical Infrastructure
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
            Geospatial layer rendering for Karachi towns, drainage basins, electrical substations, and emergency triage hubs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RiskBadge level="Moderate" label="Map Engine: MapLibre GL Ready" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-space-md">
        <EmptyState
          icon="radar"
          title="Spatial Risk Map Module Initialized"
          description="MapLibre GL container and GeoJSON zone vector schemas ready. Subsequent phase will render Karachi boundary polygons, hospital access routes, and real-time hazard overlays from /api/map."
        />
      </div>
    </div>
  );
};
