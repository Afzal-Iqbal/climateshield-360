export type BasemapTier = 'carto-voyager';

export const CARTO_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_CARTO_API_KEY) ||
  'cb1_4q70_1_c7ad34e22779a4b5f1db2a8f';

export interface BasemapOption {
  id: BasemapTier;
  label: string;
  description: string;
}

export const BASEMAP_OPTIONS: BasemapOption[] = [
  { id: 'carto-voyager', label: 'CARTO Voyager', description: 'Vibrant, high-contrast urban cartography' },
];

export function nextBasemapTier(_current: BasemapTier): BasemapTier | null {
  return null;
}

export function styleForTier(_tier?: string, apiKey: string = CARTO_API_KEY): any {
  return {
    version: 8,
    sources: {
      'carto-voyager-tiles': {
        type: 'raster',
        tiles: [
          `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${apiKey}`,
          `https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${apiKey}`,
          `https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${apiKey}`,
          `https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${apiKey}`,
        ],
        tileSize: 256,
        maxzoom: 18,
        // Keep more tiles in memory — pan-back is instant without re-fetching
        minTileCacheSize: 400,
        attribution:
          '&copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': '#0B1224',
        },
      },
      {
        id: 'carto-voyager-layer',
        type: 'raster',
        source: 'carto-voyager-tiles',
        minzoom: 0,
        paint: {
          'raster-opacity': 0.95,
        },
      },
    ],
  };
}


