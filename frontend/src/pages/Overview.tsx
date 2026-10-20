import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  ReferenceLine,
} from 'recharts';

import { api, formatPKT } from '../api/client';
import {
  PageContainer,
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  StatCard,
  RiskBadge,
  Tabs,
  Button,
  ErrorBoundary,
  EmptyState,
  ErrorState,
  SkeletonRow,
  SkeletonChart,
} from '../components/ui';
import { RiskLevel } from '../types';

interface OverviewProps {
  isSample?: boolean;
}

export const Overview: React.FC<OverviewProps> = ({ isSample = true }) => {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const [timeRange, setTimeRange] = useState<'24h' | '48h' | '7d'>('24h');
  const [activeHazardView, setActiveHazardView] = useState<'heat' | 'heavy_rain' | 'both'>('both');
  const [priorityHazardFilter, setPriorityHazardFilter] = useState<'all' | 'heat' | 'heavy_rain'>('all');
  const [showAllPriorities, setShowAllPriorities] = useState(false);
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);

  // Fetch Overview summary and prediction curves
  const {
    data: overviewResponse,
    isLoading: isOverviewLoading,
    isError: isOverviewError,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: ['overview', timeRange],
    queryFn: () => api.getOverview(timeRange),
    refetchInterval: 60000,
  });

  // Fetch Ranked Priority Actions from exposure_index
  const {
    data: prioritiesResponse,
    isLoading: isPrioritiesLoading,
    isError: isPrioritiesError,
    refetch: refetchPriorities,
  } = useQuery({
    queryKey: ['priorities', timeRange, priorityHazardFilter],
    queryFn: () =>
      api.getPriorities({
        range: timeRange,
        hazard: priorityHazardFilter === 'all' ? undefined : priorityHazardFilter,
      }),
    refetchInterval: 60000,
  });

  // Fetch total count of all priority actions
  const { data: allPrioritiesResponse } = useQuery({
    queryKey: ['priorities', timeRange, 'all-total'],
    queryFn: () => api.getPriorities({ range: timeRange }),
    staleTime: 60000,
  });

  const overview = overviewResponse?.data;
  const priorities = prioritiesResponse?.data || [];
  const allPrioritiesCount = allPrioritiesResponse?.data?.length ?? priorities.length;
  const visiblePriorities = showAllPriorities ? priorities : priorities.slice(0, 5);

  // Build combined chart dataset from prediction points
  const heatPoints = overview?.predictions_series?.heat || [];
  const rainPoints = overview?.predictions_series?.heavy_rain || [];

  const chartData = useMemo(() => {
    return heatPoints.map((hp, idx) => {
      const rp = rainPoints[idx] || {};
      const pktTime = formatPKT(hp.forecast_time, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      return {
        forecast_time: hp.forecast_time,
        short_time: `+${hp.hours_ahead}h`,
        full_time: `+${hp.hours_ahead}h (${pktTime.split(',')[1]?.trim() || pktTime})`,
        display_time: `+${hp.hours_ahead}h`,
        hours_ahead: hp.hours_ahead,
        // Heat hazard metrics
        heat_prob: Math.round((hp.probability ?? 0) * 100),
        heat_ci_base: Math.round((hp.interval_low ?? 0) * 100),
        heat_ci_range: Math.round(Math.max(0, (hp.interval_high ?? 0) - (hp.interval_low ?? 0)) * 100),
        heat_baseline: Math.round((hp.baseline_value ?? 0) * 100),
        // Rain hazard metrics
        rain_prob: Math.round((rp.probability ?? 0) * 100),
        rain_ci_base: Math.round((rp.interval_low ?? 0) * 100),
        rain_ci_range: Math.round(Math.max(0, (rp.interval_high ?? 0) - (rp.interval_low ?? 0)) * 100),
        rain_baseline: Math.round((rp.baseline_value ?? 0) * 100),
      };
    });
  }, [heatPoints, rainPoints]);

  // Mini Map hotspots dynamically populated from API priorities
  const mapHotspots = useMemo(() => {
    const baseSpots = [
      { id: 'KHI-MALIR', defaultName: 'Malir Basin', x: '72%', y: '48%' },
      { id: 'KHI-CENTRAL', defaultName: 'Karachi Central', x: '52%', y: '40%' },
      { id: 'KHI-KORANGI', defaultName: 'Korangi Industrial', x: '58%', y: '65%' },
      { id: 'KHI-WEST', defaultName: 'Orangi / SITE', x: '26%', y: '32%' },
      { id: 'KHI-EAST', defaultName: 'Gulshan / East', x: '48%', y: '42%' },
      { id: 'KHI-SOUTH', defaultName: 'Saddar / Lyari', x: '35%', y: '58%' },
      { id: 'KHI-KEAMARI', defaultName: 'Keamari / Port', x: '18%', y: '62%' },
    ];

    return baseSpots.map((spot) => {
      const p = priorities.find((item) => item.zone_id === spot.id);
      return {
        id: spot.id,
        name: p?.zone_name || spot.defaultName,
        x: spot.x,
        y: spot.y,
        level: (p?.risk_level || null) as RiskLevel | null,
        desc: p?.action_title || p?.reason || '',
      };
    });
  }, [priorities]);

  const paintFor = (id: string) => {
    const level = mapHotspots.find((spot) => spot.id === id)?.level;
    if (level === 'Severe') return { fill: '#ef4444', stroke: '#f87171' };
    if (level === 'High') return { fill: '#f97316', stroke: '#fb923c' };
    if (level === 'Moderate') return { fill: '#f59e0b', stroke: '#fbbf24' };
    if (level === 'Low') return { fill: '#10b981', stroke: '#34d399' };
    return { fill: '#334155', stroke: '#94a3b8' };
  };

  const labelFor = (id: string, fallback: string) => {
    const spot = mapHotspots.find((item) => item.id === id);
    return `${spot?.name || fallback}${spot?.level ? ` (${spot.level})` : ' (no score)'}`;
  };

  const severeOnMap = mapHotspots.filter((spot) => spot.level === 'Severe').length;

  if (isOverviewError || isPrioritiesError) {
    return (
      <PageContainer>
        <ErrorState
          title="Telemetry Feed Disconnected"
          error="Unable to retrieve real-time overview data from DuckDB warehouse."
          onRetry={() => {
            refetchOverview();
            refetchPriorities();
          }}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Page Header with Time Horizon Switcher */}
      <PageHeader
        title="Operational Hazard Overview"
        subtitle="Real-time multi-hazard telemetry, ensemble probability curves, and ranked municipal interventions for Karachi Division."
        lastUpdated={overviewResponse?.generated_at}
        isLive={!isSample}
        actions={
          <div className="flex items-center gap-2">
            <span className="font-mono-val text-[11px] text-slate-400 font-semibold uppercase tracking-wider hidden sm:inline">
              Horizon:
            </span>
            <Tabs
              size="sm"
              tabs={[
                { id: '24h', label: 'Next 24h' },
                { id: '48h', label: '48 Hours' },
                { id: '7d', label: '7 Days' },
              ]}
              activeTab={timeRange}
              onChange={(id) => setTimeRange(id as any)}
            />
          </div>
        }
      />

      {/* 4 Hero Stat Cards */}
      <ErrorBoundary fallbackTitle="Hero Telemetry Error">
        {isOverviewLoading ? (
          <SkeletonRow count={4} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Thermal Hazard */}
            <StatCard
              label="Hazard Vector 01 · Thermal"
              value={overview?.heat_summary?.headline_value ?? '—'}
              unit={overview?.heat_summary?.unit || '°C'}
              icon="thermostat"
              accent={overview?.heat_hazard_level === 'Severe' ? 'severe' : overview?.heat_hazard_level === 'High' ? 'high' : 'heat'}
              isKeyCard={overview?.heat_hazard_level === 'Severe' || overview?.heat_hazard_level === 'High'}
              sublabel={overview?.heat_summary?.label || 'Peak Heat Index'}
              uncertaintyRange={
                overview?.heat_summary?.interval_low !== undefined && overview?.heat_summary?.interval_high !== undefined
                  ? { low: overview.heat_summary.interval_low, high: overview.heat_summary.interval_high, unit: overview.heat_summary.unit }
                  : undefined
              }
              baselineValue="Climatological Summer Median"
              baselineLabel="Reference"
            />

            {/* Card 2: Rain Inundation */}
            <StatCard
              label="Hazard Vector 02 · Rain"
              value={overview?.rain_summary?.headline_value ?? '—'}
              unit={overview?.rain_summary?.unit || 'mm/24h'}
              icon="rainy"
              accent={overview?.rain_hazard_level === 'Severe' ? 'severe' : overview?.rain_hazard_level === 'High' ? 'high' : 'rain'}
              isKeyCard={overview?.rain_hazard_level === 'Severe' || overview?.rain_hazard_level === 'High'}
              sublabel={overview?.rain_summary?.label || 'Precipitation Volume'}
              uncertaintyRange={
                overview?.rain_summary?.interval_low !== undefined && overview?.rain_summary?.interval_high !== undefined
                  ? { low: overview.rain_summary.interval_low, high: overview.rain_summary.interval_high, unit: overview.rain_summary.unit }
                  : undefined
              }
              baselineValue="Monsoon Seasonal Baseline"
              baselineLabel="Reference"
            />

            {/* Card 3: Severe Zones */}
            <StatCard
              label="Severe Risk Districts"
              value={overview?.severe_zones_count ?? 0}
              unit={`/ ${overview?.total_zones_count ?? 7}`}
              icon="crisis_alert"
              accent={overview?.severe_zones_count && overview.severe_zones_count > 0 ? 'severe' : 'cyan'}
              isKeyCard={overview?.severe_zones_count ? overview.severe_zones_count > 0 : false}
              sublabel={overview?.severe_zone_names?.length ? `Hotspots: ${overview.severe_zone_names.join(', ')}` : 'No severe alerts active'}
              baselineValue="Monitored Divisions"
              baselineLabel="Scope"
            />

            {/* Card 4: Freshness & Integrity */}
            <StatCard
              label="Data Freshness"
              value={overview?.freshness_summary?.integrity_pct !== undefined ? `${overview.freshness_summary.integrity_pct}%` : '100%'}
              icon="verified"
              accent="cyan"
              sublabel={`${overview?.freshness_summary?.fresh_sources ?? 0} of ${overview?.freshness_summary?.total_sources ?? 0} sources fresh`}
              baselineValue={overview?.data_freshness_status || 'NOMINAL'}
              baselineLabel="Warehouse Status"
            />
          </div>
        )}
      </ErrorBoundary>

      {/* Main Grid: Hazard Probability Chart + Tilted 3D Mini Map Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Left Column: Ensemble Hazard Timeline Chart (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <Card className="flex flex-col h-full">
            <CardHeader
              action={
                <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-white/10">
                  <button
                    type="button"
                    onClick={() => setActiveHazardView('heat')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono-val transition-colors ${
                      activeHazardView === 'heat' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Heat
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveHazardView('heavy_rain')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono-val transition-colors ${
                      activeHazardView === 'heavy_rain' ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Rain
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveHazardView('both')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono-val transition-colors ${
                      activeHazardView === 'both' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/40' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Both
                  </button>
                </div>
              }
            >
              <CardTitle icon="show_chart">
                {timeRange === '24h' ? '24-Hour' : timeRange === '48h' ? '48-Hour' : '7-Day'} Ensemble Hazard Timeline
              </CardTitle>
              <CardDescription>
                Probabilistic hazard trajectory with 90% confidence uncertainty band and 30-year baseline
              </CardDescription>
            </CardHeader>

            {isOverviewLoading ? (
              <SkeletonChart height="h-72" />
            ) : chartData.length === 0 ? (
              <EmptyState
                title="No Hazard Predictions Found"
                reason="The automated model run has not published curve forecasts for this horizon yet."
                pipelineSource="Run prefect pipeline flow: flows/hourly_pipeline.py"
              />
            ) : (
              <div className="w-full h-80 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="heatGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="rainGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="short_time"
                      stroke="#64748b"
                      fontSize={11}
                      tickLine={false}
                      fontFamily="JetBrains Mono"
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      tickLine={false}
                      unit="%"
                      domain={[0, 100]}
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
                        fontFamily: 'Inter',
                      }}
                      labelFormatter={(label, payload) => payload?.[0]?.payload?.full_time || label}
                      formatter={(val: any, name: string) => [`${val}%`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px', fontFamily: 'Inter' }} />

                    {/* Heat Hazard Elements */}
                    {(activeHazardView === 'heat' || activeHazardView === 'both') && (
                      <>
                        <Area
                          type="monotone"
                          dataKey="heat_ci_range"
                          baseValue="dataMin"
                          stroke="none"
                          fill="url(#heatGradient)"
                          name="Heat 90% Confidence"
                        />
                        <Line
                          type="monotone"
                          dataKey="heat_prob"
                          stroke="#f59e0b"
                          strokeWidth={2.5}
                          dot={{ fill: '#f59e0b', r: 3 }}
                          activeDot={{ r: 5 }}
                          name="Heat Probability"
                        />
                        <Line
                          type="stepAfter"
                          dataKey="heat_baseline"
                          stroke="#78350f"
                          strokeDasharray="4 4"
                          strokeWidth={1.5}
                          dot={false}
                          name="Heat Climatology Baseline"
                        />
                      </>
                    )}

                    {/* Rain Hazard Elements */}
                    {(activeHazardView === 'heavy_rain' || activeHazardView === 'both') && (
                      <>
                        <Area
                          type="monotone"
                          dataKey="rain_ci_range"
                          baseValue="dataMin"
                          stroke="none"
                          fill="url(#rainGradient)"
                          name="Rain 90% Confidence"
                        />
                        <Line
                          type="monotone"
                          dataKey="rain_prob"
                          stroke="#38bdf8"
                          strokeWidth={2.5}
                          dot={{ fill: '#38bdf8', r: 3 }}
                          activeDot={{ r: 5 }}
                          name="Rain Probability"
                        />
                        <Line
                          type="stepAfter"
                          dataKey="rain_baseline"
                          stroke="#0369a1"
                          strokeDasharray="4 4"
                          strokeWidth={1.5}
                          dot={false}
                          name="Rain Climatology Baseline"
                        />
                      </>
                    )}

                    <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Severe Threshold (70%)', fill: '#f87171', fontSize: 10 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Tilted 3D Mini Map Preview (5 cols) */}
        <div className="lg:col-span-5 flex flex-col">
          <Card className="flex flex-col justify-between h-full overflow-hidden relative">
            <CardHeader
              action={
                <Link to="/risk-map">
                  <Button variant="primary" size="sm" icon="open_in_new" iconPosition="right">
                    Open 3D Map
                  </Button>
                </Link>
              }
            >
              <CardTitle icon="radar">3D District Risk Preview</CardTitle>
              <CardDescription>
                Tilted spatial preview · {severeOnMap} severe hotspot{severeOnMap !== 1 ? 's' : ''} detected
              </CardDescription>
            </CardHeader>

            {/* Tilted 3D Map Container with CSS 3D Perspective (Pitch 40) */}
            <div className="relative w-full h-72 sm:h-80 overflow-hidden rounded-xl bg-slate-950/80 border border-white/10 flex items-center justify-center">
              <div
                style={{
                  transform: shouldReduceMotion
                    ? 'none'
                    : 'perspective(900px) rotateX(40deg) rotateZ(-12deg) scale(0.95)',
                  transformStyle: 'preserve-3d',
                  transition: 'transform 0.4s ease',
                }}
                className="relative w-[115%] h-[120%] shrink-0 shadow-2xl"
              >
                {/* Visual SVG Map */}
                <svg
                  viewBox="0 0 1000 450"
                  className="w-full h-full select-none"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    <radialGradient id="coastGlow" cx="20%" cy="80%" r="60%">
                      <stop offset="0%" stopColor="#0891b2" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#020617" stopOpacity="0" />
                    </radialGradient>
                  </defs>

                  {/* Coastline Arabian Sea background */}
                  <rect width="1000" height="450" fill="url(#coastGlow)" />
                  <path
                    d="M 0 350 Q 200 320 400 380 T 800 420 L 1000 450 L 0 450 Z"
                    fill="#0369a1"
                    fillOpacity="0.15"
                  />

                  {/* Malir Basin */}
                  <path
                    d="M 640 130 L 880 110 L 870 300 L 670 290 L 670 210 Z"
                    fill={paintFor('KHI-MALIR').fill}
                    fillOpacity="0.4"
                    stroke={paintFor('KHI-MALIR').stroke}
                    strokeWidth="2"
                    className="cursor-pointer hover:fill-opacity-70 transition-all"
                    onClick={() => navigate('/risk-map?zone=KHI-MALIR')}
                  />
                  <text x="690" y="200" fill="#f1f5f9" fontFamily="JetBrains Mono" fontSize="12" fontWeight="bold">
                    {labelFor('KHI-MALIR', 'Malir')}
                  </text>

                  {/* Central */}
                  <path
                    d="M 420 120 L 640 130 L 670 210 L 490 220 L 410 170 Z"
                    fill={paintFor('KHI-CENTRAL').fill}
                    fillOpacity="0.4"
                    stroke={paintFor('KHI-CENTRAL').stroke}
                    strokeWidth="2"
                    className="cursor-pointer hover:fill-opacity-70 transition-all"
                    onClick={() => navigate('/risk-map?zone=KHI-CENTRAL')}
                  />
                  <text x="450" y="175" fill="#f1f5f9" fontFamily="JetBrains Mono" fontSize="12" fontWeight="bold">
                    {labelFor('KHI-CENTRAL', 'Central')}
                  </text>

                  {/* Orangi & West */}
                  <path
                    d="M 190 70 L 290 60 L 410 120 L 350 190 L 190 160 Z"
                    fill={paintFor('KHI-WEST').fill}
                    fillOpacity="0.4"
                    stroke={paintFor('KHI-WEST').stroke}
                    strokeWidth="2"
                    className="cursor-pointer hover:fill-opacity-70 transition-all"
                    onClick={() => navigate('/risk-map?zone=KHI-WEST')}
                  />
                  <text x="220" y="125" fill="#fb923c" fontFamily="JetBrains Mono" fontSize="11" fontWeight="600">
                    ORANGI / SITE
                  </text>

                  {/* Korangi */}
                  <path
                    d="M 490 220 L 670 210 L 670 320 L 480 330 Z"
                    fill={paintFor('KHI-KORANGI').fill}
                    fillOpacity="0.45"
                    stroke={paintFor('KHI-KORANGI').stroke}
                    strokeWidth="2"
                    className="cursor-pointer hover:fill-opacity-70 transition-all"
                    onClick={() => navigate('/risk-map?zone=KHI-KORANGI')}
                  />
                  <text x="510" y="275" fill="#f1f5f9" fontFamily="JetBrains Mono" fontSize="12" fontWeight="bold">
                    {labelFor('KHI-KORANGI', 'Korangi')}
                  </text>

                  {/* South */}
                  <path
                    d="M 230 180 L 350 190 L 360 255 L 250 250 Z"
                    fill={paintFor('KHI-SOUTH').fill}
                    fillOpacity="0.35"
                    stroke={paintFor('KHI-SOUTH').stroke}
                    strokeWidth="2"
                    className="cursor-pointer hover:fill-opacity-60 transition-all"
                    onClick={() => navigate('/risk-map?zone=KHI-SOUTH')}
                  />
                  <text x="260" y="225" fill="#fbbf24" fontFamily="JetBrains Mono" fontSize="11" fontWeight="600">
                    SADDAR / LYARI
                  </text>

                  {/* Keamari */}
                  <path
                    d="M 120 180 L 230 180 L 250 250 L 220 330 L 90 280 Z"
                    fill={paintFor('KHI-KEAMARI').fill}
                    fillOpacity="0.4"
                    stroke={paintFor('KHI-KEAMARI').stroke}
                    strokeWidth="2"
                    className="cursor-pointer hover:fill-opacity-60 transition-all"
                    onClick={() => navigate('/risk-map?zone=KHI-KEAMARI')}
                  />
                  <text x="120" y="255" fill="#38bdf8" fontFamily="JetBrains Mono" fontSize="11" fontWeight="600">
                    KEAMARI PORT
                  </text>

                  {/* Drainage vectors */}
                  <path d="M 390 80 Q 380 140 340 185" stroke="#38bdf8" strokeWidth="2" strokeDasharray="4 4" />
                  <path d="M 680 150 Q 610 230 540 330" stroke="#38bdf8" strokeWidth="2.5" />
                </svg>

                {/* Hotspot Pulse Pins */}
                {mapHotspots.map((hs) => (
                  <div
                    key={hs.id}
                    style={{ left: hs.x, top: hs.y }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
                    onMouseEnter={() => setHoveredZone(hs.id)}
                    onMouseLeave={() => setHoveredZone(null)}
                    onClick={() => navigate(`/risk-map?zone=${hs.id}`)}
                  >
                    <div className="relative flex items-center justify-center">
                      <span
                        className={`animate-ping absolute inline-flex h-6 w-6 rounded-full opacity-75 ${
                          hs.level === 'Severe'
                            ? 'bg-red-500'
                            : hs.level === 'High'
                            ? 'bg-orange-500'
                            : hs.level === 'Moderate'
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                      />
                      <span
                        className={`relative inline-flex rounded-full h-3.5 w-3.5 border-2 border-white shadow-md ${
                          hs.level === 'Severe'
                            ? 'bg-red-500'
                            : hs.level === 'High'
                            ? 'bg-orange-500'
                            : hs.level === 'Moderate'
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* HUD Overlay with District Info */}
              <div className="absolute bottom-2 left-2 right-2 bg-slate-900/90 backdrop-blur-md border border-white/10 rounded-xl p-2.5 flex items-center justify-between text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-cyan-400 text-[18px]">explore</span>
                  <span className="font-semibold text-white font-display">
                    {hoveredZone
                      ? mapHotspots.find((h) => h.id === hoveredZone)?.name
                      : 'Karachi Division'}
                  </span>
                </div>
                <div className="flex items-center gap-3 font-mono-val text-[11px]">
                  <span>PITCH 40°</span>
                  <Link to="/risk-map" className="text-cyan-400 font-semibold hover:underline flex items-center gap-0.5">
                    Full 3D View →
                  </Link>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Ranked Priority Intervention Panel (Internal scroll with sticky header, top 5 by default) */}
      <ErrorBoundary fallbackTitle="Priority Interventions Error">
        <Card className="flex flex-col">
          <CardHeader
            action={
              <div className="flex items-center gap-2">
                {/* Filter by hazard */}
                <div className="flex items-center bg-slate-900/80 p-1 rounded-xl border border-white/10">
                  <button
                    type="button"
                    onClick={() => setPriorityHazardFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono-val transition-colors ${
                      priorityHazardFilter === 'all' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/40' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All Hazards
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriorityHazardFilter('heat')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono-val transition-colors ${
                      priorityHazardFilter === 'heat' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Heat Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriorityHazardFilter('heavy_rain')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono-val transition-colors ${
                      priorityHazardFilter === 'heavy_rain' ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Rain Only
                  </button>
                </div>

                {/* Show All / Show Top 5 Toggle */}
                {allPrioritiesCount > 5 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllPriorities((prev) => !prev)}
                  >
                    {showAllPriorities ? 'Show Top 5' : `Show all (${allPrioritiesCount})`}
                  </Button>
                )}
              </div>
            }
          >
            <CardTitle icon="warning">Ranked Priority Municipal Interventions</CardTitle>
            <CardDescription>
              Sorted by composite exposure index and vulnerability score from DuckDB exposure_index
            </CardDescription>
          </CardHeader>

          {isPrioritiesLoading ? (
            <div className="space-y-3 p-2">
              <div className="h-14 bg-white/5 rounded-xl skeleton-shimmer" />
              <div className="h-14 bg-white/5 rounded-xl skeleton-shimmer" />
              <div className="h-14 bg-white/5 rounded-xl skeleton-shimmer" />
            </div>
          ) : visiblePriorities.length === 0 ? (
            <EmptyState
              title="No Priority Interventions"
              reason="No districts currently breach moderate or severe intervention triggers for this hazard filter."
              pipelineSource="Table contract: exposure_index"
            />
          ) : (
            <div className="overflow-x-auto max-h-96 custom-scrollbar rounded-xl border border-white/10">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-md text-slate-400 font-mono-val border-b border-white/10 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-4 py-3">Rank / Zone</th>
                    <th className="px-4 py-3">Hazard &amp; Risk</th>
                    <th className="px-4 py-3 text-right">Risk Score &amp; Vuln</th>
                    <th className="px-4 py-3 text-right">Exposed Pop</th>
                    <th className="px-4 py-3">Recommended Municipal Action</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 bg-slate-950/40 font-body">
                  {visiblePriorities.map((item, idx) => {
                    return (
                      <tr
                        key={item.zone_id || idx}
                        className="hover:bg-white/[0.04] transition-colors"
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 text-cyan-400 font-mono-val font-bold text-xs flex items-center justify-center shrink-0">
                              #{item.rank || idx + 1}
                            </span>
                            <div className="flex flex-col min-w-0">
                              <span className="font-semibold text-white truncate font-display">
                                {item.zone_name || item.zone_id}
                              </span>
                              <span className="font-mono-val text-[11px] text-slate-500">
                                {item.zone_id}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <RiskBadge level={item.risk_level} size="sm" />
                            <span className="text-xs text-slate-400 capitalize">
                              {item.hazard_type === 'heavy_rain' ? 'Rain' : item.hazard_type}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-right font-mono-val">
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-white text-sm">
                              {item.score ?? 0} / 100
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Vuln: {item.vulnerability_score ?? '—'}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-right font-mono-val">
                          <span className="font-semibold text-slate-200">
                            {item.exposed_population ? Number(item.exposed_population).toLocaleString() : '—'}
                          </span>
                        </td>

                        <td className="px-4 py-3.5">
                          <p className="text-xs text-slate-300 max-w-sm line-clamp-2">
                            {item.action_title || item.reason || 'Deploy field inspection team and clear stormwater outlets.'}
                          </p>
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <Link to={`/risk-map?zone=${item.zone_id}`}>
                            <Button variant="ghost" size="sm" icon="radar">
                              Inspect
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </ErrorBoundary>
    </PageContainer>
  );
};

export default Overview;
