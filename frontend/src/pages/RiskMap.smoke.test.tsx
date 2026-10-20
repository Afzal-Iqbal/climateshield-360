import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const loadHandlers: Array<() => void> = [];
const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
const layers = new Set<string>();
const mapInstance = {
  addControl: vi.fn(),
  on: vi.fn((event: string, cb: () => void) => {
    if (event === 'load' || event === 'style.load') loadHandlers.push(cb);
  }),
  remove: vi.fn(),
  resize: vi.fn(),
  getSource: vi.fn((id: string) => sources.get(id)),
  getLayer: vi.fn((id: string) => (layers.has(id) ? { id } : undefined)),
  addSource: vi.fn((id: string) => {
    sources.set(id, { setData: vi.fn() });
  }),
  addLayer: vi.fn((layer: { id: string }) => {
    layers.add(layer.id);
  }),
  setLayoutProperty: vi.fn(),
  setPaintProperty: vi.fn(),
  setFilter: vi.fn(),
  fitBounds: vi.fn(),
  easeTo: vi.fn(),
  getCanvas: vi.fn(() => ({ style: { cursor: '' } })),
  setFeatureState: vi.fn(),
  setStyle: vi.fn(),
};

vi.mock('maplibre-gl', () => {
  class Map {
    constructor(opts: { container: HTMLElement }) {
      Object.assign(this, mapInstance);
      Object.defineProperty(opts.container, 'clientWidth', { value: 800, configurable: true });
      Object.defineProperty(opts.container, 'clientHeight', { value: 600, configurable: true });
      queueMicrotask(() => {
        loadHandlers.forEach((h) => h());
      });
    }
  }
  return {
    default: {
      Map,
      NavigationControl: vi.fn(),
      FullscreenControl: vi.fn(),
    },
  };
});

vi.mock('../api/client', () => ({
  api: {
    getMapZones: vi.fn(async () => ({
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 'KHI-MALIR',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [67.1, 24.9],
                  [67.2, 24.9],
                  [67.2, 25.0],
                  [67.1, 25.0],
                  [67.1, 24.9],
                ],
              ],
            },
            properties: {
              zone_id: 'KHI-MALIR',
              name: 'Malir Basin / Gadap',
              hazard_type: 'combined',
              risk_level: 'Severe',
              probability: 0.8,
              interval_low: 0.5,
              interval_high: 0.9,
              interval: [0.5, 0.9],
              exposed_population: 120000,
              facilities_count: 4,
              vulnerability_score: 0.6,
              evidence_strength: 'medium',
              baseline_value: 0.3,
            },
          },
        ],
      },
      generated_at: new Date().toISOString(),
      is_sample: false,
    })),
    getMapFacilities: vi.fn(async () => ({
      data: { type: 'FeatureCollection', features: [] },
      generated_at: new Date().toISOString(),
      is_sample: false,
    })),
    getZoneDetail: vi.fn(),
    getStatus: vi.fn(async () => ({
      data: { status_indicator: 'ok', is_late: false, quality_summary: { fix: 0, fill: 0, flag: 0, total_actions: 0, rules_audited: 0 } },
      generated_at: new Date().toISOString(),
      is_sample: false,
    })),
  },
}));

vi.mock('../components/ui', async () => {
  const actual = await vi.importActual<any>('../components/ui');
  return {
    ...actual,
    useToast: () => ({ push: vi.fn() }),
  };
});

import { RiskMap } from './RiskMap';

function renderMap() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/risk-map']}>
        <div style={{ width: 1024, height: 768 }}>
          <RiskMap />
        </div>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('RiskMap smoke', () => {
  beforeEach(() => {
    loadHandlers.length = 0;
    sources.clear();
    layers.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('creates a non-zero map canvas and loads district layers (or shows table)', async () => {
    renderMap();

    const canvasHost = await screen.findByTestId('risk-map-canvas');
    expect(canvasHost.clientWidth).toBeGreaterThan(0);
    expect(canvasHost.clientHeight).toBeGreaterThan(0);

    await waitFor(() => {
      expect(loadHandlers.length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      // Layers added after load, or table fallback present
      const layersAdded = mapInstance.addLayer.mock.calls.length > 0;
      const table = screen.queryByTestId('risk-map-table');
      expect(layersAdded || table).toBeTruthy();
    });

    expect(mapInstance.addSource.mock.calls.some((c) => c[0] === 'zones-source')).toBe(true);
  });
});
