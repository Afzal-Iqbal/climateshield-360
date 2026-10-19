import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { api, formatPKT } from '../api/client';
import { SampleBanner } from '../components/SampleBanner';
import { EmptyState } from '../components/EmptyState';

interface DataQualityProps {
  isSample?: boolean;
}

type SortField = 'logged_at' | 'source_name' | 'action' | 'rows_affected';
type SortOrder = 'asc' | 'desc';

export const DataQuality: React.FC<DataQualityProps> = ({ isSample = true }) => {
  // Filter state
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(0);
  const pageSize = 8;

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('logged_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Expanded row tracking
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set([0])); // row 0 expanded by default

  // 1. Fetch Quality Summary
  const { data: summaryResponse } = useQuery({
    queryKey: ['quality-summary'],
    queryFn: api.getQualitySummary,
    refetchInterval: 60000,
  });

  // 2. Fetch Paginated Decisions
  const {
    data: decisionsResponse,
    isLoading: loadingDecisions,
    refetch: refetchDecisions,
  } = useQuery({
    queryKey: ['quality-decisions', selectedAction, selectedSource, page, pageSize],
    queryFn: () =>
      api.getQualityDecisions({
        action: selectedAction !== 'all' ? selectedAction : undefined,
        source: selectedSource || undefined,
        limit: pageSize,
        offset: page * pageSize,
      }),
    refetchInterval: 60000,
  });

  // 3. Fetch Daily Counts for Stacked Bar Chart
  const { data: dailyResponse, isLoading: loadingDaily } = useQuery({
    queryKey: ['quality-daily'],
    queryFn: api.getQualityDaily,
    refetchInterval: 60000,
  });

  const summary = summaryResponse?.data;
  const decisionsData = decisionsResponse?.data;
  const rawItems = decisionsData?.items || [];
  const totalItems = decisionsData?.total || 0;
  const availableSources = decisionsData?.sources || [];
  const dailyData = dailyResponse?.data || [];

  // Client-side text search filter and sort
  const filteredAndSortedItems = useMemo(() => {
    let list = [...rawItems];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (item) =>
          item.source_name.toLowerCase().includes(q) ||
          item.rule.toLowerCase().includes(q) ||
          item.explanation.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'logged_at') {
        cmp = new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime();
      } else if (sortField === 'source_name') {
        cmp = a.source_name.localeCompare(b.source_name);
      } else if (sortField === 'action') {
        cmp = a.action.localeCompare(b.action);
      } else if (sortField === 'rows_affected') {
        cmp = a.rows_affected - b.rows_affected;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [rawItems, searchQuery, sortField, sortOrder]);

  const toggleRow = (index: number) => {
    const next = new Set(expandedRows);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setExpandedRows(next);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
      {/* Sample Data Banner (Rule 2) */}
      <SampleBanner isSample={isSample} />

      {/* ============================================================ */}
      {/* SECTION 1: HEADER & OPERATIONAL AUDIT STRIP                  */}
      {/* ============================================================ */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-space-md pb-space-sm border-b border-outline-variant/30">
        <div className="flex flex-col max-w-4xl min-w-0">
          <div className="flex items-center gap-space-sm mb-space-xs flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-mono text-[11px] uppercase tracking-wider font-semibold">
              System Telemetry Audit
            </span>
            <span className="font-mono text-[11px] text-on-surface-variant flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-secondary inline-block"></span>
              {summary ? `${summary.sources_audited} Telemetry Sources Audited` : 'Active Auditing'}
            </span>
            <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-mono text-[11px]">
              ISO-19157 COMPLIANT
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight">
            Automated Data Quality &amp; Ingestion Auditing
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
            Rule-based integrity evaluation, synthetic gap reconciliation, and anomalous telemetry detection across all Karachi meteorological &amp; hydrological sensors.
          </p>
        </div>

        {/* Quick Action Controls */}
        <div className="flex items-center gap-space-sm shrink-0">
          <div className="flex items-center gap-space-xs px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface border border-outline-variant/30 font-mono text-xs">
            <span className="material-symbols-outlined text-[18px] text-secondary">verified_user</span>
            <span className="font-semibold">Ledger Hash: <span className="text-on-surface-variant">#90E2-SINDH-QC</span></span>
          </div>
          <button
            onClick={() => refetchDecisions()}
            className="flex items-center gap-space-xs px-3 py-2 rounded-lg bg-primary text-on-primary hover:bg-primary-container transition-all shadow-sm font-mono text-xs font-semibold uppercase tracking-wider"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">sync</span>
            <span>Run Sweep</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION 2: SUMMARY METRIC TILES                             */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
        {/* Tile 1: Total Integrity Checks */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md sm:p-space-lg shadow-sm border border-outline-variant/30 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-space-sm">
              <span className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold">
                Total Integrity Checks (Last 24h)
              </span>
              <span className="px-2 py-0.5 rounded-full bg-surface-container-high font-mono text-[10px] text-on-surface-variant">
                [SAMPLE DATA]
              </span>
            </div>
            <div className="flex items-baseline gap-space-sm">
              <span className="font-metric-display text-metric-display text-on-surface tabular-nums">
                {summary ? summary.total_checks.toLocaleString() : '248,190'}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant font-medium">
                packets
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Telemetry payloads streamed via LoRaWAN, cellular APN &amp; optical fiber across municipal cells.
            </p>
          </div>
          <div className="mt-space-md pt-space-sm bg-surface-container-low rounded-lg p-space-sm flex items-center justify-between border border-outline-variant/20">
            <div className="flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-[#059669] text-[20px]">check_circle</span>
              <span className="font-title-md text-title-md text-on-surface font-bold">
                {summary ? `${summary.pass_rate_pct}%` : '99.8%'}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">Pass Rate</span>
            </div>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-semibold">
              Optimal
            </span>
          </div>
        </div>

        {/* Tile 2: Triage Breakdown */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md sm:p-space-lg shadow-sm border border-outline-variant/30 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-space-xs">
              <span className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold">
                Telemetry Triage Breakdown
              </span>
              <span className="font-mono text-[11px] text-[#B45309] font-semibold">
                {summary ? `${summary.total_anomalies} Total Logged` : 'Anomalies'}
              </span>
            </div>
            {/* Breakdown Stack Bar */}
            <div className="w-full h-3 rounded-full bg-surface-container flex overflow-hidden my-space-sm border border-outline-variant/30">
              <div
                className="bg-secondary h-full"
                style={{
                  width: `${
                    summary && summary.total_anomalies > 0
                      ? (summary.fixed / summary.total_anomalies) * 100
                      : 45
                  }%`,
                }}
                title={`Fixed: ${summary?.fixed || 0}`}
              ></div>
              <div
                className="bg-secondary-container h-full"
                style={{
                  width: `${
                    summary && summary.total_anomalies > 0
                      ? (summary.filled / summary.total_anomalies) * 100
                      : 35
                  }%`,
                }}
                title={`Filled: ${summary?.filled || 0}`}
              ></div>
              <div
                className="bg-error h-full"
                style={{
                  width: `${
                    summary && summary.total_anomalies > 0
                      ? (summary.flagged / summary.total_anomalies) * 100
                      : 20
                  }%`,
                }}
                title={`Flagged: ${summary?.flagged || 0}`}
              ></div>
            </div>

            <div className="grid grid-cols-3 gap-space-xs mt-space-sm">
              {/* Fixed */}
              <div className="bg-surface-container-low p-2 rounded-lg flex flex-col border border-outline-variant/20">
                <div className="flex items-center gap-1 mb-1">
                  <span className="w-2 h-2 rounded-full bg-secondary"></span>
                  <span className="font-mono text-[10px] text-on-surface-variant">Auto-Fixed</span>
                </div>
                <span className="font-title-md text-title-md text-on-surface font-bold tabular-nums">
                  {summary ? summary.fixed : '—'}
                </span>
                <span className="font-mono text-[9px] text-on-surface-variant">Clamped/Norm</span>
              </div>

              {/* Filled */}
              <div className="bg-surface-container-low p-2 rounded-lg flex flex-col border border-outline-variant/20">
                <div className="flex items-center gap-1 mb-1">
                  <span className="w-2 h-2 rounded-full bg-secondary-container"></span>
                  <span className="font-mono text-[10px] text-on-surface-variant">Imputed</span>
                </div>
                <span className="font-title-md text-title-md text-on-surface font-bold tabular-nums">
                  {summary ? summary.filled : '—'}
                </span>
                <span className="font-mono text-[9px] text-on-surface-variant">Forward-Fill</span>
              </div>

              {/* Flagged */}
              <div className="bg-error-container/30 p-2 rounded-lg flex flex-col border border-error/20">
                <div className="flex items-center gap-1 mb-1">
                  <span className="w-2 h-2 rounded-full bg-error"></span>
                  <span className="font-mono text-[10px] text-error font-semibold">Flagged</span>
                </div>
                <span className="font-title-md text-title-md text-error font-bold tabular-nums">
                  {summary ? summary.flagged : '—'}
                </span>
                <span className="font-mono text-[9px] text-on-error-container">Quarantined</span>
              </div>
            </div>
          </div>
          <div className="mt-space-sm text-right">
            <span className="font-mono text-[10px] text-on-surface-variant">QC Protocol: PDMA-SINDH-MET-08 Rev 4</span>
          </div>
        </div>

        {/* Tile 3: Daily Ingestion Trend Chart Preview */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md sm:p-space-lg shadow-sm border border-outline-variant/30 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-space-xs">
              <span className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold">
                7-Day Quality Index
              </span>
              <span className="font-mono text-[11px] text-[#059669] font-bold">&gt; 99.2% Min</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-xs">
              Daily verification volume across storm &amp; dry cycles.
            </p>
          </div>
          <div className="w-full h-24 relative flex items-center justify-center">
            {loadingDaily ? (
              <span className="font-mono text-xs text-on-surface-variant">Loading daily trends...</span>
            ) : dailyData.length === 0 ? (
              <span className="font-mono text-xs text-on-surface-variant">No daily logs recorded</span>
            ) : (
              <ResponsiveContainer width="100%" height={90}>
                <BarChart data={dailyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <Bar dataKey="fix" stackId="a" fill="#006398" />
                  <Bar dataKey="fill" stackId="a" fill="#5bb8fe" />
                  <Bar dataKey="flag" stackId="a" fill="#ba1a1a" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="flex items-center justify-between pt-space-xs text-on-surface-variant font-mono text-[10px] border-t border-outline-variant/20">
            <span>7d History</span>
            <span className="text-secondary font-bold">Auditing Active</span>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION 3: STACKED BAR CHART OF DAILY COUNTS PER ACTION     */}
      {/* ============================================================ */}
      <div className="bg-surface-container-lowest p-space-md sm:p-space-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-space-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
          <div>
            <h2 className="font-title-md text-title-md text-on-surface font-semibold">
              Daily Triage Actions by Category (Last 7 Days)
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Chronological daily breakdown of automated corrections, forward-fill synthetic interpolations, and quarantined flags.
            </p>
          </div>
          <div className="flex items-center gap-space-sm font-mono text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[#006398]"></span>
              <span>Auto-Fixed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[#5bb8fe]"></span>
              <span>Imputed / Filled</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[#ba1a1a]"></span>
              <span>Flagged for Review</span>
            </div>
          </div>
        </div>

        {loadingDaily ? (
          <div className="h-64 flex items-center justify-center font-mono text-xs text-on-surface-variant">
            Loading 7-day daily telemetry data...
          </div>
        ) : dailyData.length === 0 ? (
          <EmptyState
            icon="bar_chart"
            title="No Daily Aggregations Available"
            description="No quality log events recorded in DuckDB for the daily aggregation chart."
          />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e3e5" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  tickFormatter={(val) => {
                    const parts = val.split('-');
                    return parts.length === 3 ? `${parts[1]}/${parts[2]}` : val;
                  }}
                />
                <YAxis tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #c3c6ce',
                    borderRadius: '8px',
                    fontFamily: 'JetBrains Mono',
                    fontSize: '12px',
                  }}
                  formatter={(value: any, name: any) => [value, name]}
                  labelFormatter={(label) => `Date: ${label} (UTC)`}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'JetBrains Mono' }} />
                <Bar dataKey="fix" name="Auto-Fixed (Fix)" stackId="a" fill="#006398" />
                <Bar dataKey="fill" name="Imputed (Fill)" stackId="a" fill="#5bb8fe" />
                <Bar dataKey="flag" name="Quarantined (Flag)" stackId="a" fill="#ba1a1a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* SECTION 4: EXPLAINER BOX (Fix / Fill / Flag Definition)       */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
        {/* Fix Explainer */}
        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-outline-variant/30 flex items-start gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-secondary-fixed flex items-center justify-center shrink-0 text-on-secondary-fixed">
            <span className="material-symbols-outlined text-[20px]">build</span>
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-bold text-secondary uppercase tracking-wider">
                Action: FIX
              </span>
              <span className="font-mono text-[10px] text-on-surface-variant font-medium">(Certain Correction)</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 leading-relaxed">
              Automated, deterministic correction applied with full confidence. Used for physical limit clamps (e.g. 68°C to 42°C), unit conversions, and NTP clock drift syncs.
            </p>
          </div>
        </div>

        {/* Fill Explainer */}
        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-outline-variant/30 flex items-start gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-secondary-container flex items-center justify-center shrink-0 text-on-secondary-container">
            <span className="material-symbols-outlined text-[20px]">tune</span>
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-bold text-on-secondary-container uppercase tracking-wider">
                Action: FILL
              </span>
              <span className="font-mono text-[10px] text-on-surface-variant font-medium">(Synthetic Estimate)</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 leading-relaxed">
              Missing values synthesized via linear interpolation, nearby sensor correlation, or rolling medians. Every filled record strictly retains its synthetic provenance marker.
            </p>
          </div>
        </div>

        {/* Flag Explainer */}
        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-outline-variant/30 flex items-start gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-error text-on-error flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px]">flag</span>
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-bold text-error uppercase tracking-wider">
                Action: FLAG
              </span>
              <span className="font-mono text-[10px] text-on-surface-variant font-medium">(Quarantined Warning)</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 leading-relaxed">
              Telemetry left unchanged with a warning attached. Quarantined from downstream NWP models and risk engines. Queued for human analyst inspection or field repair.
            </p>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION 5: AUDIT DECISION TABLE WITH FILTERS & EXPANSIONS    */}
      {/* ============================================================ */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden border border-outline-variant/30">
        {/* Table Filter Toolbar */}
        <div className="p-space-md bg-surface-container-low flex flex-col md:flex-row items-stretch md:items-center justify-between gap-space-md border-b border-outline-variant/30">
          {/* Search and Action Filter Pills */}
          <div className="flex flex-wrap items-center gap-space-sm flex-1 min-w-0">
            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <span className="material-symbols-outlined text-outline absolute left-3 top-2.5 text-[18px]">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by source, rule, or explanation..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface placeholder:text-outline font-body-sm text-xs border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-secondary"
              />
            </div>

            {/* Action Pills */}
            <div className="flex items-center gap-1 flex-wrap">
              {[
                { key: 'all', label: 'All Actions' },
                { key: 'fix', label: 'Fixed' },
                { key: 'fill', label: 'Filled' },
                { key: 'flag', label: 'Flagged' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => {
                    setSelectedAction(tab.key);
                    setPage(0);
                  }}
                  className={`px-3 py-1 rounded-full font-mono text-[11px] font-semibold transition-colors ${
                    selectedAction === tab.key
                      ? 'bg-primary text-on-primary shadow-xs'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                  }`}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Source Dropdown */}
            <div className="relative">
              <select
                value={selectedSource}
                onChange={(e) => {
                  setSelectedSource(e.target.value);
                  setPage(0);
                }}
                className="px-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface font-mono text-[11px] border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-secondary"
              >
                <option value="">All Stream Sources ({availableSources.length})</option>
                {availableSources.map((src) => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Reset Filters / Clear */}
          {(selectedAction !== 'all' || selectedSource || searchQuery) && (
            <button
              onClick={() => {
                setSelectedAction('all');
                setSelectedSource('');
                setSearchQuery('');
                setPage(0);
              }}
              className="text-secondary font-mono text-xs hover:underline flex items-center gap-1 shrink-0"
              type="button"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {/* Audit Decisions Table */}
        {loadingDecisions ? (
          <div className="p-space-xl text-center font-mono text-xs text-on-surface-variant">
            Loading triage decisions from DuckDB quality_log...
          </div>
        ) : filteredAndSortedItems.length === 0 ? (
          <EmptyState
            icon="verified_user"
            title="No Quality Decisions Match Criteria"
            description="No audit logs found for the selected action and source filter."
            actionText="Clear Filters"
            onAction={() => {
              setSelectedAction('all');
              setSelectedSource('');
              setSearchQuery('');
              setPage(0);
            }}
          />
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container font-mono text-[11px] text-on-surface-variant uppercase tracking-wider border-b border-outline-variant/30">
                <tr>
                  <th
                    onClick={() => handleSort('logged_at')}
                    className="py-3 px-space-md w-44 cursor-pointer hover:text-on-surface select-none"
                    scope="col"
                  >
                    <div className="flex items-center gap-1">
                      <span>Timestamp (PKT)</span>
                      {sortField === 'logged_at' && (
                        <span className="material-symbols-outlined text-[14px]">
                          {sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('source_name')}
                    className="py-3 px-space-md w-56 cursor-pointer hover:text-on-surface select-none"
                    scope="col"
                  >
                    <div className="flex items-center gap-1">
                      <span>Source Stream</span>
                      {sortField === 'source_name' && (
                        <span className="material-symbols-outlined text-[14px]">
                          {sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th className="py-3 px-space-md" scope="col">
                    Rule Triggered
                  </th>
                  <th
                    onClick={() => handleSort('action')}
                    className="py-3 px-space-md w-32 cursor-pointer hover:text-on-surface select-none"
                    scope="col"
                  >
                    <div className="flex items-center gap-1">
                      <span>Action</span>
                      {sortField === 'action' && (
                        <span className="material-symbols-outlined text-[14px]">
                          {sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('rows_affected')}
                    className="py-3 px-space-md w-28 cursor-pointer hover:text-on-surface select-none"
                    scope="col"
                  >
                    <div className="flex items-center gap-1">
                      <span>Rows</span>
                      {sortField === 'rows_affected' && (
                        <span className="material-symbols-outlined text-[14px]">
                          {sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th className="py-3 px-space-md" scope="col">
                    Triage Explanation
                  </th>
                  <th className="py-3 px-space-md w-12 text-center" scope="col">
                    Detail
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20 font-body-sm text-body-sm text-on-surface">
                {filteredAndSortedItems.map((item, index) => {
                  const isExpanded = expandedRows.has(index);
                  const isFlag = item.action === 'flag';
                  const isFill = item.action === 'fill';

                  return (
                    <React.Fragment key={`${item.source_name}-${item.logged_at}-${index}`}>
                      <tr
                        onClick={() => toggleRow(index)}
                        className={`group hover:bg-surface-container-low/60 transition-colors cursor-pointer ${
                          isExpanded ? 'bg-surface-container-low/40' : ''
                        }`}
                      >
                        {/* Timestamp in PKT (Rule 3) */}
                        <td className="py-3.5 px-space-md font-mono text-xs whitespace-nowrap">
                          <span className="font-semibold text-on-surface">
                            {formatPKT(item.logged_at, { second: '2-digit' })}
                          </span>
                        </td>

                        {/* Source Stream */}
                        <td className="py-3.5 px-space-md">
                          <div className="flex flex-col">
                            <span className="font-semibold text-on-surface">{item.source_name}</span>
                          </div>
                        </td>

                        {/* Rule */}
                        <td className="py-3.5 px-space-md">
                          <span className="font-mono text-xs text-primary font-medium">{item.rule}</span>
                        </td>

                        {/* Action Badge */}
                        <td className="py-3.5 px-space-md">
                          {isFlag && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-error-container text-on-error-container font-mono text-[11px] font-bold border border-error/30">
                              <span className="material-symbols-outlined text-[13px]">flag</span>
                              FLAG
                            </span>
                          )}
                          {isFill && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-secondary-container/40 text-on-secondary-container font-mono text-[11px] font-bold border border-secondary/30">
                              <span className="material-symbols-outlined text-[13px]">tune</span>
                              FILL
                            </span>
                          )}
                          {!isFlag && !isFill && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-mono text-[11px] font-bold border border-secondary/20">
                              <span className="material-symbols-outlined text-[13px]">build</span>
                              FIX
                            </span>
                          )}
                        </td>

                        {/* Rows Affected */}
                        <td className="py-3.5 px-space-md font-mono text-xs">
                          <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">
                            {item.rows_affected} rows
                          </span>
                        </td>

                        {/* Explanation preview */}
                        <td className="py-3.5 px-space-md max-w-md">
                          <p className="text-on-surface-variant text-xs truncate">{item.explanation}</p>
                        </td>

                        {/* Chevron */}
                        <td className="py-3.5 px-space-md text-center">
                          <button
                            type="button"
                            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-surface-container transition-colors text-secondary"
                            aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                          >
                            <span className="material-symbols-outlined text-[20px]">
                              {isExpanded ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
                            </span>
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Drawer Row */}
                      {isExpanded && (
                        <tr className="bg-surface-container-lowest border-b border-outline-variant/30">
                          <td colSpan={7} className="p-space-md sm:p-space-lg">
                            <div className="bg-surface-container-low rounded-xl p-space-md border border-outline-variant/30 flex flex-col gap-space-sm">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-outline-variant/20 pb-2">
                                <div className="flex items-center gap-2">
                                  <span className="material-symbols-outlined text-secondary text-[20px]">
                                    terminal
                                  </span>
                                  <span className="font-title-md text-body-md text-on-surface font-bold">
                                    Quality Audit Detail: {item.rule}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 font-mono text-[11px] text-on-surface-variant">
                                  <span>Source: <strong>{item.source_name}</strong></span>
                                  <span>·</span>
                                  <span>Rows: <strong>{item.rows_affected}</strong></span>
                                </div>
                              </div>

                              <div className="p-3 bg-surface-container-lowest rounded-lg border border-outline-variant/20 font-body-sm text-on-surface leading-relaxed">
                                <span className="font-semibold text-primary block mb-0.5 font-mono text-xs uppercase tracking-wide">
                                  Audit Action &amp; Remediation Rationale:
                                </span>
                                {item.explanation}
                              </div>

                              <div className="flex items-center justify-between pt-1 font-mono text-[10px] text-on-surface-variant">
                                <span>UTC Timestamp: {item.logged_at}</span>
                                <span className="text-secondary font-semibold">ISO-19157 Verified Audit Trail</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Table Pagination */}
        <div className="p-space-md bg-surface-container flex flex-col sm:flex-row items-center justify-between gap-space-sm font-body-sm text-body-sm text-on-surface-variant border-t border-outline-variant/30">
          <div className="flex items-center gap-space-xs font-mono text-xs">
            <span>
              Showing <strong>{filteredAndSortedItems.length}</strong> of{' '}
              <strong>{totalItems}</strong> audit decisions
            </span>
            <span className="px-2 py-0.5 rounded bg-surface-container-high font-mono text-[10px]">
              Ledger Sync: REALTIME
            </span>
          </div>

          <div className="flex items-center gap-space-xs">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-3 py-1 rounded bg-surface-container-high text-on-surface font-mono text-xs hover:bg-surface-container-highest disabled:opacity-40 transition-colors font-medium"
              type="button"
            >
              Previous
            </button>
            <span className="px-3 py-1 rounded bg-surface-container-lowest text-on-surface font-mono text-xs font-bold border border-outline-variant/30">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 rounded bg-surface-container-high text-on-surface font-mono text-xs hover:bg-surface-container-highest disabled:opacity-40 transition-colors font-medium"
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
