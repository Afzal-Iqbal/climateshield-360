export type BasemapTier = 'carto' | 'openfreemap' | 'osm' | 'dark';

export function nextBasemapTier(current: BasemapTier): BasemapTier | null {
  if (current === 'carto') return 'openfreemap';
  if (current === 'openfreemap') return 'osm';
  if (current === 'osm') return 'dark';
  return null;
}

export function styleForTier(tier: BasemapTier): string | object {
  if (tier === 'openfreemap') {
    return 'https://tiles.openfreemap.org/styles/liberty';
  }
  if (tier === 'carto') {
    // CARTO Dark Matter — 100% Free, rock-solid Fastly CDN, NO API key required
    return {
      version: 8,
      sources: {
        'carto-dark-tiles': {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png',
            'https://b.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png',
            'https://c.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png',
          ],
          tileSize: 256,
          attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
      },
      layers: [
        {
          id: 'carto-dark-layer',
          type: 'raster',
          source: 'carto-dark-tiles',
          minzoom: 0,
          maxzoom: 20,
        },
      ],
    };
  }
  if (tier === 'osm') {
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
