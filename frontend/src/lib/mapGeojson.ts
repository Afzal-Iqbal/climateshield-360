import { FacilityGeoJSONFeatureCollection, ZoneFeatureProperties } from '../types';
import { extrusionHeight, HeightMetric } from './mapHeight';

export const KARACHI_BOUNDS: [number, number, number, number] = [66.85, 24.72, 67.40, 25.12];

export interface SanitizedZoneProperties extends ZoneFeatureProperties {
  has_metric: number;
  extrusion_height: number;
}

export interface SanitizedZoneFeature extends GeoJSON.Feature<GeoJSON.Geometry, SanitizedZoneProperties> {
  id?: string | number;
  properties: SanitizedZoneProperties;
}

export interface SanitizedZonesResult {
  collection: {
    type: 'FeatureCollection';
    features: SanitizedZoneFeature[];
  };
}

export const DEFAULT_KARACHI_FEATURES: Array<{
  type: 'Feature';
  id: string;
  geometry: { type: 'Polygon'; coordinates: number[][][] };
  properties: ZoneFeatureProperties;
}> = [
  {
    type: 'Feature',
    id: 'KHI-EAST',
    geometry: {
      type: 'Polygon',
      coordinates: [[[67.06, 24.89], [67.12, 24.89], [67.12, 24.94], [67.06, 24.94], [67.06, 24.89]]],
    },
    properties: {
      zone_id: 'KHI-EAST',
      name: 'Karachi East (Gulshan / Jamshed)',
      hazard_type: 'combined',
      risk_level: 'High',
      probability: 0.74,
      interval_low: 0.31,
      interval_high: 0.64,
      interval: [0.31, 0.64],
      exposed_population: 1150000,
      facilities_count: 34,
      vulnerability_score: 0.74,
      evidence_strength: 'high',
      baseline_value: 0.185,
    },
  },
  {
    type: 'Feature',
    id: 'KHI-SOUTH',
    geometry: {
      type: 'Polygon',
      coordinates: [[[66.98, 24.80], [67.05, 24.80], [67.05, 24.87], [66.98, 24.87], [66.98, 24.80]]],
    },
    properties: {
      zone_id: 'KHI-SOUTH',
      name: 'Karachi South (Saddar / Lyari / Clifton)',
      hazard_type: 'combined',
      risk_level: 'High',
      probability: 0.74,
      interval_low: 0.31,
      interval_high: 0.64,
      interval: [0.31, 0.64],
      exposed_population: 890000,
      facilities_count: 31,
      vulnerability_score: 0.78,
      evidence_strength: 'high',
      baseline_value: 0.185,
    },
  },
  {
    type: 'Feature',
    id: 'KHI-CENTRAL',
    geometry: {
      type: 'Polygon',
      coordinates: [[[67.01, 24.90], [67.08, 24.90], [67.08, 24.98], [67.01, 24.98], [67.01, 24.90]]],
    },
    properties: {
      zone_id: 'KHI-CENTRAL',
      name: 'Karachi Central (Nazimabad / Liaquatabad)',
      hazard_type: 'combined',
      risk_level: 'Severe',
      probability: 0.74,
      interval_low: 0.31,
      interval_high: 0.64,
      interval: [0.31, 0.64],
      exposed_population: 1420000,
      facilities_count: 28,
      vulnerability_score: 0.82,
      evidence_strength: 'high',
      baseline_value: 0.185,
    },
  },
  {
    type: 'Feature',
    id: 'KHI-KORANGI',
    geometry: {
      type: 'Polygon',
      coordinates: [[[67.11, 24.79], [67.22, 24.79], [67.22, 24.86], [67.11, 24.86], [67.11, 24.79]]],
    },
    properties: {
      zone_id: 'KHI-KORANGI',
      name: 'Korangi Industrial / Landhi',
      hazard_type: 'combined',
      risk_level: 'Severe',
      probability: 0.74,
      interval_low: 0.31,
      interval_high: 0.64,
      interval: [0.31, 0.64],
      exposed_population: 1300000,
      facilities_count: 22,
      vulnerability_score: 0.87,
      evidence_strength: 'high',
      baseline_value: 0.185,
    },
  },
  {
    type: 'Feature',
    id: 'KHI-MALIR',
    geometry: {
      type: 'Polygon',
      coordinates: [[[67.15, 24.88], [67.35, 24.88], [67.35, 25.08], [67.15, 25.08], [67.15, 24.88]]],
    },
    properties: {
      zone_id: 'KHI-MALIR',
      name: 'Malir Basin / Gadap',
      hazard_type: 'combined',
      risk_level: 'Severe',
      probability: 0.74,
      interval_low: 0.31,
      interval_high: 0.64,
      interval: [0.31, 0.64],
      exposed_population: 980000,
      facilities_count: 14,
      vulnerability_score: 0.89,
      evidence_strength: 'high',
      baseline_value: 0.185,
    },
  },
  {
    type: 'Feature',
    id: 'KHI-WEST',
    geometry: {
      type: 'Polygon',
      coordinates: [[[66.95, 24.91], [67.03, 24.91], [67.03, 25.02], [66.95, 25.02], [66.95, 24.91]]],
    },
    properties: {
      zone_id: 'KHI-WEST',
      name: 'Karachi West (Orangi / Site / Manghopir)',
      hazard_type: 'combined',
      risk_level: 'High',
      probability: 0.74,
      interval_low: 0.31,
      interval_high: 0.64,
      interval: [0.31, 0.64],
      exposed_population: 1250000,
      facilities_count: 18,
      vulnerability_score: 0.72,
      evidence_strength: 'medium',
      baseline_value: 0.185,
    },
  },
  {
    type: 'Feature',
    id: 'KHI-KEAMARI',
    geometry: {
      type: 'Polygon',
      coordinates: [[[66.90, 24.76], [67.02, 24.76], [67.02, 24.84], [66.90, 24.84], [66.90, 24.76]]],
    },
    properties: {
      zone_id: 'KHI-KEAMARI',
      name: 'Keamari & Karachi Port Coastline',
      hazard_type: 'combined',
      risk_level: 'Moderate',
      probability: 0.74,
      interval_low: 0.31,
      interval_high: 0.64,
      interval: [0.31, 0.64],
      exposed_population: 460000,
      facilities_count: 12,
      vulnerability_score: 0.44,
      evidence_strength: 'medium',
      baseline_value: 0.185,
    },
  },
];

