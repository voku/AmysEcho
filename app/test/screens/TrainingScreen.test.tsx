import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

jest.mock('../../src/context/ThemeContext', () => {
  const actualThemes = jest.requireActual('../../src/constants/themes');
  const theme = actualThemes.THEMES[actualThemes.DEFAULT_THEME];

  return {
    useTheme: () => ({
      theme,
      themeName: actualThemes.DEFAULT_THEME,
      setTheme: jest.fn(),
      availableThemes: actualThemes.THEMES,
    }),
  };
});

jest.mock('../../src/context/MessageContext', () => ({
  useMessage: () => ({ setMessage: jest.fn() }),
}));

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));

jest.mock('../../src/services/TrainingDataValidator', () => ({
  validateLandmarkSequence: () => ({ ok: true, suggestions: [] }),
}));

jest.mock('../../src/components/BottomNav', () => () => null);
jest.mock('../../src/components/DgsVideoPlayer', () => () => null);
jest.mock('../../src/components/PerformanceAnalytics', () => () => null);
jest.mock('../../src/components/PracticeSessionManager', () => () => null);

jest.mock('../../src/services', () => ({
  audioService: {
    playEncouragement: jest.fn(),
    playCelebrationFeedback: jest.fn(),
  },
}));

jest.mock('../../src/services/hipEvents', () => ({
  logHIPEvent: jest.fn(),
}));

jest.mock('../../src/services/positiveTelemetryService', () => ({
  positiveTelemetryService: { recordSuccess: jest.fn() },
}));

jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file://cache/',
  documentDirectory: 'file://documents/',
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('../../src/styles/touchTargets', () => ({
  childFriendlyStyles: { minTouchTarget: { minWidth: 60, minHeight: 60 } },
}));

jest.mock('../../src/utils/hapticUtils', () => ({
  hapticFeedback: { light: jest.fn() },
}));

jest.mock('../../src/model', () => ({
  gestureModel: { gestures: [{ id: 'hello', label: 'Hallo' }] },
}));

jest.mock('../../src/storage', () => {
  const actual = jest.requireActual('../../src/storage');
  return {
    ...actual,
    saveTrainingSample: jest.fn(async (sample: any) => sample),
    loadProfile: jest.fn(() => Promise.resolve(null)),
    loadActiveProfileId: jest.fn(() => Promise.resolve(null)),
    onActiveProfileChange: jest.fn(),
  };
});

jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('react-native-svg', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: (props: any) => React.createElement('Svg', props, props.children),
    Circle: (props: any) => React.createElement('Circle', props),
  };
});

jest.mock('../../src/components/MediaPipeGestureDetector', () => {
  const React = require('react');
  return {
    MediaPipeGestureDetector: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({
        startClipCapture: jest.fn(async () => 'clip-id'),
        stopClipCapture: jest.fn(async () => ({
          id: 'clip-id',
          base64: 'dGVzdA==',
          mimeType: 'video/mp4',
          durationMs: 500,
          frameCount: 10,
          capturedAt: new Date().toISOString(),
        })),
        cancelClipCapture: jest.fn(),
      }));
      return React.createElement('MediaPipeGestureDetector', props, props.children);
    }),
  };
});

import TrainingScreen from '../../src/screens/TrainingScreen';

describe('TrainingScreen', () => {
  let component: renderer.ReactTestRenderer | null = null;

  afterEach(() => {
    if (component) {
      act(() => component!.unmount());
      component = null;
    }
  });

  it('records landmarks via MediaPipe gesture detector', async () => {
    const { saveTrainingSample, loadProfile } = require('../../src/storage');
    (loadProfile as jest.Mock).mockResolvedValue(null);
    (saveTrainingSample as jest.Mock).mockResolvedValue(undefined);
    await act(async () => {
      component = renderer.create(
        (
          <TrainingScreen
            navigation={{ goBack: jest.fn() }}
            route={{ params: { gestureLabel: 'hello' } }}
          />
        ) as any,
      );
      await Promise.resolve();
    });

    expect(component).not.toBeNull();

    const recordPressable = component!.root.findAll(
      (node) =>
        node.type === 'Pressable' &&
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.startsWith('Beispiel '),
    )[0];

    await act(async () => {
      recordPressable.props.onPress();
      await Promise.resolve();
    });

    const detector = component!.root.findByType('MediaPipeGestureDetector');
    const timestamp = Date.now();
    act(() => {
      detector.props.onLandmarks?.([[[1, 2, 3]]], ['Left']);
      detector.props.onFrameBatch?.({
        frames: ['data:image/jpeg;base64,test'],
        landmarks: [[[[1, 2, 3]]]],
        handednesses: [['Left']],
        timestamps: [timestamp],
      });
    });

    await act(async () => {
      recordPressable.props.onPress();
      await Promise.resolve();
    });

    expect(saveTrainingSample).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'hello',
        frames: [
          {
            landmarks: [[[1, 2, 3]]],
            handedness: ['Left'],
          },
        ],
        source: 'HIP_2',
      }),
    );

    const fs = require('expo-file-system');
    expect(fs.writeAsStringAsync).toHaveBeenCalled();
  });
});
