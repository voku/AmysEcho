import React from 'react';
import renderer, { act } from 'react-test-renderer';

// Minimal RN surface for this test
jest.mock('react-native', () => {
  const React = require('react');
  const Animated = {
    Value: class {
      constructor(public v: any) {}
      setValue() {}
    },
    timing: (_: any) => ({ start: () => {} }),
    spring: (_: any) => ({ start: () => {} }),
  };
  return {
    View: (props: any) => React.createElement('View', props, props.children),
    Text: (props: any) => React.createElement('Text', props, props.children),
    Button: (props: any) => React.createElement('Button', props, props.children),
    Switch: (props: any) => React.createElement('Switch', props, props.children),
    Pressable: (props: any) => React.createElement('Pressable', props, props.children),
    StyleSheet: { create: (s: any) => s },
    Dimensions: { get: () => ({ width: 1000, height: 500 })},
    SafeAreaView: (p: any) => React.createElement('SafeAreaView', p, p.children),
    AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
    Animated,
  };
});

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: (props: any) => React.createElement('LinearGradient', props, props.children),
}));

jest.mock('../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));

jest.mock('../src/context/MessageContext', () => ({ useMessage: () => ({ setMessage: jest.fn() }) }));

// Stub services used by the screen
jest.mock('../src/services', () => ({
  audioService: { speak: jest.fn(), playEncouragement: jest.fn(), playSuccessFeedback: jest.fn() },
  correctionService: { logNegativeSample: jest.fn() },
  mlService: { isCircuitBreakerOpen: () => false, setProfileId: jest.fn() },
}));

jest.mock('../src/services/HybridRecognizer', () => ({
  useHybridFrameProcessor: () => undefined,
}));

jest.mock('../src/utils/landmarkMapping', () => ({ mapToPreview: (p: any) => ({ x: p[0] * 100, y: p[1] * 100 }) }));

jest.mock('../src/components/BottomNav', () => () => React.createElement('BottomNav'));
jest.mock('../src/components/SymbolVideoPlayer', () => () => React.createElement('SymbolVideoPlayer'));
jest.mock('../src/components/CorrectionPanel', () => () => React.createElement('CorrectionPanel'));
jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: (props: any) => React.createElement('Svg', props, props.children),
  Circle: (props: any) => React.createElement('Circle', props),
  Line: (props: any) => React.createElement('Line', props),
}));
jest.mock('../src/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/storage', () => ({ loadProfile: () => Promise.resolve(null) }));
jest.mock('../src/services/adaptiveLearningService', () => ({ adaptiveLearningService: { getWeakGesture: jest.fn(() => Promise.resolve(null)) } }));
jest.mock('../db', () => ({ database: { write: async () => {}, get: () => ({ find: async () => null, query: () => ({ fetch: async () => [] }) }) } }));
jest.mock('../db/models', () => ({ InteractionLog: class {}, GestureDefinition: class {} }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/',
  downloadAsync: jest.fn(async () => ({ uri: '/tmp/file' })),
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  moveAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));

import RecognitionScreen from '../src/screens/RecognitionScreen';

describe.skip('RecognitionScreen debug overlay', () => {
  it('toggles overlay on long-press', async () => {
    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<RecognitionScreen navigation={{ navigate: jest.fn() }} /> as any);
    });
    const root = (component as renderer.ReactTestRenderer).root;
    const pressables = root.findAll((n) => n.props && n.props.testID === 'status-container');
    expect(pressables.length).toBeGreaterThan(0);
    const status = pressables[0];

    // Initially overlay should be hidden
    expect(root.findAll((n) => n.props && n.props.style && n.props.style.backgroundColor && String(n.props.style.backgroundColor).includes('B3')).length).toBe(0);

    // Long press to show
    await act(async () => {
      status.props.onLongPress();
    });
    // Now a debug overlay view should be present
    const overlays = root.findAll((n) => n.props && n.props.style && n.props.style.backgroundColor && String(n.props.style.backgroundColor).includes('B3'));
    expect(overlays.length).toBeGreaterThan(0);

    // Long press again to hide
    await act(async () => {
      status.props.onLongPress();
    });
    const overlaysHidden = root.findAll((n) => n.props && n.props.style && n.props.style.backgroundColor && String(n.props.style.backgroundColor).includes('B3'));
    expect(overlaysHidden.length).toBe(0);
  });
});
