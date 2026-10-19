import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';

import { api, formatPKT } from '../api/client';
import { RiskBadge } from '../components/RiskBadge';
import { SampleBanner } from '../components/SampleBanner';
import { EmptyState } from '../components/EmptyState';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Skeleton } from '../components/Skeleton';
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

  const overview = overviewResponse?.data;
  const priorities = prioritiesResponse?.data || [];

  // Build combined chart dataset from prediction points
  const heatPoints = overview?.predictions_series?.heat || [];
  const rainPoints = overview?.predictions_series?.heavy_rain || [];

  const chartData = heatPoints.map((hp, idx) => {
    const rp = rainPoints[idx] || {};
    const pktTime = formatPKT(hp.forecast_time, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return {
      forecast_time: hp.forecast_time,
      display_time: `+${hp.hours_ahead}h (${pktTime.split(',')[1]?.trim() || pktTime})`,
      hours_ahead: hp.hours_ahead,
      // Heat hazard metrics
      heat_prob: Math.round(hp.probability * 100),
      heat_ci_base: Math.round(hp.interval_low * 100),
      heat_ci_range: Math.round(Math.max(0, hp.interval_high - hp.interval_low) * 100),
      heat_baseline: Math.round(hp.baseline_value * 100),
      // Rain hazard metrics
      rain_prob: Math.round((rp.probability ?? 0) * 100),
      rain_ci_base: Math.round((rp.interval_low ?? 0) * 100),
      rain_ci_range: Math.round(Math.max(0, (rp.interval_high ?? 0) - (rp.interval_low ?? 0)) * 100),
      rain_baseline: Math.round((rp.baseline_value ?? 0) * 100),
    };
  });

  // Mini Map hotspots dynamically populated from API priorities (Requirement 6)
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
        level: (p?.risk_level || 'Moderate') as RiskLevel,
        desc: p?.action_title || p?.reason || '',
      };
    });
  }, [priorities]);

  if (isOverviewError || isPrioritiesError) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
        <SampleBanner isSample={isSample} />
        <EmptyState
          icon="error"
          title="Telemetry Feed Disconnected"
          description="Unable to retrieve real-time overview data from DuckDB warehouse. Please verify backend connection and try again."
          actionText="Retry Connection"
          onAction={() => {
            refetchOverview();
            refetchPriorities();
          }}
        />
      </div>
    );
  }

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6"
    >
      {/* Sample Data Operational Banner (Rule 2) */}
      <SampleBanner isSample={overviewResponse?.is_sample ?? isSample} />

      {/* Overview Top Bar: Title & Range Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-outline-variant/30">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[26px]">dashboard</span>
            <h1 className="font-headline-lg text-xl sm:text-2xl font-bold text-on-surface tracking-tight">
              Operational Hazard Overview
            </h1>
          </div>
          <p className="font-body-sm text-xs sm:text-sm text-on-surface-variant mt-0.5">
            Real-time multi-hazard telemetry, ensemble probability curves, and ranked municipal interventions for Karachi Division.
          </p>
        </div>

        {/* Range Selector: 24h / 48h / 7d */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          <span className="font-mono text-xs text-on-surface-variant font-semibold uppercase tracking-wider hidden md:inline">
            Horizon:
          </span>
          <div className="flex items-center bg-surface-container-high dark:bg-surface-container-highest/60 rounded-full p-1 shadow-xs border border-outline-variant/40">
            <button
              type="button"
              onClick={() => setTimeRange('24h')}
              className={`min-h-[36px] px-3.5 py-1 rounded-full font-mono text-xs transition-all ${
                timeRange === '24h'
                  ? 'bg-primary text-on-primary font-bold shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Next 24h
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('48h')}
              className={`min-h-[36px] px-3.5 py-1 rounded-full font-mono text-xs transition-all ${
                timeRange === '48h'
                  ? 'bg-primary text-on-primary font-bold shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              48 Hours
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('7d')}
              className={`min-h-[36px] px-3.5 py-1 rounded-full font-mono text-xs transition-all ${
                timeRange === '7d'
                  ? 'bg-primary text-on-primary font-bold shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              7 Days
            </button>
          </div>
        </div>
      </div>

      {/* 4 Key Metric Telemetry Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {isOverviewLoading ? (
          <>
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-44 rounded-2xl" />
          </>
        ) : (
          <>
            {/* Card 1: Thermal Hazard Level */}
            <motion.div
              whileHover={shouldReduceMotion ? undefined : { y: -2 }}
              transition={{ duration: 0.15 }}
              className="bg-surface dark:bg-surface-container-low rounded-2xl p-5 flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow border border-outline-variant/30 dark:border-outline-variant/20 glass-panel"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">
                    Hazard Vector 01
                  </span>
                  <RiskBadge level={overview?.heat_hazard_level || 'Severe'} />
                </div>
                <div className="mt-1">
                  <span className="text-sm font-semibold text-on-surface block">
                    Thermal Hazard Level
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-mono text-3xl sm:text-4xl font-bold tracking-tight text-on-surface">
                      <AnimatedNumber value={overview?.heat_summary?.headline_value ?? 43.8} decimals={1} />°C
                    </span>
                    <span className="text-xs text-on-surface-variant font-medium">
                      Feels Like (WBGT)
                    </span>
                  </div>
                </div>
              </div>

              {/* Uncertainty Range Line Box */}
              <div className="mt-4 pt-2 bg-surface-container-low dark:bg-surface-container-high/40 rounded-xl p-3 flex flex-col gap-1.5 border border-outline-variant/20">
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="text-on-surface-variant">Confidence Band (90%)</span>
                  <span className="font-semibold text-on-surface">
                    {overview?.heat_summary?.interval_low ?? 41.5}°C — {overview?.heat_summary?.interval_high ?? 46.2}°C
                  </span>
                </div>
                {/* Visual uncertainty bar */}
                <div className="w-full bg-surface-container-highest h-2 rounded-full relative overflow-hidden">
                  <div className="absolute left-[35%] right-[15%] h-full bg-[#f97316] rounded-full opacity-80" />
                  <div className="absolute left-[60%] top-0 bottom-0 w-1 bg-[#ba1a1a]" />
                </div>
                <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant mt-0.5">
                  <span className="truncate">{overview?.heat_summary?.source || 'PMD Karachi Met & GFS 0.25°'}</span>
                  <span className="px-1.5 py-0.5 bg-surface-container dark:bg-surface-container-highest text-on-surface-variant rounded uppercase font-mono">
                    [Sample Data]
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Card 2: Rainfall Hazard */}
            <motion.div
              whileHover={shouldReduceMotion ? undefined : { y: -2 }}
              transition={{ duration: 0.15 }}
              className="bg-surface dark:bg-surface-container-low rounded-2xl p-5 flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow border border-outline-variant/30 dark:border-outline-variant/20 glass-panel"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">
                    Hazard Vector 02
                  </span>
                  <RiskBadge level={overview?.rain_hazard_level || 'Moderate'} />
                </div>
                <div className="mt-1">
                  <span className="text-sm font-semibold text-on-surface block">
                    Precipitation Accumulation
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-mono text-3xl sm:text-4xl font-bold tracking-tight text-on-surface">
                      <AnimatedNumber value={overview?.rain_summary?.headline_value ?? 38} decimals={0} />
                    </span>
                    <span className="text-lg font-medium text-on-surface">mm</span>
                    <span className="text-xs text-on-surface-variant">/ {timeRange}</span>
                  </div>
                </div>
              </div>

              {/* Uncertainty Range Line Box */}
              <div className="mt-4 pt-2 bg-surface-container-low dark:bg-surface-container-high/40 rounded-xl p-3 flex flex-col gap-1.5 border border-outline-variant/20">
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="text-on-surface-variant">Ensemble Spread</span>
                  <span className="font-semibold text-on-surface">
                    {overview?.rain_summary?.interval_low ?? 15}mm — {overview?.rain_summary?.interval_high ?? 65}mm
                  </span>
                </div>
                {/* Visual uncertainty bar */}
                <div className="w-full bg-surface-container-highest h-2 rounded-full relative overflow-hidden">
                  <div className="absolute left-[20%] right-[30%] h-full bg-secondary rounded-full opacity-80" />
                  <div className="absolute left-[45%] top-0 bottom-0 w-1 bg-primary" />
                </div>
                <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant mt-0.5">
                  <span className="truncate">{overview?.rain_summary?.source || 'PMD Radar (Badin) + ECMWF'}</span>
                  <span className="px-1.5 py-0.5 bg-surface-container dark:bg-surface-container-highest text-on-surface-variant rounded uppercase font-mono">
                    [Sample Data]
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Card 3: Zones at Severe Risk */}
            <motion.div
              whileHover={shouldReduceMotion ? undefined : { y: -2 }}
              transition={{ duration: 0.15 }}
              className="bg-surface dark:bg-surface-container-low rounded-2xl p-5 flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow border border-outline-variant/30 dark:border-outline-variant/20 glass-panel"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">
                    Vulnerability Status
                  </span>
                  <RiskBadge
                    level={overview && overview.severe_zones_count > 0 ? 'Severe' : 'Low'}
                    label={`${overview?.severe_zones_count ?? 3} Critical`}
                  />
                </div>
                <div className="mt-1">
                  <span className="text-sm font-semibold text-on-surface block">
                    Zones Exceeding Threshold
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-mono text-3xl sm:text-4xl font-bold tracking-tight text-on-surface">
                      <AnimatedNumber value={overview?.severe_zones_count ?? 3} decimals={0} />
                    </span>
                    <span className="text-base text-on-surface-variant font-normal">
                      / {overview?.total_zones_count ?? 7}
                    </span>
                    <span className="text-xs text-on-surface-variant">Karachi Zones</span>
                  </div>
                </div>
              </div>

              {/* Uncertainty Range Line Box */}
              <div className="mt-4 pt-2 bg-surface-container-low dark:bg-surface-container-high/40 rounded-xl p-3 flex flex-col gap-1.5 border border-outline-variant/20">
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="text-on-surface-variant">Distress Hotspots</span>
                  <span className="font-semibold text-error truncate max-w-[150px]">
                    {overview?.severe_zone_names?.slice(0, 2).join(', ') || 'Malir, Central'}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant truncate">
                  Compound runoff &amp; extreme heat trapping
                </p>
                <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant mt-0.5">
                  <span className="truncate">Composite Index (NDMA 2023)</span>
                  <span className="px-1.5 py-0.5 bg-surface-container dark:bg-surface-container-highest text-on-surface-variant rounded uppercase font-mono">
                    [Sample Data]
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Card 4: Data Freshness Status */}
            <motion.div
              whileHover={shouldReduceMotion ? undefined : { y: -2 }}
              transition={{ duration: 0.15 }}
              className="bg-surface dark:bg-surface-container-low rounded-2xl p-5 flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow border border-outline-variant/30 dark:border-outline-variant/20 glass-panel"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">
                    Pipeline Health
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-surface-container-high dark:bg-surface-container-highest text-on-surface font-mono text-xs font-semibold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-secondary text-[16px]">check_circle</span>
                    {overview?.data_freshness_status || 'Nominal'}
                  </span>
                </div>
                <div className="mt-1">
                  <span className="text-sm font-semibold text-on-surface block">
                    Ingestion Integrity
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-mono text-3xl sm:text-4xl font-bold tracking-tight text-on-surface">
                      <AnimatedNumber value={overview?.freshness_summary?.integrity_pct ?? 100} decimals={0} />%
                    </span>
                    <span className="text-xs text-on-surface-variant">
                      {overview?.freshness_summary?.fresh_sources ?? 5}/{overview?.freshness_summary?.total_sources ?? 6} feeds OK
                    </span>
                  </div>
                </div>
              </div>

              {/* Uncertainty Range Line Box */}
              <div className="mt-4 pt-2 bg-surface-container-low dark:bg-surface-container-high/40 rounded-xl p-3 flex flex-col gap-1.5 border border-outline-variant/20">
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="text-on-surface-variant">Lagging Source</span>
                  <span className="font-semibold text-secondary truncate max-w-[130px]">
                    {overview?.freshness_summary?.lagging_source || 'None (In Sync)'}
                  </span>
                </div>
                <div className="flex items-center justify-between font-mono text-xs text-on-surface-variant">
                  <span>Cycle: Micro-Batch</span>
                  <span className="text-secondary font-semibold">T-18m ago</span>
                </div>
                <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant mt-0.5">
                  <span className="truncate">Sindh Gateway Node</span>
                  <span className="px-1.5 py-0.5 bg-surface-container dark:bg-surface-container-highest text-on-surface-variant rounded uppercase font-mono">
                    Telemetry
                  </span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </div>

      {/* Main Operational Workspace: 70% Map & Chart / 30% Decision Support Priorities */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
        {/* Left Column (8 of 12 cols = ~67%) */}
        <div className="lg:col-span-8 flex flex-col gap-space-lg">
          {/* Mini Map Preview Linking to Full Risk Map */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col border border-outline-variant/20">
            {/* Header & Controls */}
            <div className="p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-md bg-surface-container-low border-b border-outline-variant/20">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-secondary text-[22px]">radar</span>
                  <span className="font-title-md text-title-md text-on-surface font-semibold truncate">
                    Karachi Division Urban Hazard Distribution (Mini Preview)
                  </span>
                </div>
                <span className="font-label-mono-sm text-label-mono-sm text-on-surface-variant">
                  Projections: Horizon {timeRange} | High Spatial Resolution (~500m Grid)
                </span>
              </div>

              {/* Direct Link to Full Risk Map */}
              <Link
                to="/risk-map"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-on-secondary rounded-lg font-label-mono-sm text-label-mono-sm font-semibold hover:bg-secondary/90 transition-colors shadow-sm shrink-0"
              >
                <span>Launch Interactive Risk Map</span>
                <span className="material-symbols-outlined text-[16px]">open_in_new</span>
              </Link>
            </div>

            {/* Interactive Vector Canvas Preview */}
            <div className="relative w-full h-[380px] bg-[#0c1f33] overflow-hidden select-none">
              <svg className="w-full h-full object-cover" viewBox="0 0 900 440" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="sea-grad" x1="0" y1="440" x2="900" y2="440" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#051424" />
                    <stop offset="100%" stopColor="#092038" />
                  </linearGradient>
                </defs>
                <rect width="900" height="440" fill="url(#sea-grad)" />

                {/* Sea waves */}
                <path d="M 40 390 Q 90 380 140 390 T 240 390" stroke="#1e3a5f" strokeWidth="1.5" strokeDasharray="4 6" />
                <path d="M 120 420 Q 180 410 240 420 T 360 420" stroke="#1e3a5f" strokeWidth="1.5" strokeDasharray="4 6" />
                <text x="50" y="425" fill="#476d99" fontFamily="JetBrains Mono" fontSize="11" letterSpacing="2">
                  ARABIAN SEA (MANORA CHANNEL)
                </text>

                {/* Zones Polygons (Stylized) */}
                {/* Malir Basin (East - Severe) */}
                <path
                  d="M 640 130 L 880 110 L 870 300 L 670 290 L 670 210 Z"
                  fill="#b91c1c"
                  fillOpacity="0.45"
                  stroke="#ef4444"
                  strokeWidth="2"
                  className="cursor-pointer hover:fill-opacity-70 transition-all"
                  onClick={() => navigate('/risk-map?zone=KHI-MALIR')}
                />
                <text x="700" y="200" fill="#fecaca" fontFamily="JetBrains Mono" fontSize="11" fontWeight="bold">
                  MALIR (CRITICAL)
                </text>

                {/* Central / Gulshan (Mid-East - Severe) */}
                <path
                  d="M 420 120 L 640 130 L 670 210 L 490 220 L 410 170 Z"
                  fill="#b91c1c"
                  fillOpacity="0.4"
                  stroke="#ef4444"
                  strokeWidth="1.8"
                  className="cursor-pointer hover:fill-opacity-70 transition-all"
                  onClick={() => navigate('/risk-map?zone=KHI-CENTRAL')}
                />
                <text x="470" y="175" fill="#fee2e2" fontFamily="JetBrains Mono" fontSize="11" fontWeight="600">
                  CENTRAL (HEAT ALERT)
                </text>

                {/* Orangi & West (North-West - High) */}
                <path
                  d="M 190 70 L 290 60 L 410 120 L 350 190 L 190 160 Z"
                  fill="#ea580c"
                  fillOpacity="0.4"
                  stroke="#f97316"
                  strokeWidth="1.5"
                  className="cursor-pointer hover:fill-opacity-70 transition-all"
                  onClick={() => navigate('/risk-map?zone=KHI-WEST')}
                />
                <text x="220" y="125" fill="#fed7aa" fontFamily="JetBrains Mono" fontSize="11" fontWeight="600">
                  ORANGI / SITE
                </text>

                {/* Korangi Industrial & Creek (South-East - Severe Flood) */}
                <path
                  d="M 490 220 L 670 210 L 670 320 L 480 330 Z"
                  fill="#b91c1c"
                  fillOpacity="0.5"
                  stroke="#ef4444"
                  strokeWidth="2"
                  className="cursor-pointer hover:fill-opacity-70 transition-all"
                  onClick={() => navigate('/risk-map?zone=KHI-KORANGI')}
                />
                <text x="520" y="275" fill="#fee2e2" fontFamily="JetBrains Mono" fontSize="11" fontWeight="bold">
                  KORANGI (FLOOD PRONE)
                </text>

                {/* Lyari / South (Central Dense - Moderate) */}
                <path
                  d="M 230 180 L 350 190 L 360 255 L 250 250 Z"
                  fill="#d97706"
                  fillOpacity="0.35"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                  className="cursor-pointer hover:fill-opacity-60 transition-all"
                  onClick={() => navigate('/risk-map?zone=KHI-SOUTH')}
                />
                <text x="260" y="225" fill="#fef08a" fontFamily="JetBrains Mono" fontSize="11" fontWeight="600">
                  SADDAR / LYARI
                </text>

                {/* Kemari / Port Zone (South-West Coastal) */}
                <path
                  d="M 120 180 L 230 180 L 250 250 L 220 330 L 90 280 Z"
                  fill="#006398"
                  fillOpacity="0.4"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                  className="cursor-pointer hover:fill-opacity-60 transition-all"
                  onClick={() => navigate('/risk-map?zone=KHI-KEAMARI')}
                />
                <text x="120" y="255" fill="#bae6fd" fontFamily="JetBrains Mono" fontSize="11" fontWeight="600">
                  KEAMARI PORT
                </text>

                {/* Major Drains: Gujjar Nullah & Malir River */}
                <path d="M 390 80 Q 380 140 340 185" stroke="#38bdf8" strokeWidth="2" strokeDasharray="3 3" />
                <path d="M 680 150 Q 610 230 540 330" stroke="#38bdf8" strokeWidth="3" />
                <text x="610" y="270" fill="#38bdf8" fontFamily="JetBrains Mono" fontSize="9">
                  Malir Basin Channel
                </text>
              </svg>

              {/* Interactive Pulsing Hotspot Pins */}
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
                        hs.level === 'Severe' ? 'bg-error' : hs.level === 'High' ? 'bg-[#f97316]' : 'bg-[#eab308]'
                      }`}
                    />
                    <span
                      className={`relative inline-flex rounded-full h-3.5 w-3.5 border-2 border-white shadow-md ${
                        hs.level === 'Severe' ? 'bg-error' : hs.level === 'High' ? 'bg-[#f97316]' : 'bg-[#eab308]'
                      }`}
                    />
                  </div>

                  {/* Hotspot Floating Tooltip */}
                  <div className="hidden group-hover:block absolute bottom-6 left-1/2 -translate-x-1/2 bg-primary-container text-on-primary rounded-lg px-2.5 py-1.5 shadow-xl text-center whitespace-nowrap z-30 pointer-events-none">
                    <div className="font-label-mono-sm text-[11px] font-bold">{hs.name}</div>
                    <div className="font-body-sm text-[10px] text-on-primary-container">{hs.desc}</div>
                    <div className="text-[9px] text-secondary font-semibold mt-0.5">Click to view in Risk Map →</div>
                  </div>
                </div>
              ))}

              {/* Floating Zone Inspector HUD */}
              <div className="absolute top-3 left-3 bg-primary-container/95 backdrop-blur text-on-primary rounded-xl p-space-sm max-w-[260px] shadow-xl border border-white/10 pointer-events-none">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-label-mono-sm text-[10px] uppercase text-secondary font-bold">
                    Zone Inspector
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-error font-label-mono-sm text-[9px] text-on-error font-bold">
                    3 SEVERE ZONES
                  </span>
                </div>
                <div className="font-title-md text-title-md font-semibold text-on-primary mt-0.5">
                  {hoveredZone
                    ? mapHotspots.find((h) => h.id === hoveredZone)?.name
                    : 'Karachi Metropolitan Area'}
                </div>
                <div className="mt-1.5 space-y-0.5 font-label-mono-sm text-[11px]">
                  <div className="flex justify-between text-on-primary-container">
                    <span>Active Horizon:</span>
                    <span className="text-on-primary font-bold">{timeRange}</span>
                  </div>
                  <div className="flex justify-between text-on-primary-container">
                    <span>Compound Vulnerability:</span>
                    <span className="text-error font-bold">Critical (Malir/Central)</span>
                  </div>
                </div>
              </div>

              {/* Legend Footer */}
              <div className="absolute bottom-2 left-2 right-2 bg-primary-container/90 backdrop-blur rounded-lg px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-on-primary font-label-mono-sm text-[11px]">
                <div className="flex items-center gap-3">
                  <span className="text-on-primary-container font-semibold">Tiers:</span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-error" /> Severe (Red Alert)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#f97316]" /> High (Warning)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#eab308]" /> Moderate (Watch)
                  </span>
                </div>
                <Link to="/risk-map" className="text-secondary hover:underline flex items-center gap-1 font-semibold">
                  <span>Open Risk Map</span>
                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Recharts Line Chart: Hazard Probability with Shaded Interval Band & Climatology Baseline */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-md flex flex-col gap-space-md border border-outline-variant/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm pb-space-xs border-b border-outline-variant/20">
              <div className="flex flex-col">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-secondary text-[20px]">show_chart</span>
                  <span className="font-title-md text-title-md text-on-surface font-semibold">
                    {timeRange === '24h'
                      ? '24-Hour'
                      : timeRange === '48h'
                      ? '48-Hour'
                      : '7-Day'}{' '}
                    Ensemble Hazard Probability &amp; Uncertainty Timeline
                  </span>
                </div>
                <span className="font-label-mono-sm text-label-mono-sm text-on-surface-variant">
                  Ensemble NWP Forecast vs 30-Year Climatological Norm (Karachi Met Office WMO 41780)
                </span>
              </div>

              {/* Hazard Mode Switcher (Heat / Rain / Both) */}
              <div className="flex items-center bg-surface-container-high p-1 rounded-lg self-start sm:self-center">
                <button
                  type="button"
                  onClick={() => setActiveHazardView('heat')}
                  className={`px-2.5 py-1 rounded font-label-mono-sm text-label-mono-sm transition-all ${
                    activeHazardView === 'heat'
                      ? 'bg-primary text-on-primary font-bold shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Heat Wave
                </button>
                <button
                  type="button"
                  onClick={() => setActiveHazardView('heavy_rain')}
                  className={`px-2.5 py-1 rounded font-label-mono-sm text-label-mono-sm transition-all ${
                    activeHazardView === 'heavy_rain'
                      ? 'bg-primary text-on-primary font-bold shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Heavy Rain
                </button>
                <button
                  type="button"
                  onClick={() => setActiveHazardView('both')}
                  className={`px-2.5 py-1 rounded font-label-mono-sm text-label-mono-sm transition-all ${
                    activeHazardView === 'both'
                      ? 'bg-primary text-on-primary font-bold shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Both Hazards
                </button>
              </div>
            </div>

            {/* Recharts Area + Line Chart */}
            <div className="w-full h-72 bg-surface-container-low rounded-lg p-2 select-none">
              {isOverviewLoading ? (
                <div className="h-full flex items-center justify-center font-label-mono-sm text-on-surface-variant">
                  Loading ensemble projection series...
                </div>
              ) : chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center font-label-mono-sm text-on-surface-variant">
                  No prediction data available for {timeRange}.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 15, right: 25, left: 0, bottom: 5 }}>
                    <XAxis
                      dataKey="display_time"
                      stroke="#74777e"
                      fontSize={11}
                      tickLine={false}
                      fontFamily="JetBrains Mono"
                    />
                    <YAxis
                      stroke="#74777e"
                      fontSize={11}
                      tickFormatter={(v) => `${v}%`}
                      domain={[0, 100]}
                      tickLine={false}
                      fontFamily="JetBrains Mono"
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const d = payload[0]?.payload;
                        return (
                          <div className="bg-primary-container text-on-primary p-space-sm rounded-lg shadow-xl text-xs font-mono space-y-1 border border-white/10">
                            <div className="font-bold text-secondary-container">{d.display_time}</div>
                            {activeHazardView !== 'heavy_rain' && (
                              <div className="border-t border-white/10 pt-1">
                                <div className="text-[#ffb77d] font-bold">Heat Hazard Probability: {d.heat_prob}%</div>
                                <div className="text-on-primary-container text-[11px]">
                                  90% CI: {d.heat_ci_base}% — {d.heat_ci_base + d.heat_ci_range}%
                                </div>
                                <div className="text-on-surface-variant text-[10px]">
                                  Climatology Baseline: {d.heat_baseline}%
                                </div>
                              </div>
                            )}
                            {activeHazardView !== 'heat' && (
                              <div className="border-t border-white/10 pt-1">
                                <div className="text-[#38bdf8] font-bold">Rain Hazard Probability: {d.rain_prob}%</div>
                                <div className="text-on-primary-container text-[11px]">
                                  90% CI: {d.rain_ci_base}% — {d.rain_ci_base + d.rain_ci_range}%
                                </div>
                                <div className="text-on-surface-variant text-[10px]">
                                  Climatology Baseline: {d.rain_baseline}%
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={32}
                      formatter={(val) => <span className="font-label-mono-sm text-xs text-on-surface">{val}</span>}
                    />
                    {/* Critical Alert Threshold line at 75% */}
                    <ReferenceLine
                      y={75}
                      stroke="#ba1a1a"
                      strokeDasharray="4 4"
                      label={{
                        value: 'Critical Risk Threshold (75%)',
                        fill: '#ba1a1a',
                        fontSize: 10,
                        position: 'insideTopRight',
                      }}
                    />

                    {/* Heat Hazard Series: Shaded Interval Band + Line */}
                    {activeHazardView !== 'heavy_rain' && (
                      <>
                        <Area
                          type="monotone"
                          dataKey="heat_ci_base"
                          stackId="heat_ci"
                          fill="transparent"
                          stroke="none"
                          legendType="none"
                          isAnimationActive={!shouldReduceMotion}
                          animationDuration={800}
                        />
                        <Area
                          type="monotone"
                          dataKey="heat_ci_range"
                          stackId="heat_ci"
                          fill="#d97706"
                          fillOpacity={0.16}
                          stroke="none"
                          name="Heat 90% CI Band"
                          isAnimationActive={!shouldReduceMotion}
                          animationDuration={800}
                        />
                        <Line
                          type="monotone"
                          dataKey="heat_prob"
                          stroke="#d97706"
                          strokeWidth={2.5}
                          dot={{ r: 3.5 }}
                          activeDot={{ r: 5 }}
                          name="Heat Model Probability"
                          isAnimationActive={!shouldReduceMotion}
                          animationDuration={800}
                        />
                        <Line
                          type="monotone"
                          dataKey="heat_baseline"
                          stroke="#74777e"
                          strokeDasharray="4 4"
                          strokeWidth={1.5}
                          dot={false}
                          name="Heat Climatology Baseline"
                          isAnimationActive={!shouldReduceMotion}
                          animationDuration={800}
                        />
                      </>
                    )}

                    {/* Rain Hazard Series: Shaded Interval Band + Line */}
                    {activeHazardView !== 'heat' && (
                      <>
                        <Area
                          type="monotone"
                          dataKey="rain_ci_base"
                          stackId="rain_ci"
                          fill="transparent"
                          stroke="none"
                          legendType="none"
                          isAnimationActive={!shouldReduceMotion}
                          animationDuration={800}
                        />
                        <Area
                          type="monotone"
                          dataKey="rain_ci_range"
                          stackId="rain_ci"
                          fill="#006398"
                          fillOpacity={0.18}
                          stroke="none"
                          name="Rain 90% CI Band"
                          isAnimationActive={!shouldReduceMotion}
                          animationDuration={800}
                        />
                        <Line
                          type="monotone"
                          dataKey="rain_prob"
                          stroke="#006398"
                          strokeWidth={2.5}
                          dot={{ r: 3.5 }}
                          activeDot={{ r: 5 }}
                          name="Rain Model Probability"
                          isAnimationActive={!shouldReduceMotion}
                          animationDuration={800}
                        />
                        <Line
                          type="monotone"
                          dataKey="rain_baseline"
                          stroke="#74777e"
                          strokeDasharray="6 6"
                          strokeWidth={1.5}
                          dot={false}
                          name="Rain Climatology Baseline"
                          isAnimationActive={!shouldReduceMotion}
                          animationDuration={800}
                        />
                      </>
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="flex items-center justify-between text-on-surface-variant font-label-mono-sm text-label-mono-sm pt-1">
              <span className="truncate">
                Shaded band represents 90% ensemble spread across GFS 0.25° and ECMWF IFS NWP runs.
              </span>
              <span className="px-1.5 py-0.5 bg-surface-container rounded text-[10px] uppercase font-mono shrink-0">
                WMO Station 41780
              </span>
            </div>
          </div>
        </div>

        {/* Right Column (4 of 12 cols = ~33%): Ranked Priority Actions Panel */}
        <div className="lg:col-span-4 flex flex-col gap-space-md">
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-md flex flex-col gap-space-md border border-outline-variant/20">
            <div className="flex flex-col gap-space-xs">
              <div className="flex items-center justify-between">
                <span className="font-label-mono-sm text-label-mono-sm uppercase text-secondary font-semibold tracking-wider">
                  Decision Support System
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-error text-on-error font-label-mono-sm text-label-mono-sm font-semibold">
                  {priorities.length} Actions Pinned
                </span>
              </div>
              <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                Ranked Priority Actions
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Algorithmic risk ranking by severity level then exposed population from <code className="text-secondary font-mono">exposure_index</code>.
              </p>
            </div>

            {/* Filter Pills for Priorities */}
            <div className="flex items-center gap-1.5 bg-surface-container p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setPriorityHazardFilter('all')}
                className={`flex-1 py-1 px-2 rounded font-label-mono-sm text-xs transition-colors ${
                  priorityHazardFilter === 'all'
                    ? 'bg-primary text-on-primary font-bold shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                All ({priorities.length})
              </button>
              <button
                type="button"
                onClick={() => setPriorityHazardFilter('heat')}
                className={`flex-1 py-1 px-2 rounded font-label-mono-sm text-xs transition-colors ${
                  priorityHazardFilter === 'heat'
                    ? 'bg-primary text-on-primary font-bold shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Heat
              </button>
              <button
                type="button"
                onClick={() => setPriorityHazardFilter('heavy_rain')}
                className={`flex-1 py-1 px-2 rounded font-label-mono-sm text-xs transition-colors ${
                  priorityHazardFilter === 'heavy_rain'
                    ? 'bg-primary text-on-primary font-bold shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Rain
              </button>
            </div>

            {/* Action Items List */}
            <div className="flex flex-col gap-space-sm max-h-[700px] overflow-y-auto pr-1">
              {isPrioritiesLoading ? (
                <div className="py-8 text-center font-label-mono-sm text-on-surface-variant">
                  Computing priority directives...
                </div>
              ) : priorities.length === 0 ? (
                <div className="py-8 text-center font-label-mono-sm text-on-surface-variant">
                  No priority interventions match active filters.
                </div>
              ) : (
                priorities.map((item) => (
                  <div
                    key={`${item.zone_id}-${item.hazard_type}-${item.rank}`}
                    className="bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-xs relative overflow-hidden transition-all hover:bg-surface-container border border-outline-variant/15"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-label-mono-sm text-label-mono-sm font-bold uppercase tracking-wider text-secondary">
                        #{item.rank} Priority Intervention
                      </span>
                      <RiskBadge level={item.risk_level} />
                    </div>

                    <div className="font-title-md text-title-md text-on-surface font-semibold mt-1">
                      {item.action_title}
                    </div>

                    <div className="flex items-center gap-1 font-label-mono-sm text-label-mono-sm text-secondary font-medium">
                      <span className="material-symbols-outlined text-[16px]">location_on</span>
                      <span>{item.zone_name}</span>
                    </div>

                    {/* Rule-Based Reason String Built Exclusively from Table Fields */}
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 leading-relaxed bg-surface-container-lowest/60 p-2 rounded border border-outline-variant/20">
                      {item.reason}
                    </p>

                    <div className="mt-space-xs pt-space-xs flex items-center justify-between font-label-mono-sm text-label-mono-sm border-t border-outline-variant/20">
                      {/* View Evidence Link Opening Risk Map with Zone Selected */}
                      <Link
                        to={`/risk-map?zone=${item.zone_id}`}
                        className="text-secondary font-semibold hover:underline flex items-center gap-1 group"
                      >
                        <span>View Evidence in Risk Map</span>
                        <span className="material-symbols-outlined text-[16px] group-hover:translate-x-0.5 transition-transform">
                          arrow_forward
                        </span>
                      </Link>
                      <span className="px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface-variant text-[10px] uppercase font-mono">
                        Score: {item.score}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Quick Dispatch Actions Footer Bar */}
            <div className="mt-space-xs p-space-sm bg-surface-container rounded-lg flex flex-col gap-space-sm border border-outline-variant/20">
              <button
                type="button"
                onClick={() => alert(`Directives dispatched to KMC Command Cell for ${priorities.length} priority zones.`)}
                className="w-full py-2.5 px-4 bg-primary text-on-primary rounded-lg font-title-md text-title-md hover:bg-primary-container transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">send_time_extension</span>
                <span>Broadcast Directives to KMC Cell</span>
              </button>
              <div className="flex items-center justify-between text-on-surface-variant font-label-mono-sm text-label-mono-sm">
                <span>Automated SMS/Tetra Relay</span>
                <span className="text-secondary font-bold">18 Towns Subscribed</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
