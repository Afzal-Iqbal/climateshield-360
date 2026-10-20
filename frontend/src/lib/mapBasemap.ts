export const CARTO_API_KEY =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_CARTO_API_KEY) ||
  'cb1_4q70_1_c7ad34e22779a4b5f1db2a8f';

export type BasemapTier = 'carto' | 'osm' | 'dark';

export function nextBasemapTier(current: BasemapTier): BasemapTier | null {
  if (current === 'carto') return 'osm';
  if (current === 'osm') return 'dark';
  return null;
}

export function styleForTier(tier: BasemapTier): string | object {
  if (tier === 'carto') {
    // Authenticated CARTO Dark Matter raster tiles — high performance Fastly CDN, zero watermarks
    const keyParam = CARTO_API_KEY ? `?key=${CARTO_API_KEY}` : '';
    return {
      version: 8,
      sources: {
        'carto-dark': {
          type: 'raster',
          tiles: [
            `https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png${keyParam}`,
            `https://b.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png${keyParam}`,
            `https://c.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png${keyParam}`,
            `https://d.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png${keyParam}`,
          ],
          tileSize: 256,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
          maxzoom: 19,
        },
      },
      layers: [
        {
          id: 'carto-background',
          type: 'background',
          paint: {
            'background-color': '#0e0e0e',
          },
        },
        {
          id: 'carto-dark-tiles',
          type: 'raster',
          source: 'carto-dark',
          minzoom: 0,
          maxzoom: 19,
          paint: {
            'raster-opacity': 1.0,
            'raster-fade-duration': 100,
          },
        },
      ],
    };
  }
  if (tier === 'osm') {
    // OpenStreetMap standard community raster tiles — 100% free, no API key
    return {
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: [
            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
          ],
          tileSize: 256,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
      },
      layers: [
        {
          id: 'osm-tiles-layer',
          type: 'raster',
          source: 'osm-tiles',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    };
  }
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'dark-background',
        type: 'background',
        paint: {
          'background-color': '#0b0f19',
        },
      },
    ],
  };
}
