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
    if (msg.startsWith('[🍉]') || msg.startsWith('[WARN]')) return; // Suppress WatermelonDB and logger warnings
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
  global.setInterval = ((fn: any, ms?: number, ...args: any[]) => {
    const id = origSetInterval(fn, clamp(ms ?? 0), ...args);
    if (typeof id === 'object' && typeof (id as any).unref === 'function') {
      (id as any).unref();
    }
    return id;
  }) as any;
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

// Provide a default Dimensions mock for React Native components in tests
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const rn: any = require('react-native');
  if (!rn.Dimensions) {
    rn.Dimensions = {
      get: jest.fn(() => ({ width: 375, height: 812, scale: 2 })),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
  } else if (!rn.Dimensions.get || typeof rn.Dimensions.get !== 'function') {
    rn.Dimensions.get = jest.fn(() => ({ width: 375, height: 812, scale: 2 }));
    rn.Dimensions.addEventListener = jest.fn();
    rn.Dimensions.removeEventListener = jest.fn();
  }
} catch {}


jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
}));
jest.mock('openai/shims/node', () => ({}), { virtual: true });
let mockOpenAIModule: any;
jest.mock('openai', () => {
  const defaultResponse = { choices: [{ message: { content: '{}' } }] };
  const createMock = jest.fn().mockResolvedValue(defaultResponse);
  const configs: any[] = [];
  mockOpenAIModule = {
    __esModule: true,
    default: class MockOpenAI {
      constructor(config: any) {
        configs.push(config);
      }

      chat = {
        completions: {
          create: createMock,
        },
      };
    },
    __createMock: createMock,
    __getConfigs: () => configs,
    __reset: () => {
      configs.length = 0;
      createMock.mockClear();
      createMock.mockResolvedValue(defaultResponse);
    },
    __setResponse: (response: any) => {
      createMock.mockResolvedValue(response);
    },
  };
  return mockOpenAIModule;
}, { virtual: true });

afterEach(() => {
  mockOpenAIModule?.__reset();
});
jest.mock('expo-file-system', () => ({
  bundleDirectory: 'bundle/',
  documentDirectory: 'file:///doc/',
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  Paths: {
    document: { uri: 'file:///doc/' },
    cache: { uri: 'file:///cache/' },
  },
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

jest.mock('expo-audio', () => {
  const createPlayer = () => ({
    volume: 1,
    loop: false,
    play: jest.fn(),
    stop: jest.fn(),
    seekTo: jest.fn(),
  });

  class MockAudioRecorder {
    startAsync = jest.fn(async () => {});
    stopAndUnloadAsync = jest.fn(async () => {});
    setStatusAsync = jest.fn(async () => {});
  }

  return {
    setAudioModeAsync: jest.fn(async () => {}),
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
    createAudioPlayer: jest.fn(() => createPlayer()),
    AudioRecorder: MockAudioRecorder,
    RecordingPresets: { HIGH_QUALITY: {}, LOW_QUALITY: {} },
  };
});

// Mock Dimensions for components that use it at module level
jest.mock('react-native/Libraries/Utilities/Dimensions', () => ({
  get: jest.fn(() => ({ width: 375, height: 812 })),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
}));

jest.mock('react-native/Libraries/Components/Pressable/Pressable', () => 'Pressable');

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

// Provide a fallback StyleSheet implementation on the main react-native export
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const rn: any = require('react-native');
  if (!rn.StyleSheet || typeof rn.StyleSheet.create !== 'function') {
    rn.StyleSheet = require('react-native/Libraries/StyleSheet/StyleSheet');
  } else if (!rn.StyleSheet.flatten) {
    rn.StyleSheet.flatten = (style: any) => style;
  }
} catch {}

const mockFileSystemPaths = {
  document: { uri: 'file:///tmp/test-documents/' },
  cache: { uri: 'file:///tmp/test-cache/' },
};

jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/test-documents/',
  cacheDirectory: '/tmp/test-cache/',
  Paths: mockFileSystemPaths,
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  moveAsync: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
  moveAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  downloadAsync: jest.fn(async (_url: string, _fileUri: string) => ({ uri: _fileUri })),
  copyAsync: jest.fn(),
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  cacheDirectory: '/tmp/test-cache/',
  documentDirectory: '/tmp/test-documents/',
  Paths: mockFileSystemPaths,
}));

jest.mock('react-native/Libraries/Animated/Animated', () => {
  const ActualAnimated = jest.requireActual('react-native/Libraries/Animated/Animated');
  return {
    ...ActualAnimated,
    createAnimatedComponent: (comp: any) => comp,
  };
});

// Bypass internal Animated component hooks
jest.mock('react-native/Libraries/Animated/createAnimatedComponent', () => (comp: any) => comp);
jest.mock('react-native/src/private/animated/createAnimatedPropsHook', () => () => () => ({}));
