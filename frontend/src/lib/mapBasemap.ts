export type BasemapTier = 'openfreemap' | 'osm' | 'dark';

export function nextBasemapTier(current: BasemapTier): BasemapTier | null {
  if (current === 'openfreemap') return 'osm';
  if (current === 'osm') return 'dark';
  return null;
}

export function styleForTier(tier: BasemapTier): string | object {
  if (tier === 'openfreemap') {
    // OpenFreeMap Dark — 100% Free, zero API key, Cloudflare Karachi (KHI) edge CDN
    return 'https://tiles.openfreemap.org/styles/dark';
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