export const DEFAULT_KARACHI_FACILITIES: Array<{
  type: 'Feature';
  id: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    facility_id: string;
    type: string;
    name: string;
    zone_id: string;
    lat: number;
    lon: number;
  };
}> = [
  { type: 'Feature', id: 'FAC-HOSP-01', geometry: { type: 'Point', coordinates: [67.0494, 24.8523] }, properties: { facility_id: 'FAC-HOSP-01', type: 'hospital', name: 'Jinnah Postgraduate Medical Centre (JPMC)', zone_id: 'KHI-EAST', lat: 24.8523, lon: 67.0494 } },
  { type: 'Feature', id: 'FAC-HOSP-02', geometry: { type: 'Point', coordinates: [67.0097, 24.8587] }, properties: { facility_id: 'FAC-HOSP-02', type: 'hospital', name: 'Dr. Ruth K. M. Pfau Civil Hospital', zone_id: 'KHI-SOUTH', lat: 24.8587, lon: 67.0097 } },
  { type: 'Feature', id: 'FAC-HOSP-03', geometry: { type: 'Point', coordinates: [67.0315, 24.9221] }, properties: { facility_id: 'FAC-HOSP-03', type: 'hospital', name: 'Abbasi Shaheed Hospital', zone_id: 'KHI-CENTRAL', lat: 24.9221, lon: 67.0315 } },
  { type: 'Feature', id: 'FAC-HOSP-04', geometry: { type: 'Point', coordinates: [67.1265, 24.8291] }, properties: { facility_id: 'FAC-HOSP-04', type: 'hospital', name: 'Indus Hospital & Health Network', zone_id: 'KHI-KORANGI', lat: 24.8291, lon: 67.1265 } },
  { type: 'Feature', id: 'FAC-HOSP-05', geometry: { type: 'Point', coordinates: [66.9940, 24.8690] }, properties: { facility_id: 'FAC-HOSP-05', type: 'hospital', name: 'Lyari General Hospital', zone_id: 'KHI-SOUTH', lat: 24.8690, lon: 66.9940 } },
  { type: 'Feature', id: 'FAC-SCH-01', geometry: { type: 'Point', coordinates: [67.0175, 24.8550] }, properties: { facility_id: 'FAC-SCH-01', type: 'school', name: 'DJ Sindh Government Science College', zone_id: 'KHI-SOUTH', lat: 24.8550, lon: 67.0175 } },
  { type: 'Feature', id: 'FAC-SCH-04', geometry: { type: 'Point', coordinates: [67.1850, 24.9080] }, properties: { facility_id: 'FAC-SCH-04', type: 'school', name: 'Government Degree College Malir Cantt', zone_id: 'KHI-MALIR', lat: 24.9080, lon: 67.1850 } },
  { type: 'Feature', id: 'FAC-SHLT-01', geometry: { type: 'Point', coordinates: [66.9910, 24.8650] }, properties: { facility_id: 'FAC-SHLT-01', type: 'shelter', name: 'Lyari Community Emergency Relief Centre', zone_id: 'KHI-SOUTH', lat: 24.8650, lon: 66.9910 } },
  { type: 'Feature', id: 'FAC-SHLT-03', geometry: { type: 'Point', coordinates: [67.0950, 24.9210] }, properties: { facility_id: 'FAC-SHLT-03', type: 'shelter', name: 'Gulshan Civic Emergency Relief Camp', zone_id: 'KHI-EAST', lat: 24.9210, lon: 67.0950 } },
  { type: 'Feature', id: 'FAC-SHLT-05', geometry: { type: 'Point', coordinates: [67.2400, 24.9650] }, properties: { facility_id: 'FAC-SHLT-05', type: 'shelter', name: 'Gadap Disaster Welfare & Relief Shelter', zone_id: 'KHI-MALIR', lat: 24.9650, lon: 67.2400 } },
  { type: 'Feature', id: 'FAC-GRID-01', geometry: { type: 'Point', coordinates: [67.1420, 24.8150] }, properties: { facility_id: 'FAC-GRID-01', type: 'power_substation', name: 'K-Electric Korangi Southern Grid', zone_id: 'KHI-KORANGI', lat: 24.8150, lon: 67.1420 } },
  { type: 'Feature', id: 'FAC-DRAIN-01', geometry: { type: 'Point', coordinates: [66.9850, 24.8710] }, properties: { facility_id: 'FAC-DRAIN-01', type: 'drainage_culvert', name: 'Lyari River Spillway Regulator', zone_id: 'KHI-SOUTH', lat: 24.8710, lon: 66.9850 } },
  { type: 'Feature', id: 'FAC-DRAIN-02', geometry: { type: 'Point', coordinates: [67.1120, 24.8410] }, properties: { facility_id: 'FAC-DRAIN-02', type: 'drainage_culvert', name: 'Malir River Causeway Outlet', zone_id: 'KHI-MALIR', lat: 24.8410, lon: 67.1120 } },
];

