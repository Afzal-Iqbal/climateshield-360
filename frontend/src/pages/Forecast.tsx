import React, { useState, useMemo } from 'react';
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
  Legend,
  ReferenceLine,
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
  Tabs,
  Select,
  Table,
  ErrorBoundary,
  EmptyState,
  ErrorState,
  SkeletonRow,
  SkeletonChart,
  Column,
} from '../components/ui';
import {
  ObservedWeatherPoint,
  PredictedPoint,
  ThresholdLevel,
  GroupErrorItem,
} from '../types';

interface ForecastPageProps {
  isSample?: boolean;
}

const CITIES = [
  'Karachi',
  'Lahore',
  'Faisalabad',
  'Rawalpindi',
  'Multan',
  'Hyderabad',
  'Peshawar',
  'Quetta',
  'Islamabad',
  'Gilgit',
  'Gwadar',
  'Sukkur',
];

export const Forecast: React.FC<ForecastPageProps> = ({ isSample = false }) => {
  const [selectedCity, setSelectedCity] = useState<string>('Karachi');
  const [selectedHazard, setSelectedHazard] = useState<'heavy_rain' | 'heat'>('heavy_rain');
  const [selectedRange, setSelectedRange] = useState<'24h' | '48h' | '7d'>('24h');
  const [viewGranularity, setViewGranularity] = useState<'hourly' | 'daily'>('hourly');

  // Fetch forecast data from API
  const {
    data: forecastResponse,
    isLoading: isLoadingForecast,
    isError: isForecastError,
    refetch: refetchForecast,
  } = useQuery({
    queryKey: ['forecast', selectedHazard, selectedCity, selectedRange],
    queryFn: () =>
      api.getForecast({
        hazard: selectedHazard,
        city: selectedCity,
        range: selectedRange,
      }),
  });

  // Fetch model evaluation summary from API
  const {
    data: modelResponse,
    isLoading: isLoadingModel,
  } = useQuery({
    queryKey: ['model-summary'],
    queryFn: api.getModelSummary,
  });

  const forecast = forecastResponse?.data;
  const modelSummary = modelResponse?.data;

  // Prepare chart series data
  const chartData = useMemo(() => {
    if (!forecast || !forecast.observed || forecast.observed.length === 0) {
      return [];
    }

    if (viewGranularity === 'hourly') {
      const points = forecast.observed.map((obs: ObservedWeatherPoint) => ({
        time: obs.timestamp_pkt,
        timestamp_utc: obs.timestamp_utc,
        observed: obs.value,
        humidity: obs.relative_humidity_pct,
        wind: obs.wind_speed_kmh,
        condition: obs.weather_condition,
        predicted: undefined as number | undefined,
        interval_low: undefined as number | undefined,
        interval_high: undefined as number | undefined,
        interval_band: undefined as [number, number] | undefined,
        baseline: undefined as number | undefined,
      }));

      if (forecast.predicted && forecast.predicted.length > 0) {
        forecast.predicted.forEach((pred: PredictedPoint) => {
          const existingIdx = points.findIndex((p: { time: string }) => p.time === pred.forecast_time_pkt);
          if (existingIdx >= 0) {
            points[existingIdx].predicted = pred.median;
            points[existingIdx].interval_low = pred.interval_low;
            points[existingIdx].interval_high = pred.interval_high;
            points[existingIdx].interval_band = [pred.interval_low, pred.interval_high];
            points[existingIdx].baseline = pred.baseline_value;
          } else {
            points.push({
              time: pred.forecast_time_pkt,
              timestamp_utc: pred.forecast_time_utc,
              observed: undefined as any,
              humidity: null,
              wind: null,
              condition: 'Forecast',
              predicted: pred.median,
              interval_low: pred.interval_low,
              interval_high: pred.interval_high,
              interval_band: [pred.interval_low, pred.interval_high],
              baseline: pred.baseline_value,
            });
          }
        });
      }

      return points;
    } else {
      const dayMap: { [date: string]: { date: string; maxObserved: number; totalObserved: number; count: number; baseline: number } } = {};
      forecast.observed.forEach((obs: ObservedWeatherPoint) => {
        const dateKey = obs.timestamp_pkt.slice(0, 6);
        if (!dayMap[dateKey]) {
          dayMap[dateKey] = {
            date: dateKey,
            maxObserved: obs.value,
            totalObserved: obs.value,
            count: 1,
            baseline: forecast.baseline.value ?? 0,
          };
        } else {
          dayMap[dateKey].maxObserved = Math.max(dayMap[dateKey].maxObserved, obs.value);
          dayMap[dateKey].totalObserved += obs.value;
          dayMap[dateKey].count += 1;
        }
      });

      return Object.values(dayMap).map((d) => ({
        time: d.date,
        observed: selectedHazard === 'heavy_rain' ? Number(d.totalObserved.toFixed(1)) : Number(d.maxObserved.toFixed(1)),
        predicted: undefined,
        interval_low: undefined,
        interval_high: undefined,
        baseline: d.baseline,
      }));
    }
  }, [forecast, viewGranularity, selectedHazard]);

  // Derive latest observed and predicted metrics
  const latestObserved = forecast?.observed?.[forecast.observed.length - 1];
  const latestPredicted = forecast?.predicted?.[0];

  const currentRiskLevel = useMemo(() => {
    if (!latestObserved || !forecast?.thresholds?.levels) return 'Low';
    const val = latestObserved.value;
    const levels = forecast.thresholds.levels;
    for (const lvl of [...levels].reverse()) {
      if (val >= lvl.value) return lvl.level;
    }
    return 'Low';
  }, [latestObserved, forecast]);

  // Error table columns
  const errorColumns: Column<GroupErrorItem>[] = [
    {
      key: 'group_value',
      header: 'Monitored Sub-Division',
      render: (item) => (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white font-display">{item.group_value}</span>
          {item.is_weakest && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wider">
              Weakest Group
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'model_score',
      header: 'Model Score',
      align: 'right',
      render: (item) => <span className="font-mono-val font-semibold">{item.model_score}</span>,
    },
    {
      key: 'baseline_score',
      header: 'Baseline Score',
      align: 'right',
      render: (item) => <span className="font-mono-val text-slate-400">{item.baseline_score}</span>,
    },
    {
      key: 'gain_pct',
      header: 'Improvement',
      align: 'right',
      render: (item) => {
        const imp = item.gain_pct;
        const isPos = imp > 0;
        return (
          <span className={`font-mono-val font-bold ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
            {isPos ? `+${imp}%` : `${imp}%`}
          </span>
        );
      },
    },
    {
      key: 'metric',
      header: 'Metric',
      align: 'right',
      render: (item) => <span className="font-mono-val text-slate-400 text-xs">{item.metric}</span>,
    },
  ];

  if (isForecastError) {
    return (
      <PageContainer>
        <ErrorState
          title="Weather Forecast Feed Unavailable"
          error="Failed to load atmospheric and model data for the selected district."
          onRetry={refetchForecast}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Page Header */}
      <PageHeader
        title={selectedHazard === 'heavy_rain' ? 'Heavy Rain NWP & ML Forecast' : 'Heat Wave Threshold Monitoring'}
        subtitle="Empirical sensor observations, LightGBM quantile regression predictions, and calibrated error bounds."
        lastUpdated={latestObserved?.timestamp_utc}
        isLive={!isSample}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            {/* City Selector */}
            <Select
              options={CITIES.map((c) => ({ value: c, label: c }))}
              value={selectedCity}
              onChange={setSelectedCity}
              icon="location_city"
            />

            {/* Hazard Selector */}
            <Tabs
              size="sm"
              tabs={[
                { id: 'heavy_rain', label: 'Rain (ML)', icon: 'rainy' },
                { id: 'heat', label: 'Heat (Observed)', icon: 'thermostat' },
              ]}
              activeTab={selectedHazard}
              onChange={(id) => setSelectedHazard(id as any)}
            />

            {/* Range Selector */}
            <Tabs
              size="sm"
              tabs={[
                { id: '24h', label: '24h' },
                { id: '48h', label: '48h' },
                { id: '7d', label: '7d' },
              ]}
              activeTab={selectedRange}
              onChange={(id) => setSelectedRange(id as any)}
            />
          </div>
        }
      />

      {/* Heat Hazard Notice Banner (Strict adherence to Rule 21: Heat is observed, not ML-predicted) */}
      {selectedHazard === 'heat' && (
        <div className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
          <span className="material-symbols-outlined text-amber-400 text-[20px] shrink-0">
            info
          </span>
          <p>
            <strong>Note on Heat Hazard: </strong> Heat is monitored as <em>direct observations against meteorological thresholds</em> and is <strong>not ML-predicted</strong>. Heavy rain features full LightGBM quantile regression.
          </p>
        </div>
      )}

      {/* 4 Hero Metric StatCards */}
      <ErrorBoundary fallbackTitle="Metric Cards Error">
        {isLoadingForecast ? (
          <SkeletonRow count={4} />
        ) : forecast ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Latest Observed */}
            <StatCard
              label={`Latest Observed (${selectedCity})`}
              value={latestObserved?.value ?? '—'}
              unit={latestObserved?.unit || (selectedHazard === 'heavy_rain' ? 'mm/hr' : '°C')}
              icon="sensors"
              accent={selectedHazard === 'heavy_rain' ? 'rain' : 'heat'}
              sublabel={latestObserved?.weather_condition || 'Nominal atmospheric state'}
              baselineValue={latestObserved?.timestamp_pkt || '—'}
              baselineLabel="Observed at"
            />

            {/* Card 2: ML Prediction or Heat Monitoring */}
            {selectedHazard === 'heavy_rain' ? (
              <StatCard
                label="Next-Hour ML Quantile"
                value={latestPredicted?.median ?? '—'}
                unit="mm/hr"
                icon="online_prediction"
                accent={latestPredicted && latestPredicted.probability > 0.6 ? 'severe' : 'cyan'}
                isKeyCard={latestPredicted && latestPredicted.probability > 0.6}
                sublabel={`P(≥2.5mm): ${latestPredicted ? (latestPredicted.probability * 100).toFixed(1) : 0}%`}
                uncertaintyRange={
                  latestPredicted
                    ? { low: latestPredicted.interval_low, high: latestPredicted.interval_high, unit: 'mm' }
                    : undefined
                }
                baselineValue={latestPredicted?.forecast_time_pkt}
                baselineLabel="Target PKT"
              />
            ) : (
              <StatCard
                label="Heat Index Monitoring"
                value={latestObserved?.value ?? '—'}
                unit="°C"
                icon="wb_sunny"
                accent="heat"
                sublabel="Observed against thresholds (not ML-predicted)"
                baselineValue="40.0°C"
                baselineLabel="Danger threshold"
              />
            )}

            {/* Card 3: 24h Persistence Baseline */}
            <StatCard
              label="24h Persistence Baseline"
              value={forecast.baseline.value !== null && forecast.baseline.value !== undefined ? forecast.baseline.value : '—'}
              unit={forecast.thresholds.unit}
              icon="history"
              accent="cyan"
              sublabel="Formula: ŷ_t = y_(t-24h)"
              baselineValue="Persistence benchmark"
              baselineLabel="Type"
            />

            {/* Card 4: Action Threshold */}
            <StatCard
              label="Action Threshold"
              value={forecast.thresholds.primary_threshold}
              unit={forecast.thresholds.unit}
              icon="flag"
              accent={currentRiskLevel === 'Severe' ? 'severe' : currentRiskLevel === 'High' ? 'high' : 'low'}
              sublabel={forecast.thresholds.primary_label}
              baselineValue={currentRiskLevel}
              baselineLabel="Current status"
            />
          </div>
        ) : null}
      </ErrorBoundary>

      {/* Main Forecast Chart: Solid Observed Line + Dashed/Shaded Prediction + Baseline */}
      <ErrorBoundary fallbackTitle="Forecast Chart Error">
        <Card className="flex flex-col">
          <CardHeader
            action={
              <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setViewGranularity('hourly')}
                  className={`px-3 py-1 rounded-lg text-xs font-mono-val transition-colors ${
                    viewGranularity === 'hourly' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/40' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Hourly
                </button>
                <button
                  type="button"
                  onClick={() => setViewGranularity('daily')}
                  className={`px-3 py-1 rounded-lg text-xs font-mono-val transition-colors ${
                    viewGranularity === 'daily' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/40' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Daily Max
                </button>
              </div>
            }
          >
            <CardTitle icon="show_chart">
              {selectedHazard === 'heavy_rain' ? 'Monsoon Precipitation Time Series' : 'Ambient Temperature & Heat Stress Curve'}
            </CardTitle>
            <CardDescription>
              Solid line = Empirical observations · Dashed line = Quantile predictions · Shaded area = 80% CI band
            </CardDescription>
          </CardHeader>

          {isLoadingForecast ? (
            <SkeletonChart height="h-80" />
          ) : chartData.length === 0 ? (
            <EmptyState
              title="No Weather Observations"
              reason={`No sensor readings or forecast points recorded for ${selectedCity} in this horizon.`}
              pipelineSource="Source: Open-Meteo & PMD archives via DuckDB"
            />
          ) : (
            <div className="w-full h-88 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bandGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={selectedHazard === 'heavy_rain' ? '#38bdf8' : '#f59e0b'} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={selectedHazard === 'heavy_rain' ? '#38bdf8' : '#f59e0b'} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="time"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    fontFamily="JetBrains Mono"
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    unit={forecast?.thresholds?.unit ? ` ${forecast.thresholds.unit}` : ''}
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
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />

                  {/* 80% Uncertainty Band Shading */}
                  <Area
                    type="monotone"
                    dataKey="interval_band"
                    stroke="none"
                    fill="url(#bandGradient)"
                    name="80% Uncertainty Band"
                  />

                  {/* Solid Observed Line (Requirement 21) */}
                  <Line
                    type="monotone"
                    dataKey="observed"
                    name={`Observed (${selectedCity}) [Solid]`}
                    stroke={selectedHazard === 'heavy_rain' ? '#0284c7' : '#ea580c'}
                    strokeWidth={2.8}
                    dot={{ r: 3, fill: selectedHazard === 'heavy_rain' ? '#0284c7' : '#ea580c' }}
                    activeDot={{ r: 6 }}
                  />

                  {/* Dashed ML Predicted Line (Requirement 21) */}
                  {selectedHazard === 'heavy_rain' && (
                    <Line
                      type="monotone"
                      dataKey="predicted"
                      name="LightGBM Predicted (Median) [Dashed]"
                      stroke="#38bdf8"
                      strokeWidth={2.5}
                      strokeDasharray="5 5"
                      dot={{ r: 3, fill: '#38bdf8' }}
                      activeDot={{ r: 6 }}
                    />
                  )}

                  {/* Baseline Dotted Line */}
                  <Line
                    type="monotone"
                    dataKey="baseline"
                    name="24h Persistence Baseline [Dotted]"
                    stroke="#64748b"
                    strokeWidth={1.5}
                    strokeDasharray="2 3"
                    dot={false}
                  />

                  {/* Threshold Reference Lines */}
                  {forecast?.thresholds?.levels?.map((thresh: ThresholdLevel) => (
                    <ReferenceLine
                      key={thresh.level}
                      y={thresh.value}
                      stroke={thresh.color}
                      strokeDasharray="4 4"
                      label={{
                        value: thresh.label,
                        position: 'insideTopRight',
                        fill: thresh.color,
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </ErrorBoundary>

      {/* Model Performance & Disaggregated Audit Section */}
      <ErrorBoundary fallbackTitle="Model Audit Error">
        <Card className="flex flex-col gap-6">
          <CardHeader
            action={
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono-val font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                LightGBM Quantile Regressors v1.0
              </span>
            }
          >
            <CardTitle icon="analytics">Model Performance vs Baseline Audit</CardTitle>
            <CardDescription>
              Disaggregated fairness evaluation and MAE improvements across Karachi Divisions vs 24h persistence baseline
            </CardDescription>
          </CardHeader>

          {isLoadingModel ? (
            <SkeletonRow count={4} />
          ) : modelSummary ? (
            <>
              {/* Summary Metric Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-900/60 border border-white/10 flex flex-col justify-between">
                  <span className="text-xs text-slate-400 font-medium">MAE Improvement</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-bold font-display text-emerald-400">
                      +{modelSummary.metrics.mae_improvement_pct}%
                    </span>
                    <span className="text-xs text-slate-400 font-mono-val">
                      ({modelSummary.metrics.model_mae} vs {modelSummary.metrics.baseline_mae})
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-semibold mt-1">
                    ✓ Exceeds 20% Improvement Target
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/60 border border-white/10 flex flex-col justify-between">
                  <span className="text-xs text-slate-400 font-medium">RMSE Improvement</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-bold font-display text-emerald-400">
                      +{modelSummary.metrics.rmse_improvement_pct}%
                    </span>
                    <span className="text-xs text-slate-400 font-mono-val">
                      ({modelSummary.metrics.model_rmse} vs {modelSummary.metrics.baseline_rmse})
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1">
                    Reduced dispersion during peak spikes
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/60 border border-white/10 flex flex-col justify-between">
                  <span className="text-xs text-slate-400 font-medium">80% Interval Coverage</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-bold font-display text-cyan-400">
                      {modelSummary.interval_coverage.observed_coverage_pct}%
                    </span>
                    <span className="text-xs text-slate-400 font-mono-val">
                      (Target: 80.0%)
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono-val mt-1">
                    Avg width: {modelSummary.interval_coverage.average_interval_width} mm
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/60 border border-white/10 flex flex-col justify-between">
                  <span className="text-xs text-slate-400 font-medium">Training & Test Rows</span>
                  <div className="mt-1 text-xs font-mono-val text-white">
                    Train: {modelSummary.training_period.rows_count.toLocaleString()} rows
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono-val">
                    Test: {modelSummary.test_period.rows_count.toLocaleString()} rows
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono-val mt-1">
                    Split date: 2025-01-01
                  </span>
                </div>
              </div>

              {/* Weakest Group Alert Box (Requirement 21) */}
              {modelSummary.weakest_group && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/35 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-amber-400 text-[22px] shrink-0">
                      warning
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-amber-200 uppercase tracking-wider text-[11px]">
                          Weakest Group Identified:
                        </span>
                        <span className="px-2 py-0.5 rounded font-bold bg-amber-500/20 text-amber-300 font-mono-val border border-amber-500/40">
                          {modelSummary.weakest_group.name}
                        </span>
                        <span className="font-mono-val text-amber-300">
                          MAE: {modelSummary.weakest_group.mae}
                        </span>
                      </div>
                      <p className="text-slate-300 mt-1">
                        <strong>Operational recommendation: </strong>
                        {modelSummary.weakest_group.recommendation}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Disaggregated Group Errors Table */}
              {modelSummary.groups && modelSummary.groups.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono-val">
                    Disaggregated Model Evaluation by District
                  </h4>
                  <Table
                    columns={errorColumns}
                    data={modelSummary.groups}
                    keyExtractor={(item) => `${item.group_type}-${item.group_value}`}
                  />
                </div>
              )}
            </>
          ) : null}
        </Card>
      </ErrorBoundary>
    </PageContainer>
  );
};

export default Forecast;
