import '@testing-library/jest-dom/vitest';

// ResizeObserver is used by RiskMap
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = ResizeObserverMock;

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

// WebGL probe used by mapHeight.supportsWebGL
HTMLCanvasElement.prototype.getContext = function getContext() {
  return {} as any;
} as any;
