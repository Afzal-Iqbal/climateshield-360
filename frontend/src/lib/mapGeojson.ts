import { extrusionHeight, HeightMetric } from './mapHeight';
import { ZoneGeoJSONFeature, ZoneGeoJSONFeatureCollection } from '../types';

export const KARACHI_BOUNDS: [[number, number], [number, number]] = [
  [66.6, 24.6],
  [67.5, 25.4],
];

export function boundsFromFeatures(
  collection?: { features?: ZoneGeoJSONFeature[] } | null
): [[number, number], [number, number]] | null {
  if (!collection?.features || collection.features.length === 0) {
    return null;
  }

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const extractCoords = (coords: any): void => {
    if (!coords || !Array.isArray(coords)) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [lng, lat] = coords;
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    coords.forEach(extractCoords);
  };

  collection.features.forEach((feature) => {
    if (feature.geometry && 'coordinates' in feature.geometry) {
      extractCoords(feature.geometry.coordinates);
    }
  });

  if (!isFinite(minLng) || !isFinite(minLat) || !isFinite(maxLng) || !isFinite(maxLat)) {
    return null;
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

export function sanitizeZones(
  data?: any,
  heightMetric: HeightMetric = 'exposed_population'
): { collection: ZoneGeoJSONFeatureCollection } {
  if (!data || !Array.isArray(data.features)) {
    return {
      collection: {
        type: 'FeatureCollection',
        features: [],
      },
    };
  }

  const features: ZoneGeoJSONFeature[] = data.features.map((feat: any, idx: number) => {
    const rawProps = feat.properties || {};
    const zoneId = rawProps.zone_id || feat.id || `zone-${idx}`;
    const extrusion_height = extrusionHeight(heightMetric, rawProps);
    return {
      type: 'Feature',
      id: zoneId,
      geometry: feat.geometry,
      properties: {
        zone_id: zoneId,
        name: rawProps.name || `District ${zoneId}`,
        hazard_type: rawProps.hazard_type || 'combined',
        risk_level: rawProps.risk_level || 'Moderate',
        probability: typeof rawProps.probability === 'number' ? rawProps.probability : 0,
        interval_low: typeof rawProps.interval_low === 'number' ? rawProps.interval_low : 0,
        interval_high: typeof rawProps.interval_high === 'number' ? rawProps.interval_high : 0,
        interval: Array.isArray(rawProps.interval) ? rawProps.interval : [0, 0],
        exposed_population: typeof rawProps.exposed_population === 'number' ? rawProps.exposed_population : 0,
        facilities_count: typeof rawProps.facilities_count === 'number' ? rawProps.facilities_count : 0,
        vulnerability_score: typeof rawProps.vulnerability_score === 'number' ? rawProps.vulnerability_score : 0,
        evidence_strength: rawProps.evidence_strength || 'medium',
        baseline_value: typeof rawProps.baseline_value === 'number' ? rawProps.baseline_value : 0,
        ...rawProps,
        extrusion_height,
        has_metric: 1,
      },
    };
  });

  return {
    collection: {
      type: 'FeatureCollection',
      features,
    },
  };
}
