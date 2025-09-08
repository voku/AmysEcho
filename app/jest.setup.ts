// Ensure React 19 act() warnings are silenced during tests
// by telling React that the test environment supports `act`.
// See https://react.dev/reference/react/act for details.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Suppress noisy test-only console output while preserving real failures
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const msg = args[0];
  if (typeof msg === 'string') {
    if (msg.includes('react-test-renderer is deprecated')) return;
    if (msg.startsWith('[ERROR]')) return; // logger error in tests
  }
  originalConsoleError(...args);
};

const originalConsoleWarn = console.warn;
console.warn = (...args: any[]) => {
  const msg = args[0];
  if (typeof msg === 'string') {
    if (msg.startsWith('[🍉]')) return; // WatermelonDB internal logs
  }
  originalConsoleWarn(...args);
};

// Provide a default global fetch so tests can spy/mock it reliably
if (!(global as any).fetch) {
  (global as any).fetch = jest.fn(async () => { throw new Error('network'); });
}

// Fast timers in tests: clamp very long timeouts/intervals to keep suites snappy
(() => {
  const origSetTimeout = global.setTimeout;
  const origSetInterval = global.setInterval;
  const clamp = (ms: number) => (ms > 2000 ? 20 : ms);
  // @ts-ignore
  global.setTimeout = ((fn: any, ms?: number, ...args: any[]) => origSetTimeout(fn, clamp(ms ?? 0), ...args)) as any;
  // @ts-ignore
  global.setInterval = ((fn: any, ms?: number, ...args: any[]) => origSetInterval(fn, clamp(ms ?? 0), ...args)) as any;
})();

// Minimal canvas context mock for jsdom (avoid installing canvas dependency)
try {
  const proto: any = (HTMLCanvasElement as any).prototype;
  if (!proto.__patchedGetContext) {
    const dummyCtx = {
      clearRect: () => {}, save: () => {}, restore: () => {},
      scale: () => {}, translate: () => {}, beginPath: () => {},
      arc: () => {}, fill: () => {}, stroke: () => {}, moveTo: () => {},
      lineTo: () => {}, setLineDash: () => {},
      lineWidth: 1, strokeStyle: '', fillStyle: '',
    } as any;
    proto.getContext = function getContext() { return dummyCtx; };
    proto.__patchedGetContext = true;
  }
} catch {}


jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
}));
jest.mock('./db', () => ({ database: { get: jest.fn(), write: jest.fn() } }));
jest.mock('./db/models', () => ({}));
// Note: NetInfo is mocked per-test where needed to avoid shape conflicts
jest.mock('./src/services/accessibilityService', () => ({ announce: jest.fn() }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

// Mock Dimensions for components that use it at module level
jest.mock('react-native/Libraries/Utilities/Dimensions', () => ({
  get: jest.fn(() => ({ width: 375, height: 812 })),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
}));

// Mock StyleSheet for components that use it at module level
jest.mock('react-native/Libraries/StyleSheet/StyleSheet', () => ({
  create: jest.fn((styles) => styles),
  absoluteFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  absoluteFillObject: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  flatten: jest.fn((style) => style),
  compose: jest.fn((style1, style2) => ({ ...style1, ...style2 })),
}));

jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/test-documents/',
  cacheDirectory: '/tmp/test-cache/',
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
  getInfoAsync: jest.fn(),
}));


