import { ZoneFeatureProperties } from '../types';

export type HeightMetric = 'exposed_population' | 'probability' | 'vulnerability_score';

let cachedWebGLSupport: boolean | null = null;

export function supportsWebGL(): boolean {
  if (typeof window === 'undefined') return false;
  if (cachedWebGLSupport !== null) return cachedWebGLSupport;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    cachedWebGLSupport = Boolean(gl);
    // Explicitly release probe context so it never counts against browser active context limit
    const loseContext = typeof gl?.getExtension === 'function' ? gl.getExtension('WEBGL_lose_context') : null;
    loseContext?.loseContext();
    return cachedWebGLSupport;
  } catch {
    cachedWebGLSupport = false;
    return false;
  }
}

export function preferFlatMap(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const isSmall = window.innerWidth < 768;
    const isLowCores = (navigator.hardwareConcurrency || 8) <= 4;
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    return isSmall || isLowCores || prefersReduced || !supportsWebGL();
  } catch {
    return false;
  }
}

export function heightLegend(metric: HeightMetric): string {
  switch (metric) {
    case 'exposed_population':
      return 'Height encodes exposed population (30m to 350m).';
    case 'probability':
      return 'Height encodes hazard probability from 0% to 100% (30m to 300m).';
    case 'vulnerability_score':
      return 'Height encodes vulnerability score from 0.0 to 1.0 (30m to 300m).';
    default:
      return 'Height encodes selected risk metric.';
  }
}

export function extrusionHeight(
  metric: HeightMetric,
  props?: Partial<ZoneFeatureProperties> | Record<string, any> | null
): number {
  if (!props) return 0;

  switch (metric) {
    case 'exposed_population': {
      const pop = Number(props.exposed_population) || 0;
      // Proportional scale: 1.5M population -> ~300m height
      return Math.min(350, Math.max(30, pop * 0.0002));
    }
    case 'probability': {
      const prob = Number(props.probability) || 0;
      const normalizedProb = prob > 1 ? prob / 100 : prob;
      return Math.min(300, Math.max(30, normalizedProb * 300));
    }
    case 'vulnerability_score': {
      const score = Number(props.vulnerability_score) || 0;
      const normalizedScore = score > 1 ? score / 100 : score;
      return Math.min(300, Math.max(30, normalizedScore * 300));
    }
    default:
      return 100;
  }
}
