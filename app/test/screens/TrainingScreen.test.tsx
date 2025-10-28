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

const mockShowToast = jest.fn();
jest.mock('../../src/context/MessageContext', () => ({
  useMessage: () => ({ showToast: mockShowToast }),
  showToastMock: mockShowToast,
}));

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));

jest.mock('../../src/services/TrainingDataValidator', () => ({
  validateLandmarkSequence: () => ({ ok: true, suggestions: [] }),
}));

jest.mock('../../src/components/BottomNav', () => () => null);
jest.mock('../../src/components/DgsVideoPlayer', () => () => null);

jest.mock('../../src/services', () => ({
  audioService: {
    playEncouragement: jest.fn(),
    playCelebrationFeedback: jest.fn(),
  },
}));

jest.mock('../../src/services/hipEvents', () => ({
  logHIPEvent: jest.fn(),
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
    loadProfile: jest.fn(async () => null),
    loadActiveProfileId: jest.fn(async () => null),
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
  const startClipCaptureMock = jest.fn(async () => 'clip-id');
  const stopClipCaptureMock = jest.fn(async () => ({
    id: 'clip-id',
    base64: 'dGVzdA==',
    mimeType: 'video/mp4',
    durationMs: 500,
    frameCount: 10,
    capturedAt: new Date().toISOString(),
  }));
  const cancelClipCaptureMock = jest.fn();

  const MediaPipeGestureDetector = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      startClipCapture: startClipCaptureMock,
      stopClipCapture: stopClipCaptureMock,
      cancelClipCapture: cancelClipCaptureMock,
    }));
    return React.createElement('MediaPipeGestureDetector', props, props.children);
  });

  (MediaPipeGestureDetector as any).startClipCaptureMock = startClipCaptureMock;
  (MediaPipeGestureDetector as any).stopClipCaptureMock = stopClipCaptureMock;
  (MediaPipeGestureDetector as any).cancelClipCaptureMock = cancelClipCaptureMock;

  return {
    MediaPipeGestureDetector,
  };
});

import TrainingScreen from '../../src/screens/TrainingScreen';

const { MediaPipeGestureDetector } = require('../../src/components/MediaPipeGestureDetector');
const startClipCaptureMock = (MediaPipeGestureDetector as any).startClipCaptureMock as jest.Mock;
const stopClipCaptureMock = (MediaPipeGestureDetector as any).stopClipCaptureMock as jest.Mock;
const cancelClipCaptureMock = (MediaPipeGestureDetector as any).cancelClipCaptureMock as jest.Mock;

