import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { Overview } from './pages/Overview';
import { RiskMap } from './pages/RiskMap';
import { Forecast } from './pages/Forecast';
import { EightImpacts } from './pages/EightImpacts';
import { DataQuality } from './pages/DataQuality';
import { InsightAgent } from './pages/InsightAgent';
import { EmergencyPlanner } from './pages/EmergencyPlanner';
import { PipelineFreshness } from './pages/PipelineFreshness';
import { AboutLimits } from './pages/AboutLimits';
import { api } from './api/client';
import { ThemeProvider } from './context/ThemeContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const AppRoutes: React.FC = () => {
  // Query metadata for sample data status and pipeline last run
  const { data: metaResponse, isLoading } = useQuery({
    queryKey: ['meta'],
    queryFn: api.getMeta,
  });

  const meta = metaResponse?.data || null;
  const isSample = metaResponse?.is_sample ?? true;

  return (
    <Routes>
      <Route path="/" element={<Layout meta={meta} isLoadingMeta={isLoading} />}>
        {/* 1. Overview */}
        <Route index element={<Overview isSample={isSample} />} />

        {/* 2. Risk Map */}
        <Route path="risk-map" element={<RiskMap isSample={isSample} />} />

        {/* 3. Heat & Rain Forecast */}
        <Route path="forecast" element={<Forecast isSample={isSample} />} />

        {/* 4. Eight-Impact Analysis */}
        <Route path="eight-impacts" element={<EightImpacts isSample={isSample} />} />

        {/* 5. Data Quality Center */}
        <Route path="data-quality" element={<DataQuality isSample={isSample} />} />

        {/* 6. AI Climate Assistant */}
        <Route path="ai-assistant" element={<InsightAgent isSample={isSample} />} />

        {/* 7. Emergency Action Planner */}
        <Route path="emergency-planner" element={<EmergencyPlanner isSample={isSample} />} />

        {/* 8. Automation & System Health */}
        <Route path="system-health" element={<PipelineFreshness isSample={isSample} />} />

        {/* 9. Data Sources & Methodology */}
        <Route path="methodology" element={<AboutLimits isSample={isSample} />} />

        {/* URL Redirection for Legacy Routes */}
        <Route path="insight-agent" element={<Navigate to="/ai-assistant" replace />} />
        <Route path="pipeline-freshness" element={<Navigate to="/system-health" replace />} />
        <Route path="about-limits" element={<Navigate to="/methodology" replace />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
