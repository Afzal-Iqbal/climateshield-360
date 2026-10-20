import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { api } from '../api/client';
import {
  PageContainer,
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  StatCard,
  RiskBadge,
  Badge,
  Tabs,
  Select,
  ErrorBoundary,
  ErrorState,
  SkeletonRow,
  TabOption,
} from '../components/ui';
import { ImpactDomainData, RiskLevel } from '../types';

interface EightImpactsProps {
  isSample?: boolean;
}

interface TabDef {
  id: string;
  label: string;
  domainNo: string;
  icon: string;
  expectedEvidence: 'measured' | 'indicator-based' | 'limited';
}

const TABS: TabDef[] = [
  { id: 'physical', label: 'Physical', domainNo: '01', icon: 'domain', expectedEvidence: 'measured' },
  { id: 'environmental', label: 'Environmental', domainNo: '02', icon: 'forest', expectedEvidence: 'measured' },
  { id: 'producers', label: 'Producers', domainNo: '03', icon: 'storefront', expectedEvidence: 'limited' },
  { id: 'economic', label: 'Economic', domainNo: '04', icon: 'account_balance', expectedEvidence: 'limited' },
  { id: 'public_health', label: 'Public Health', domainNo: '05', icon: 'local_hospital', expectedEvidence: 'indicator-based' },
  { id: 'infrastructure', label: 'Infrastructure', domainNo: '06', icon: 'alt_route', expectedEvidence: 'indicator-based' },
  { id: 'social', label: 'Social', domainNo: '07', icon: 'groups', expectedEvidence: 'indicator-based' },
  { id: 'emergency_response', label: 'Emergency Response', domainNo: '08', icon: 'emergency', expectedEvidence: 'indicator-based' },
];

const KARACHI_DISTRICTS = [
  { value: '', label: 'All Karachi Districts (Consolidated)' },
  { value: 'PK702', label: 'Karachi Central (PK702)' },
  { value: 'PK704', label: 'Karachi East (PK704)' },
  { value: 'PK712', label: 'Korangi Karachi (PK712)' },
  { value: 'PK714', label: 'Malir Karachi (PK714)' },
  { value: 'PK721', label: 'Karachi South (PK721)' },
  { value: 'PK729', label: 'Karachi West & Keamari (PK729)' },
];

const CITIES = [
  { value: 'Karachi', label: 'Karachi Division' },
  { value: 'Lahore', label: 'Lahore' },
  { value: 'Rawalpindi', label: 'Rawalpindi' },
  { value: 'Islamabad', label: 'Islamabad' },
  { value: 'Faisalabad', label: 'Faisalabad' },
  { value: 'Multan', label: 'Multan' },
  { value: 'Peshawar', label: 'Peshawar' },
  { value: 'Quetta', label: 'Quetta' },
  { value: 'Hyderabad', label: 'Hyderabad' },
  { value: 'Sukkur', label: 'Sukkur' },
];

