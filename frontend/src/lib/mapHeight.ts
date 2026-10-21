import { ZoneFeatureProperties } from '../types';

export type HeightMetric = 'exposed_population' | 'probability' | 'vulnerability_score';

export function extrusionHeight(
  metric: HeightMetric,
  props?: Partial<ZoneFeatureProperties>
): number {
  if (!props) return 50;

  switch (metric) {
    case 'exposed_population': {
      const pop = props.exposed_population ?? 0;
      // Scale population so a district of 2M pop produces reasonable height (e.g. 5,000m)
      return Math.min(25000, Math.max(100, pop / 300));
    }
    case 'probability': {
      const prob = props.probability ?? 0;
      // Probabilities 0.0 - 1.0 mapped to 100m - 10,000m
      return Math.min(20000, Math.max(100, prob * 10000));
    }
    case 'vulnerability_score': {
      const score = props.vulnerability_score ?? 0;
      // Vulnerability scores typically 0.0 - 1.0 or 0 - 100
      const normScore = score > 1 ? score / 100 : score;
      return Math.min(20000, Math.max(100, normScore * 8000));
    }
    default:
      return 100;
  }
}

export function heightLegend(metric: HeightMetric): string {
  switch (metric) {
    case 'exposed_population':
      return 'Height encodes estimated vulnerable population residing in the climate hazard zone.';
    case 'probability':
      return 'Height encodes predicted severe hazard event exceedance probability (0–100%).';
    case 'vulnerability_score':
      return 'Height encodes composite vulnerability score derived from socioeconomic exposure metrics.';
    default:
      return 'Height encodes selected risk metric.';
  }
}

export function preferFlatMap(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return true;
  }
  const nav = navigator as any;
  if (nav.hardwareConcurrency && nav.hardwareConcurrency <= 2) {
    return true;
  }
  if (nav.deviceMemory && nav.deviceMemory <= 2) {
    return true;
  }
  return false;
}

export function supportsWebGL(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}