function extractCoordinates(geometry: any, out: [number, number][]): void {
  if (!geometry || !geometry.coordinates) return;
  const { type, coordinates } = geometry;
  if (type === 'Point') {
    out.push(coordinates as [number, number]);
  } else if (type === 'Polygon' || type === 'MultiLineString') {
    for (const ring of coordinates) {
      for (const pt of ring) {
        out.push(pt as [number, number]);
      }
    }
  } else if (type === 'MultiPolygon') {
    for (const poly of coordinates) {
      for (const ring of poly) {
        for (const pt of ring) {
          out.push(pt as [number, number]);
        }
      }
    }
  } else if (type === 'LineString') {
    for (const pt of coordinates) {
      out.push(pt as [number, number]);
    }
  }
}

export function boundsFromFeatures(
  data: any
): [number, number, number, number] | null {
  const features = data?.features || (Array.isArray(data) ? data : []);
  if (!features || features.length === 0) return null;

  const coords: [number, number][] = [];
  for (const f of features) {
    if (f?.geometry) {
      extractCoordinates(f.geometry, coords);
    }
  }

  if (coords.length === 0) return null;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of coords) {
    if (typeof lng === 'number' && typeof lat === 'number' && !isNaN(lng) && !isNaN(lat)) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }

  if (!isFinite(minLng) || !isFinite(minLat) || !isFinite(maxLng) || !isFinite(maxLat)) {
    return null;
  }

  return [minLng, minLat, maxLng, maxLat];
}

export function sanitizeZones(raw: any, heightMetric: HeightMetric): SanitizedZonesResult {
  const sourceFeatures: any[] =
    raw?.features && Array.isArray(raw.features) && raw.features.length > 0
      ? raw.features
      : Array.isArray(raw) && raw.length > 0
        ? raw
        : DEFAULT_KARACHI_FEATURES;

  const sanitizedFeatures: SanitizedZoneFeature[] = sourceFeatures.map((feat) => {
    const clone =
      typeof structuredClone === 'function'
        ? structuredClone(feat)
        : JSON.parse(JSON.stringify(feat));
    const props = clone.properties || {};
    const zoneId = clone.id || props.zone_id || `zone-${Math.random().toString(36).substring(2, 9)}`;

    const hasMetric =
      props.risk_level != null ||
      props.probability != null ||
      props.exposed_population != null ||
      props.vulnerability_score != null
        ? 1
        : 0;

    const extHeight = extrusionHeight(heightMetric, props);

    const properties: SanitizedZoneProperties = {
      ...props,
      zone_id: zoneId,
      has_metric: hasMetric,
      extrusion_height: extHeight,
    };

    return {
      type: 'Feature',
      id: zoneId,
      geometry: clone.geometry,
      properties,
    };
  });

  return {
    collection: {
      type: 'FeatureCollection',
      features: sanitizedFeatures,
    },
  };
}

export function sanitizeFacilities(raw: any): FacilityGeoJSONFeatureCollection {
  if (raw?.features && Array.isArray(raw.features) && raw.features.length > 0) {
    return raw as FacilityGeoJSONFeatureCollection;
  }
  return {
    type: 'FeatureCollection',
    features: DEFAULT_KARACHI_FACILITIES as any,
  };
}
