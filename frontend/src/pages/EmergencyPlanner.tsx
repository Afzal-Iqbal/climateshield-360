import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  PageContainer,
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  RiskBadge,
  Badge,
  Tabs,
  Button,
  ErrorBoundary,
  EmptyState,
  ErrorState,
  SkeletonRow,
} from '../components/ui';

interface EmergencyPlannerProps {
  isSample?: boolean;
}

export const EmergencyPlanner: React.FC<EmergencyPlannerProps> = ({ isSample: _isSample = false }) => {
  const [selectedHazard, setSelectedHazard] = useState<'heat' | 'heavy_rain'>('heat');
  const [selectedRange, setSelectedRange] = useState<'24h' | '48h' | '7d'>('24h');
  const [expandedZoneId, setExpandedZoneId] = useState<string | null>(null);
  const [filterGapOnly, setFilterGapOnly] = useState<boolean>(false);

  // Fetch Emergency Action Planner data from read-only DuckDB warehouse via API
  const {
    data: plannerRes,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['emergency-planner', selectedHazard, selectedRange],
    queryFn: () => api.getPlanner({ hazard: selectedHazard, range: selectedRange }),
  });

  // Query metadata for real-time live status and data freshness
  const { data: metaResponse } = useQuery({
    queryKey: ['meta'],
    queryFn: api.getMeta,
    refetchInterval: 60000,
  });
  const isLive = metaResponse?.data?.is_live ?? false;
  const dataAsOf = metaResponse?.data?.data_as_of;

  const plannerData = plannerRes?.data;
  const districts = plannerData?.districts || [];
  const cityForecast = plannerData?.city_forecast;
  const resourceSummary = plannerData?.resource_summary;

  const toggleDistrictExpand = (zoneId: string) => {
    setExpandedZoneId((prev) => (prev === zoneId ? null : zoneId));
  };

  const displayedDistricts = filterGapOnly
    ? districts.filter((d) => d.resource_gap)
    : districts;

  return (
    <PageContainer>
      {/* Page Header */}
      <PageHeader
        title="Emergency Action Planner"
        subtitle="Sindh PDMA & KMC Multi-Hazard Priority Triage: ranked district exposure, critical resource gap detection, and deterministic standard operating procedures."
        lastUpdated={dataAsOf || plannerRes?.generated_at}
        isLive={isLive}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="tel:1736"
              className="px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 font-bold text-xs flex items-center gap-1.5 transition-colors"
            >
              <span className="material-symbols-outlined text-[15px]">call</span>
              <span>PDMA: 1736</span>
            </a>
            <a
              href="tel:1122"
              className="px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-bold text-xs flex items-center gap-1.5 transition-colors"
            >
              <span className="material-symbols-outlined text-[15px]">emergency</span>
              <span>Rescue 1122</span>
            </a>
          </div>
        }
      />

      {/* Mandatory Operational Notice: Decision support only */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 shadow-sm text-xs">
        <span className="material-symbols-outlined text-amber-400 text-[22px] shrink-0 mt-0.5">
          gavel
        </span>
        <div className="flex-1">
          <p className="font-bold text-amber-200 text-sm">
            Decision support only, not emergency dispatch instructions.
          </p>
          <p className="text-slate-300 mt-0.5 leading-relaxed font-body">
            All rankings, reason justifications, and suggested measures are rule-based algorithms derived strictly from verified DuckDB warehouse contracts, meteorological predictions, and census exposure data. These protocols provide municipal decision support and must be ratified by authorized incident commanders. In an active life safety emergency, contact official services immediately.
          </p>
        </div>
      </div>

      {/* Filter Bar & City Forecast Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Hazard & Horizon Selectors (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <Card className="flex flex-col gap-4">
            <div>
              <span className="text-[11px] font-mono-val uppercase tracking-wider text-slate-400 font-semibold block mb-2">
                Hazard Mode
              </span>
              <Tabs
                size="sm"
                tabs={[
                  { id: 'heat', label: 'Extreme Heat', icon: 'thermostat' },
                  { id: 'heavy_rain', label: 'Heavy Rain / Flood', icon: 'rainy' },
                ]}
                activeTab={selectedHazard}
                onChange={(id) => setSelectedHazard(id as any)}
              />
            </div>

            <div>
              <span className="text-[11px] font-mono-val uppercase tracking-wider text-slate-400 font-semibold block mb-2">
                Operational Horizon
              </span>
              <Tabs
                size="sm"
                tabs={[
                  { id: '24h', label: 'Next 24h' },
                  { id: '48h', label: '48 Hours' },
                  { id: '7d', label: '7 Days' },
                ]}
                activeTab={selectedRange}
                onChange={(id) => setSelectedRange(id as any)}
              />
            </div>
          </Card>
        </div>

        {/* Right: City-Wide Forecast Summary & Resource Gap Tally (7 cols) */}
        <div className="lg:col-span-7 flex flex-col">
          <Card className="flex flex-col justify-between h-full">
            <CardHeader
              action={
                resourceSummary && (
                  <Badge variant={resourceSummary.flagged_gap_districts_count > 0 ? 'warning' : 'success'}>
                    {resourceSummary.flagged_gap_districts_count} Resource Gap{resourceSummary.flagged_gap_districts_count !== 1 ? 's' : ''}
                  </Badge>
                )
              }
            >
              <CardTitle icon="wb_twilight">City Meteorological Context</CardTitle>
              <CardDescription>
                Ensemble prediction applied across all administrative districts
              </CardDescription>
            </CardHeader>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-val">
              <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase">Hazard</span>
                <span className="font-bold text-white uppercase mt-0.5">{selectedHazard === 'heat' ? 'Heat Wave' : 'Monsoon Rain'}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase">Probability</span>
                <span className="font-bold text-cyan-400 mt-0.5">
                  {cityForecast?.avg_probability ? `${Math.round(cityForecast.avg_probability * 100)}%` : '—'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase">90% CI</span>
                <span className="font-bold text-slate-200 mt-0.5">
                  {cityForecast?.interval_low !== undefined ? `[${Math.round(cityForecast.interval_low * 100)}%–${Math.round((cityForecast.interval_high || 0) * 100)}%]` : '—'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase">Baseline Norm</span>
                <span className="font-bold text-slate-300 mt-0.5">
                  {cityForecast?.baseline_value ? `${Math.round(cityForecast.baseline_value * 100)}%` : '—'}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Ranked Action Measure Cards */}
      <ErrorBoundary fallbackTitle="District SOP Triage Error">
        <Card className="flex flex-col gap-4">
          <CardHeader
            action={
              <button
                type="button"
                onClick={() => setFilterGapOnly((prev) => !prev)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono-val font-semibold transition-colors cursor-pointer border ${
                  filterGapOnly
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs'
                    : 'bg-white/5 text-slate-400 hover:text-white border-white/10'
                }`}
              >
                {filterGapOnly ? 'Showing Gaps Only' : 'Filter Gaps Only'}
              </button>
            }
          >
            <CardTitle icon="format_list_numbered">Ranked District Action Triage</CardTitle>
            <CardDescription>
              Ranked SOP checklists, critical asset gaps, and shelter logistics
            </CardDescription>
          </CardHeader>

          {isLoading ? (
            <SkeletonRow count={3} />
          ) : isError ? (
            <ErrorState
              title="Planner Data Interrupted"
              error="Unable to retrieve emergency measures from warehouse."
              onRetry={refetch}
            />
          ) : displayedDistricts.length === 0 ? (
            <EmptyState
              title="No Emergency Actions Triggered"
              reason="No districts breach moderate or severe intervention thresholds for this configuration."
              pipelineSource="Source: exposure_index &amp; NDMA SOP rulebook"
            />
          ) : (
            <div className="flex flex-col gap-3">
              {displayedDistricts.map((district, idx) => {
                const isExpanded = expandedZoneId === district.district_id;
                const hasGap = district.resource_gap;

                return (
                  <div
                    key={district.district_id}
                    className="p-4 sm:p-5 rounded-xl bg-slate-900/60 border border-white/10 hover:border-white/20 transition-all flex flex-col gap-3"
                  >
                    {/* Header Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono-val font-bold text-xs flex items-center justify-center shrink-0">
                          #{idx + 1}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-white text-sm sm:text-base font-display truncate">
                            {district.district_name}
                          </span>
                          <span className="font-mono-val text-[11px] text-slate-400">
                            {district.district_id} · Pop: {district.exposed_population ? Number(district.exposed_population).toLocaleString() : '—'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center flex-wrap gap-2 shrink-0">
                        <RiskBadge level={district.risk_level} size="sm" />
                        {hasGap && (
                          <Badge variant="warning" icon="report_problem">
                            Resource Gap
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={isExpanded ? 'expand_less' : 'expand_more'}
                          onClick={() => toggleDistrictExpand(district.district_id)}
                        >
                          {isExpanded ? 'Collapse' : 'SOP Measures'}
                        </Button>
                      </div>
                    </div>

                    {/* Quick Justification */}
                    <p className="text-xs text-slate-300 font-body leading-relaxed bg-black/20 p-2.5 rounded-lg border border-white/5">
                      <strong>Triage Rationale: </strong>
                      {district.reason_summary}
                    </p>

                    {/* Expanded Measures & Shelters List */}
                    {isExpanded && (
                      <div className="pt-3 border-t border-white/5 flex flex-col gap-3 animate-in fade-in duration-200">
                        <span className="text-[11px] font-mono-val font-semibold uppercase tracking-wider text-cyan-400">
                          Action Checklist &amp; Operational Directives
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {district.suggested_measures?.map((m, mIdx: number) => (
                            <div
                              key={mIdx}
                              className="p-3 rounded-lg bg-slate-950/60 border border-white/5 flex items-start gap-2 text-xs"
                            >
                              <span className="material-symbols-outlined text-cyan-400 text-[18px] shrink-0 mt-0.5">
                                check_box
                              </span>
                              <div className="flex flex-col gap-0.5">
                                <span className="font-semibold text-white">
                                  {m.title || m.action}
                                </span>
                                <span className="text-slate-400 text-[11px]">
                                  {m.action ? `${m.action} (Target: ${m.target})` : 'Standard Operating Procedure execution'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </ErrorBoundary>
    </PageContainer>
  );
};

export default EmergencyPlanner;
