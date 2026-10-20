import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  CartesianGrid,
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
  Badge,
  Tabs,
  Select,
  Table,
  Drawer,
  Button,
  ErrorBoundary,
  EmptyState,
  SkeletonRow,
  Column,
} from '../components/ui';
import { QualityLog } from '../types';

interface DataQualityProps {
  isSample?: boolean;
}

export const DataQuality: React.FC<DataQualityProps> = ({ isSample: _isSample = true }) => {
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(0);
  const pageSize = 10;

  // Issue Detail Drawer State (Read-only)
  const [activeDrawerItem, setActiveDrawerItem] = useState<QualityLog | null>(null);

  // 1. Fetch Quality Summary
  const { data: summaryResponse, refetch: refetchSummary } = useQuery({
    queryKey: ['quality-summary'],
    queryFn: api.getQualitySummary,
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
    refetchInterval: 30000,
  });

  // 3. Fetch Daily Counts for Stacked Bar Chart
  const { data: dailyResponse } = useQuery({
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

  // Client-side text search filter
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return rawItems;
    const q = searchQuery.toLowerCase();
    return rawItems.filter(
      (item) =>
        item.source_name.toLowerCase().includes(q) ||
        item.rule.toLowerCase().includes(q) ||
        item.explanation.toLowerCase().includes(q) ||
        (item.column && item.column.toLowerCase().includes(q))
    );
  }, [rawItems, searchQuery]);

  const handleRefreshAll = () => {
    refetchSummary();
    refetchDecisions();
  };

  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  // Table column specifications
  const columns: Column<QualityLog>[] = [
    {
      key: 'logged_at',
      header: 'Logged (PKT)',
      sortable: true,
      width: '140px',
      render: (item) => (
        <span className="font-mono-val text-xs text-slate-300">
          {formatPKT(item.logged_at, { second: undefined })}
        </span>
      ),
    },
    {
      key: 'source_name',
      header: 'Source Pipeline',
      sortable: true,
      render: (item) => (
        <span className="font-mono-val font-semibold text-white">
          {item.source_name}
        </span>
      ),
    },
    {
      key: 'rule',
      header: 'Validation Rule',
      render: (item) => (
        <div className="flex flex-col min-w-0">
          <span className="font-medium text-slate-200 font-display truncate">
            {item.rule}
          </span>
          <span className="text-[11px] text-slate-400 truncate">
            {item.explanation}
          </span>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Triage Action',
      sortable: true,
      render: (item) => {
        const variant =
          item.action === 'fix'
            ? 'cyan'
            : item.action === 'fill'
            ? 'teal'
            : 'danger';

        return (
          <Badge variant={variant} size="sm">
            {item.action.toUpperCase()}
          </Badge>
        );
      },
    },
    {
      key: 'rows_affected',
      header: 'Rows Affected',
      align: 'right',
      sortable: true,
      render: (item) => (
        <span className="font-mono-val font-bold text-slate-200">
          {item.rows_affected.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Details',
      align: 'right',
      render: (item) => (
        <Button
          variant="ghost"
          size="sm"
          icon="visibility"
          onClick={() => setActiveDrawerItem(item)}
        >
          View Diff
        </Button>
      ),
    },
  ];

  return (
    <PageContainer>
      {/* Page Header */}
      <PageHeader
        title="Data Quality Center"
        subtitle="Automated DuckDB validation audits, schema sanity checks, and immutable transformation logs."
        lastUpdated={dataAsOf || summaryResponse?.generated_at}
        isLive={isLive}
        actions={
          <Button variant="outline" size="sm" icon="refresh" onClick={handleRefreshAll}>
            Refresh Audits
          </Button>
        }
      />

      {/* 4 Summary StatCards */}
      <ErrorBoundary fallbackTitle="Quality Summary Error">
        {summary ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Audited Rules"
              value={summary.total_checks ?? 0}
              icon="verified"
              accent="cyan"
              sublabel="Active warehouse validation rules"
              baselineValue={`${summary.total_records_inspected ? Number(summary.total_records_inspected).toLocaleString() : 0} rows evaluated`}
              baselineLabel="Scope"
            />
            <StatCard
              label="Automated Fixes"
              value={summary.fix_count ?? 0}
              icon="build"
              accent="cyan"
              sublabel="Out-of-range sensor values clamped"
              baselineValue="Clamped to valid physics range"
              baselineLabel="Action"
            />
            <StatCard
              label="Imputed Values"
              value={summary.fill_count ?? 0}
              icon="format_color_fill"
              accent="rain"
              sublabel="Missing gaps imputed with forward-fill"
              baselineValue="y_t = y_(t-1) interpolation"
              baselineLabel="Method"
            />
            <StatCard
              label="Quarantined Flags"
              value={summary.flag_count ?? 0}
              icon="flag"
              accent={summary.flag_count > 0 ? 'severe' : 'low'}
              sublabel="Corrupted records flagged & quarantined"
              baselineValue="Excluded from downstream ML"
              baselineLabel="Enforcement"
            />
          </div>
        ) : (
          <SkeletonRow count={4} />
        )}
      </ErrorBoundary>

      {/* Daily Audit Stacked Bar Chart */}
      <ErrorBoundary fallbackTitle="Quality Timeline Chart Error">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle icon="stacked_bar_chart">7-Day Automated Transformation Velocity</CardTitle>
            <CardDescription>
              Volume of records transformed by automated DuckDB validation rules
            </CardDescription>
          </CardHeader>

          {dailyData.length === 0 ? (
            <EmptyState
              title="No Daily Transformation Logs"
              reason="No records have been modified in the past 7 days."
              pipelineSource="Table contract: quality_log"
            />
          ) : (
            <div className="w-full h-64 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={11} fontFamily="JetBrains Mono" />
                  <YAxis stroke="#64748b" fontSize={11} fontFamily="JetBrains Mono" />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: '#09101c',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '12px',
                      color: '#f1f5f9',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="fix" stackId="a" fill="#06b6d4" name="Fix (Clamped)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="fill" stackId="a" fill="#38bdf8" name="Fill (Imputed)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="flag" stackId="a" fill="#ef4444" name="Flag (Quarantined)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </ErrorBoundary>

      {/* Decision Table Controls & Sortable Table */}
      <ErrorBoundary fallbackTitle="Quality Decisions Table Error">
        <Card className="flex flex-col gap-4">
          <CardHeader
            action={
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Action Tabs */}
                <Tabs
                  size="sm"
                  tabs={[
                    { id: 'all', label: 'All Actions' },
                    { id: 'fix', label: 'Fixes' },
                    { id: 'fill', label: 'Fills' },
                    { id: 'flag', label: 'Flags' },
                  ]}
                  activeTab={selectedAction}
                  onChange={(id) => {
                    setSelectedAction(id);
                    setPage(0);
                  }}
                />

                {/* Source Filter */}
                {availableSources.length > 0 && (
                  <Select
                    options={[
                      { value: '', label: 'All Sources' },
                      ...availableSources.map((s) => ({ value: s, label: s })),
                    ]}
                    value={selectedSource}
                    onChange={(s) => {
                      setSelectedSource(s);
                      setPage(0);
                    }}
                    className="w-40"
                  />
                )}
              </div>
            }
          >
            <CardTitle icon="rule">Quality Decision Log</CardTitle>
            <CardDescription>
              Table: quality_log · Showing {filteredItems.length} of {totalItems} total decisions
            </CardDescription>
          </CardHeader>

          {/* Quick Search Bar */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/60 border border-white/10 max-w-sm">
            <span className="material-symbols-outlined text-[18px] text-slate-400">search</span>
            <input
              type="text"
              placeholder="Search rule or explanation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none w-full"
            />
          </div>

          {/* Table */}
          {loadingDecisions ? (
            <div className="space-y-3 p-2">
              <div className="h-12 bg-white/5 rounded-xl skeleton-shimmer" />
              <div className="h-12 bg-white/5 rounded-xl skeleton-shimmer" />
              <div className="h-12 bg-white/5 rounded-xl skeleton-shimmer" />
            </div>
          ) : (
            <Table
              columns={columns}
              data={filteredItems}
              keyExtractor={(item, idx) => `${item.logged_at}-${idx}`}
              onRowClick={(item) => setActiveDrawerItem(item)}
            />
          )}

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs text-slate-400 font-mono-val">
              <span>
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      </ErrorBoundary>

      {/* Read-Only Issue Detail Drawer with Visual Before & After Diff (Requirement 23) */}
      <Drawer
        isOpen={activeDrawerItem !== null}
        onClose={() => setActiveDrawerItem(null)}
        title={activeDrawerItem?.rule || 'Audit Decision Detail'}
        subtitle={`Pipeline: ${activeDrawerItem?.source_name} · Read-Only`}
      >
        {activeDrawerItem && (
          <div className="flex flex-col gap-5">
            {/* Metadata Chips */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono-val">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10 flex flex-col gap-1">
                <span className="text-[10px] text-slate-400 uppercase">Action</span>
                <span className="font-bold text-white uppercase">{activeDrawerItem.action}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10 flex flex-col gap-1">
                <span className="text-[10px] text-slate-400 uppercase">Rows Affected</span>
                <span className="font-bold text-white">{activeDrawerItem.rows_affected}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10 flex flex-col gap-1">
                <span className="text-[10px] text-slate-400 uppercase">Logged (PKT)</span>
                <span className="font-semibold text-slate-200">{formatPKT(activeDrawerItem.logged_at)}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10 flex flex-col gap-1">
                <span className="text-[10px] text-slate-400 uppercase">Target Column</span>
                <span className="font-semibold text-slate-200 truncate">{activeDrawerItem.column || 'Record level'}</span>
              </div>
            </div>

            {/* Before vs After Telemetry Comparison Card (Requirement 23) */}
            <div className="p-4 rounded-xl bg-slate-900/90 border border-white/10 flex flex-col gap-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-400 uppercase tracking-wider font-mono-val">
                <span className="material-symbols-outlined text-[16px]">compare_arrows</span>
                <span>Telemetry Before vs After Comparison</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Before Box */}
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-mono-val font-bold text-red-400 uppercase block mb-1">
                      Before / Raw Value
                    </span>
                    <div className="p-2 rounded bg-slate-950/80 border border-red-500/20 font-mono-val text-xs text-red-200 break-words">
                      {activeDrawerItem.before_value || 'Raw un-normalized sensor payload'}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-2 font-mono-val">
                    Pre-transformation anomaly
                  </span>
                </div>

                {/* After Box */}
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-mono-val font-bold text-emerald-400 uppercase block mb-1">
                      After / Corrected State
                    </span>
                    <div className="p-2 rounded bg-slate-950/80 border border-emerald-500/20 font-mono-val text-xs text-emerald-200 break-words">
                      {activeDrawerItem.after_value || 'Sanitized & verified state stored in DuckDB'}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-2 font-mono-val">
                    Downstream warehouse state
                  </span>
                </div>
              </div>
            </div>

            {/* Scientific Explanation */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-white/10 flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-300 font-mono-val uppercase tracking-wider">
                Triage Rationale
              </span>
              <p className="text-xs text-slate-300 leading-relaxed font-body">
                {activeDrawerItem.explanation}
              </p>
            </div>
          </div>
        )}
      </Drawer>
    </PageContainer>
  );
};

export default DataQuality;
