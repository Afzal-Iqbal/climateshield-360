import React, { useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { api } from './api/client';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './components/ui/Toast';
import { SkeletonRow } from './components/ui/Skeleton';
import { useRealtimeStream } from './api/useRealtimeStream';
import { OfflineBanner } from './components/OfflineBanner';

// Code-split pages for performance (Requirement 11 & 34)
const Overview = React.lazy(() => import('./pages/Overview').then((m) => ({ default: m.Overview })));
const RiskMap = React.lazy(() => import('./pages/RiskMap').then((m) => ({ default: m.RiskMap })));
const Forecast = React.lazy(() => import('./pages/Forecast').then((m) => ({ default: m.Forecast })));
const EightImpacts = React.lazy(() => import('./pages/EightImpacts').then((m) => ({ default: m.EightImpacts })));
const DataQuality = React.lazy(() => import('./pages/DataQuality').then((m) => ({ default: m.DataQuality })));
const InsightAgent = React.lazy(() => import('./pages/InsightAgent').then((m) => ({ default: m.InsightAgent })));
const EmergencyPlanner = React.lazy(() => import('./pages/EmergencyPlanner').then((m) => ({ default: m.EmergencyPlanner })));
const PipelineFreshness = React.lazy(() => import('./pages/PipelineFreshness').then((m) => ({ default: m.PipelineFreshness })));
const AboutLimits = React.lazy(() => import('./pages/AboutLimits').then((m) => ({ default: m.AboutLimits })));

// Configure TanStack Query (Stage 4 Requirement 16 & 20)
// - 120s for data endpoints
// - Refetch on window focus and on reconnect
// - Pause when tab is hidden (refetchIntervalInBackground: false)
// - Retry with exponential backoff
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      refetchInterval: 120000, // 120s for data endpoints
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchIntervalInBackground: false, // pause when tab is hidden
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

const PageSuspenseFallback: React.FC = () => (
  <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 flex flex-col gap-5 animate-pulse">
    <div className="h-10 w-64 bg-white/5 rounded-xl" />
    <SkeletonRow count={4} />
    <div className="h-72 w-full bg-white/5 rounded-2xl" />
  </div>
);

const AppRoutes: React.FC = () => {
  const qc = useQueryClient();
  const { isOffline } = useRealtimeStream();

  // Query metadata with 60 seconds interval (Stage 4 Requirement 16)
  const { data: metaResponse, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ['meta'],
    queryFn: api.getMeta,
    refetchInterval: 60000, // 60s for /api/meta
  });

  const lastGoodTimestampRef = useRef<Date | null>(null);
  if (metaResponse?.data?.data_as_of) {
    lastGoodTimestampRef.current = new Date(metaResponse.data.data_as_of);
  } else if (dataUpdatedAt) {
    lastGoodTimestampRef.current = new Date(dataUpdatedAt);
  }

  const meta = metaResponse?.data || null;
  const isSample = metaResponse?.is_sample ?? true;
  const isNetworkOffline = isOffline || (isError && !meta);

  return (
    <>
      {/* Offline banner when API unreachable, retaining last good data (Requirement 20) */}
      <OfflineBanner
        isOffline={isNetworkOffline}
        lastGoodDataTime={lastGoodTimestampRef.current}
        onRetry={() => qc.invalidateQueries()}
      />

      <Routes>
        <Route path="/" element={<Layout meta={meta} isLoadingMeta={isLoading} />}>
          {/* 1. Overview */}
          <Route
            index
            element={
              <React.Suspense fallback={<PageSuspenseFallback />}>
                <Overview isSample={isSample} />
              </React.Suspense>
            }
          />

          {/* 2. Risk Map */}
          <Route
            path="risk-map"
            element={
              <React.Suspense fallback={<PageSuspenseFallback />}>
                <RiskMap isSample={isSample} />
              </React.Suspense>
            }
          />

          {/* 3. Heat & Rain Forecast */}
          <Route
            path="forecast"
            element={
              <React.Suspense fallback={<PageSuspenseFallback />}>
                <Forecast isSample={isSample} />
              </React.Suspense>
            }
          />

          {/* 4. Eight-Impact Analysis */}
          <Route
            path="eight-impacts"
            element={
              <React.Suspense fallback={<PageSuspenseFallback />}>
                <EightImpacts isSample={isSample} />
              </React.Suspense>
            }
          />

          {/* 5. Data Quality Center */}
          <Route
            path="data-quality"
            element={
              <React.Suspense fallback={<PageSuspenseFallback />}>
                <DataQuality isSample={isSample} />
              </React.Suspense>
            }
          />

          {/* 6. AI Assistant */}
          <Route
            path="ai-assistant"
            element={
              <React.Suspense fallback={<PageSuspenseFallback />}>
                <InsightAgent isSample={isSample} />
              </React.Suspense>
            }
          />

          {/* 7. Emergency Planner */}
          <Route
            path="emergency-planner"
            element={
              <React.Suspense fallback={<PageSuspenseFallback />}>
                <EmergencyPlanner isSample={isSample} />
              </React.Suspense>
            }
          />

          {/* 8. Automation & System Health */}
          <Route
            path="system-health"
            element={
              <React.Suspense fallback={<PageSuspenseFallback />}>
                <PipelineFreshness isSample={isSample} />
              </React.Suspense>
            }
          />

          {/* 9. Data Sources & Methodology */}
          <Route
            path="methodology"
            element={
              <React.Suspense fallback={<PageSuspenseFallback />}>
                <AboutLimits isSample={isSample} />
              </React.Suspense>
            }
          />

          {/* URL Redirection for Legacy Routes */}
          <Route path="insight-agent" element={<Navigate to="/ai-assistant" replace />} />
          <Route path="pipeline-freshness" element={<Navigate to="/system-health" replace />} />
          <Route path="about-limits" element={<Navigate to="/methodology" replace />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
