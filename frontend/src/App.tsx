import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { Overview } from './pages/Overview';
import { RiskMap } from './pages/RiskMap';
import { EightImpacts } from './pages/EightImpacts';
import { InsightAgent } from './pages/InsightAgent';
import { DataQuality } from './pages/DataQuality';
import { PipelineFreshness } from './pages/PipelineFreshness';
import { AboutLimits } from './pages/AboutLimits';
import { api } from './api/client';

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
        <Route index element={<Overview isSample={isSample} />} />
        <Route path="risk-map" element={<RiskMap isSample={isSample} />} />
        <Route path="eight-impacts" element={<EightImpacts isSample={isSample} />} />
        <Route path="insight-agent" element={<InsightAgent isSample={isSample} />} />
        <Route path="data-quality" element={<DataQuality isSample={isSample} />} />
        <Route path="pipeline-freshness" element={<PipelineFreshness isSample={isSample} />} />
        <Route path="about-limits" element={<AboutLimits isSample={isSample} />} />
        <Route path="*" element={<Overview isSample={isSample} />} />
      </Route>
    </Routes>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
