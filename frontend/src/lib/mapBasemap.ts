export const DEFAULT_CARTO_KEY = 'cb1_4q70_1_c7ad34e22779a4b5f1db2a8f';

export function getCartoKey(): string {
  try {
    return (import.meta as any).env?.VITE_CARTO_API_KEY || DEFAULT_CARTO_KEY;
  } catch {
    return DEFAULT_CARTO_KEY;
  }
}

export function buildBasemapStyle(styleType: 'voyager' | 'dark' = 'voyager'): object {
  const key = getCartoKey();
  const keyParam = key ? `?key=${key}` : '';
  const stylePath = styleType === 'dark' ? 'dark_all' : 'voyager';

  return {
    version: 8,
    sources: {
      'carto-tiles': {
        type: 'raster',
        tiles: [
          `https://a.basemaps.cartocdn.com/rastertiles/${stylePath}/{z}/{x}/{y}.png${keyParam}`,
          `https://b.basemaps.cartocdn.com/rastertiles/${stylePath}/{z}/{x}/{y}.png${keyParam}`,
          `https://c.basemaps.cartocdn.com/rastertiles/${stylePath}/{z}/{x}/{y}.png${keyParam}`,
          `https://d.basemaps.cartocdn.com/rastertiles/${stylePath}/{z}/{x}/{y}.png${keyParam}`,
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
          'background-color': styleType === 'dark' ? '#0e0e0e' : '#0b1224',
        },
      },
      {
        id: 'carto-raster-tiles',
        type: 'raster',
        source: 'carto-tiles',
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