describe('TrainingScreen', () => {
  let component: renderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    startClipCaptureMock.mockResolvedValue('clip-id');
    stopClipCaptureMock.mockResolvedValue({
      id: 'clip-id',
      base64: 'dGVzdA==',
      mimeType: 'video/mp4',
      durationMs: 500,
      frameCount: 10,
      capturedAt: new Date().toISOString(),
    });
    cancelClipCaptureMock.mockImplementation(() => {});
  });

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

    const findRecordPressable = () =>
      component!.root.findAll(
        (node) =>
          node.type === 'Pressable' &&
          typeof node.props.accessibilityLabel === 'string' &&
          (node.props.accessibilityLabel.includes('Beispiel') ||
            node.props.accessibilityLabel === 'Geste auswählen' ||
            node.props.accessibilityLabel === 'Kamera starten' ||
            node.props.accessibilityLabel === 'Aufnahme stoppen'),
      )[0];

    let recordPressable = findRecordPressable();
    expect(recordPressable.props.disabled).toBe(true);
    expect(recordPressable.props.accessibilityLabel).toBe('Kamera starten');

    await act(async () => {
      recordPressable.props.onPress();
      await Promise.resolve();
    });

    recordPressable = findRecordPressable();
    expect(recordPressable.props.accessibilityLabel).toBe('Kamera starten');

    const detector = component!.root.findByType('MediaPipeGestureDetector');
    act(() => {
      detector.props.onCameraStateChange?.('camera_started');
    });

    recordPressable = findRecordPressable();
    expect(recordPressable.props.disabled).toBe(false);
    expect(recordPressable.props.accessibilityLabel).toBe('Beispiel 1 / 5 aufnehmen');

    await act(async () => {
      recordPressable.props.onPress();
      await Promise.resolve();
    });

    recordPressable = findRecordPressable();
    expect(recordPressable.props.accessibilityLabel).toBe('Aufnahme stoppen');

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

  it('deaktiviert die Aufnahme, wenn MediaRecorder nicht verfügbar ist', async () => {
    const { loadProfile } = require('../../src/storage');
    (loadProfile as jest.Mock).mockResolvedValue(null);

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

    const findRecordPressable = () =>
      component!.root.findAll(
        (node) =>
          node.type === 'Pressable' &&
          typeof node.props.accessibilityLabel === 'string' &&
          (node.props.accessibilityLabel.includes('Beispiel') ||
            node.props.accessibilityLabel === 'Geste auswählen' ||
            node.props.accessibilityLabel === 'Kamera starten' ||
            node.props.accessibilityLabel === 'Aufnahme stoppen' ||
            node.props.accessibilityLabel === 'Videoaufnahmen nicht möglich'),
      )[0];

    const detector = component!.root.findByType('MediaPipeGestureDetector');
    act(() => {
      detector.props.onCameraStateChange?.('camera_started');
    });

    let recordPressable = findRecordPressable();
    expect(recordPressable.props.disabled).toBe(false);

    act(() => {
      detector.props.onError?.('clip_error', { reason: 'media_recorder_unavailable' });
    });

    recordPressable = findRecordPressable();
    expect(recordPressable.props.disabled).toBe(true);
    expect(recordPressable.props.accessibilityLabel).toBe('Videoaufnahmen nicht möglich');
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Dieses Gerät unterstützt keine Videoaufnahmen'),
        tone: 'warning',
      }),
    );
  });

  it('deaktiviert die Aufnahme, wenn MediaRecorder keine passenden Codecs unterstützt', async () => {
    const { loadProfile } = require('../../src/storage');
    (loadProfile as jest.Mock).mockResolvedValue(null);

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

    const findRecordPressable = () =>
      component!.root.findAll(
        (node) =>
          node.type === 'Pressable' &&
          typeof node.props.accessibilityLabel === 'string' &&
          (node.props.accessibilityLabel.includes('Beispiel') ||
            node.props.accessibilityLabel === 'Geste auswählen' ||
            node.props.accessibilityLabel === 'Kamera starten' ||
            node.props.accessibilityLabel === 'Aufnahme stoppen' ||
            node.props.accessibilityLabel === 'Videoaufnahmen nicht möglich'),
      )[0];

    const detector = component!.root.findByType('MediaPipeGestureDetector');
    act(() => {
      detector.props.onCameraStateChange?.('camera_started');
    });

    let recordPressable = findRecordPressable();
    expect(recordPressable.props.disabled).toBe(false);

    act(() => {
      detector.props.onError?.('clip_error', { reason: 'media_recorder_not_supported' });
    });

    recordPressable = findRecordPressable();
    expect(recordPressable.props.disabled).toBe(true);
    expect(recordPressable.props.accessibilityLabel).toBe('Videoaufnahmen nicht möglich');
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Dieses Gerät unterstützt keine Videoaufnahmen'),
        tone: 'warning',
      }),
    );
  });

  it('bleibt im Idle-Zustand, wenn Clip-Aufnahme nicht startet', async () => {
    startClipCaptureMock.mockRejectedValueOnce(new Error('media_recorder_failed'));
    const { loadProfile } = require('../../src/storage');
    (loadProfile as jest.Mock).mockResolvedValue(null);

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

    const findRecordPressable = () =>
      component!.root.findAll(
        (node) =>
          node.type === 'Pressable' &&
          typeof node.props.accessibilityLabel === 'string' &&
          (node.props.accessibilityLabel.includes('Beispiel') ||
            node.props.accessibilityLabel === 'Geste auswählen' ||
            node.props.accessibilityLabel === 'Kamera starten' ||
            node.props.accessibilityLabel === 'Aufnahme stoppen' ||
            node.props.accessibilityLabel === 'Videoaufnahmen nicht möglich'),
      )[0];

    const detector = component!.root.findByType('MediaPipeGestureDetector');
    act(() => {
      detector.props.onCameraStateChange?.('camera_started');
    });

    let recordPressable = findRecordPressable();
    expect(recordPressable.props.disabled).toBe(false);

    await act(async () => {
      recordPressable.props.onPress();
      await Promise.resolve();
    });

    recordPressable = findRecordPressable();
    expect(recordPressable.props.accessibilityLabel).toBe('Beispiel 1 / 5 aufnehmen');
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Videoclip konnte nicht gespeichert werden'),
        tone: 'error',
      }),
    );
  });

  it('zeigt Trainingstipps und gut sichtbare Gestenkarten, wenn noch nichts ausgewählt ist', async () => {
    const storage = require('../../src/storage');
    (storage.loadProfile as jest.Mock).mockResolvedValue(null);

    await act(async () => {
      component = renderer.create(
        (
          <TrainingScreen
            navigation={{ goBack: jest.fn() }}
            route={{ params: {} }}
          />
        ) as any,
      );
      await Promise.resolve();
    });

    const infoTitleNode = component!.root.find(
      (node) => node.type === 'Text' && node.props.children === 'So trainierst du neue Gesten',
    );
    expect(infoTitleNode).toBeTruthy();

    const gestureCardPressable = component!.root.find(
      (node) =>
        node.type === 'Pressable' &&
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.includes('Geste Hallo auswählen'),
    );
    expect(gestureCardPressable).toBeTruthy();
  });
});