export const EightImpacts: React.FC<EightImpactsProps> = ({ isSample: _isSample = true }) => {
  const [activeTabId, setActiveTabId] = useState<string>('physical');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('Karachi');

  // Query impact domain data for active tab
  const {
    data: domainResponse,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['impact-domain', activeTabId, selectedCity, selectedDistrict],
    queryFn: () =>
      api.getImpactDomain(activeTabId, {
        city: selectedCity,
        district_id: selectedDistrict || undefined,
      }),
    refetchInterval: 120000,
  });

  // Query metadata for real-time live status and data freshness
  const { data: metaResponse } = useQuery({
    queryKey: ['meta'],
    queryFn: api.getMeta,
    refetchInterval: 60000,
  });
  const isLive = metaResponse?.data?.is_live ?? false;
  const dataAsOf = metaResponse?.data?.data_as_of;

  const domainData: ImpactDomainData | undefined = domainResponse?.data;
  const activeTabDef = TABS.find((t) => t.id === activeTabId) || TABS[0];

  const tabOptions: TabOption[] = TABS.map((t) => ({
    id: t.id,
    label: t.label,
    icon: t.icon,
  }));

  const isLimited = domainData?.evidence_level === 'limited';

  return (
    <PageContainer maxWidth="full">
      {/* Page Header with District & City Filters */}
      <PageHeader
        title="Eight-Impact Analysis Matrix"
        subtitle="Multi-sectoral situational appraisal evaluating empirical exposure, structural assets, critical infrastructure, and human vulnerability across monitored municipal zones."
        lastUpdated={dataAsOf || domainResponse?.generated_at}
        isLive={isLive}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Select
              options={CITIES}
              value={selectedCity}
              onChange={setSelectedCity}
              icon="location_city"
            />
            <Select
              options={KARACHI_DISTRICTS}
              value={selectedDistrict}
              onChange={setSelectedDistrict}
              icon="domain"
            />
          </div>
        }
      />

      {/* Scientific Notice Banner */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/60 border border-white/10 p-4 backdrop-blur-md shadow-md">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 flex items-center justify-center shrink-0 mt-0.5">
            <span className="material-symbols-outlined text-[20px]">science</span>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-xs font-bold text-white font-display uppercase tracking-wider">
                Methodology &amp; Evidence Classification
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono-val bg-white/10 text-slate-300 font-semibold border border-white/10">
                Peer-Reviewed Caveat
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-4xl font-body">
              Only atmospheric hazards (Heat Index &amp; Rainfall) are numerical predictive models. The 8 domain impacts below are computed via empirical vulnerability indicators, baseline census cross-matching, and historical damage transfer functions. Always evaluate evidence strength badges before dispatching resources.
            </p>
          </div>
        </div>
      </div>

      {/* Eight Domain Tabs Navigation with Sliding Indicator */}
      <div className="w-full overflow-x-auto custom-scrollbar pb-1">
        <Tabs
          tabs={tabOptions}
          activeTab={activeTabId}
          onChange={setActiveTabId}
          className="w-full flex justify-start sm:justify-center"
        />
      </div>

      {/* Tab Panel Content */}
      <ErrorBoundary fallbackTitle="Impact Domain Error">
        {isLoading ? (
          <SkeletonRow count={4} />
        ) : isError ? (
          <ErrorState
            title="Failed to Load Impact Domain Data"
            error={error instanceof Error ? error.message : 'DuckDB warehouse connection interrupted.'}
            onRetry={() => refetch()}
          />
        ) : domainData ? (
          <div className="flex flex-col gap-6">
            {/* Top Domain Summary Card */}
            <Card isKeyCard={domainData.risk_level === 'Severe' || domainData.risk_level === 'High'}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-teal-500/20 border border-cyan-400/40 text-cyan-300 flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(6,182,212,0.2)]">
                    <span className="material-symbols-outlined text-[24px]">{activeTabDef.icon}</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-val text-[11px] text-cyan-400 font-semibold uppercase tracking-wider">
                        Domain {activeTabDef.domainNo}
                      </span>
                      <span className="text-slate-600">·</span>
                      <span className="font-mono-val text-[11px] text-slate-400 uppercase">
                        Sector Protocol
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-bold text-white font-display truncate">
                      {domainData.title}
                    </h2>
                  </div>
                </div>

                {/* Evidence & Risk Badges */}
                <div className="flex items-center flex-wrap gap-2.5">
                  {domainData.evidence_level === 'measured' && (
                    <Badge variant="success" icon="check_circle">
                      Measured Evidence
                    </Badge>
                  )}
                  {domainData.evidence_level === 'indicator-based' && (
                    <Badge variant="warning" icon="analytics">
                      Indicator-Based Evidence
                    </Badge>
                  )}
                  {domainData.evidence_level === 'limited' && (
                    <Badge variant="outline" icon="block">
                      Limited Evidence
                    </Badge>
                  )}

                  {domainData.risk_level && (
                    <RiskBadge level={domainData.risk_level as RiskLevel} />
                  )}
                </div>
              </div>

              {/* Coverage Meter (Requirement 22) */}
              <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                  <span className="font-mono-val font-semibold text-slate-300 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-cyan-400">verified</span>
                    Warehouse District Coverage Meter
                  </span>
                  <span className="font-mono-val text-slate-400">
                    {domainData.coverage > 0
                      ? `${domainData.coverage}% of districts reporting (${domainData.coverage_count || 160}/${domainData.coverage_total || 160})`
                      : '0% coverage (Excluded by data validation rules)'}
                  </span>
                </div>
                <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-white/5">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      domainData.coverage > 50
                        ? 'bg-gradient-to-r from-cyan-500 to-teal-400 shadow-[0_0_12px_rgba(6,182,212,0.5)]'
                        : domainData.coverage > 0
                        ? 'bg-amber-500'
                        : 'bg-slate-700'
                    }`}
                    style={{ width: `${Math.max(domainData.coverage, 2)}%` }}
                  />
                </div>
              </div>
            </Card>

            {/* LIMITED EVIDENCE STATE for unsupported areas (Requirement 22: "Limited evidence" state for unsupported areas with no numbers) */}
            {isLimited ? (
              <Card className="p-8 text-center flex flex-col items-center justify-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <span className="material-symbols-outlined text-[32px]">shield_with_heart</span>
                </div>
                <h3 className="text-base font-bold text-white font-display">
                  Limited Evidence Domain
                </h3>
                <p className="text-xs text-slate-400 max-w-lg font-body leading-relaxed">
                  No empirical or validated telemetry is recorded in DuckDB for {domainData.title} in the selected area. Quantitative impact numbers are strictly withheld to prevent false precision in emergency planning decisions.
                </p>
                <div className="mt-2 flex items-center gap-2 text-[11px] font-mono-val text-slate-500 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
                  <span>Data Source Requirement: Sindh Bureau of Statistics &amp; KDA Cadastral Surveys</span>
                </div>
              </Card>
            ) : (
              <>
                {/* Indicators StatCard Grid */}
                {domainData.indicators && domainData.indicators.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {domainData.indicators.map((ind, i) => (
                      <StatCard
                        key={ind.name || i}
                        label={ind.name}
                        value={ind.value ?? '—'}
                        unit={ind.unit || undefined}
                        icon={activeTabDef.icon}
                        accent={ind.evidence_strength === 'high' ? 'cyan' : ind.evidence_strength === 'low' ? 'heat' : 'rain'}
                        sublabel={ind.source ? `Source: ${ind.source}` : (ind.description || undefined)}
                      />
                    ))}
                  </div>
                )}

                {/* Trend Chart (if available) */}
                {domainData.time_series && domainData.time_series.points.length > 0 && (
                  <Card className="flex flex-col">
                    <CardHeader
                      action={
                        <span className="font-mono-val text-xs text-slate-400 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
                          Unit: {domainData.time_series.unit} · {domainData.time_series.points.length} Observations
                        </span>
                      }
                    >
                      <CardTitle icon="trending_up">{domainData.time_series.variable_name}</CardTitle>
                      <CardDescription>Historical timeline and multi-hazard response curve</CardDescription>
                    </CardHeader>

                    <div className="h-64 sm:h-72 w-full pt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={domainData.time_series.points}
                          margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="impactAreaGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis
                            dataKey="timestamp_pkt"
                            stroke="#64748b"
                            fontSize={11}
                            tickLine={false}
                            fontFamily="JetBrains Mono"
                          />
                          <YAxis
                            stroke="#64748b"
                            fontSize={11}
                            tickLine={false}
                            fontFamily="JetBrains Mono"
                          />
                          <RechartsTooltip
                            contentStyle={{
                              backgroundColor: '#09101c',
                              border: '1px solid rgba(255,255,255,0.15)',
                              borderRadius: '12px',
                              fontSize: '12px',
                              color: '#f1f5f9',
                              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="value"
                            stroke="#06b6d4"
                            strokeWidth={2}
                            fill="url(#impactAreaGradient)"
                            name={domainData.time_series.variable_name}
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke="#22d3ee"
                            strokeWidth={2}
                            dot={{ r: 3, fill: '#22d3ee' }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        ) : null}
      </ErrorBoundary>
    </PageContainer>
  );
};

export default EightImpacts;
