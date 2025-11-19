import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

const mockShowToast = jest.fn();
jest.mock('../../src/context/MessageContext', () => ({
  useMessage: () => ({ showToast: mockShowToast }),
  showToastMock: mockShowToast,
}));

jest.mock('../../src/services/TrainingDataValidator', () => ({
  validateLandmarkSequence: () => ({ ok: true, suggestions: [] }),
}));

jest.mock('react-native-svg', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: (props: any) => React.createElement('Svg', props, props.children),
    Circle: (props: any) => React.createElement('Circle', props),
  };
});

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

jest.mock('../../src/utils/clipPersistence', () => {
  const actual = jest.requireActual('../../src/utils/clipPersistence');
  return {
    ...actual,
    persistClipToDirectory: jest.fn(actual.persistClipToDirectory),
  };
});

jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file://cache/',
  documentDirectory: 'file://documents/',
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  getInfoAsync: jest.fn(async () => ({ exists: true, isDirectory: true })),
  makeDirectoryAsync: jest.fn(async () => {}),
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
  addGesture: jest.fn(),
}));

jest.mock('../../src/storage', () => {
  const actual = jest.requireActual('../../src/storage');
  return {
    ...actual,
    saveTrainingSample: jest.fn(async (sample: any) => sample),
    loadProfile: jest.fn(async () => null),
    loadActiveProfileId: jest.fn(async () => null),
    onActiveProfileChange: jest.fn(),
    saveCustomGesture: jest.fn(async (gesture: any) => gesture),
  };
});

jest.mock('../../src/utils/stringUtils', () => ({
  normalizeGestureLabel: (label: string) => label.toLowerCase().replace(/\s+/g, '_'),
}));

jest.mock('../../src/services/customGestureRegistry', () => ({
  registerCustomGesture: jest.fn(async () => ({ status: 'registered' })),
}));

jest.mock('../../src/services', () => ({
  audioService: {
    playEncouragement: jest.fn(),
    playCelebrationFeedback: jest.fn(),
    speak: jest.fn(),
  },
  syncTrainingData: jest.fn(async () => {}),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

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

import RecordingScreen from '../../src/screens/RecordingScreen';

const { MediaPipeGestureDetector } = require('../../src/components/MediaPipeGestureDetector');
const startClipCaptureMock = (MediaPipeGestureDetector as any).startClipCaptureMock as jest.Mock;
const stopClipCaptureMock = (MediaPipeGestureDetector as any).stopClipCaptureMock as jest.Mock;
const cancelClipCaptureMock = (MediaPipeGestureDetector as any).cancelClipCaptureMock as jest.Mock;
const storage = require('../../src/storage');

const DEFAULT_PROFILE = { id: 'recording-profile', displayName: 'Testprofil' };
const recordPressableMatchers = [
  'Geste auswählen',
  'Kamera starten',
  'Aufnahme stoppen',
  'Profil wird geladen …',
];

describe('RecordingScreen', () => {
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
    mockShowToast.mockClear();
    const fs = require('expo-file-system');
    (fs.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, isDirectory: true });
    (fs.makeDirectoryAsync as jest.Mock).mockResolvedValue(undefined);
    (fs.writeAsStringAsync as jest.Mock).mockResolvedValue(undefined);
    const clipPersistence = require('../../src/utils/clipPersistence');
    const actualClipPersistence = jest.requireActual('../../src/utils/clipPersistence');
    (clipPersistence.persistClipToDirectory as jest.Mock).mockImplementation(
      actualClipPersistence.persistClipToDirectory,
    );
    (storage.loadProfile as jest.Mock).mockResolvedValue(DEFAULT_PROFILE);
  });

  afterEach(() => {
    if (component) {
      act(() => component!.unmount());
      component = null;
    }
  });

  const findRecordPressable = () => {
    if (!component) {
      throw new Error('RecordingScreen not mounted');
    }

    const matches = component.root.findAll(
      (node) =>
        node.type === 'Pressable' &&
        typeof node.props.accessibilityLabel === 'string' &&
        (node.props.accessibilityLabel.includes('Beispiel') ||
          recordPressableMatchers.includes(node.props.accessibilityLabel)),
    );

    if (matches.length === 0) {
      throw new Error('Recording pressable not found');
    }

    return matches[0];
  };

  it('disables recording controls until the camera reports ready', async () => {
    await act(async () => {
      component = renderer.create(
        (
          <RecordingScreen
            navigation={{ goBack: jest.fn() }}
            route={{ params: { gestureLabel: 'hello' } }}
          />
        ) as any,
      );
      await Promise.resolve();
    });

    const infoTitleNode = component!.root.find(
      (node) => node.type === 'Text' && node.props.children === 'So klappt das Gesten-Training',
    );
    expect(infoTitleNode).toBeTruthy();

    let recordPressable = findRecordPressable();
    expect(recordPressable.props.disabled).toBe(true);
    expect(recordPressable.props.accessibilityLabel).toBe('Kamera starten');

    const detector = component!.root.findByType('MediaPipeGestureDetector');
    act(() => {
      detector.props.onCameraStateChange?.('camera_started');
    });

    recordPressable = findRecordPressable();
    expect(recordPressable.props.disabled).toBe(false);
    expect(recordPressable.props.accessibilityLabel).toBe('Beispiel 1 / 5 aufnehmen');
  });

  it('persistiert QuickTime-Clips mit mov-Endung', async () => {
    const fs = require('expo-file-system');
    const { persistClipToDirectory } = require('../../src/utils/clipPersistence');
    (fs.writeAsStringAsync as jest.Mock).mockClear();

    await persistClipToDirectory({
      fs,
      clip: {
        id: 'clip-id',
        base64: 'dGVzdA==',
        mimeType: 'video/quicktime',
        durationMs: 500,
        frameCount: 10,
        capturedAt: new Date().toISOString(),
      } as any,
      directoryName: 'amy-training-clips',
      filePrefix: 'amy-training',
    });

    expect(fs.writeAsStringAsync).toHaveBeenCalledWith(
      'file://documents/amy-training-clips/amy-training-clip-id.mov',
      expect.any(String),
      expect.any(Object),
    );
  });

  it('zeigt eine Fehlermeldung, wenn das Clip-Verzeichnis nicht angelegt werden kann', async () => {
    const { saveTrainingSample } = require('../../src/storage');
    (saveTrainingSample as jest.Mock).mockResolvedValue(undefined);
    const fs = require('expo-file-system');
    (fs.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: false, isDirectory: false });
    (fs.makeDirectoryAsync as jest.Mock).mockRejectedValueOnce(new Error('boom'));

    await act(async () => {
      component = renderer.create(
        (
          <RecordingScreen
            navigation={{ goBack: jest.fn() }}
            route={{ params: { gestureLabel: 'hello' } }}
          />
        ) as any,
      );
      await Promise.resolve();
    });

    const detector = component!.root.findByType('MediaPipeGestureDetector');
    act(() => {
      detector.props.onCameraStateChange?.('camera_started');
    });

    let recordPressable = findRecordPressable();
    await act(async () => {
      recordPressable.props.onPress();
      await Promise.resolve();
    });

    recordPressable = findRecordPressable();
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

    const { ClipCaptureError } = jest.requireActual('../../src/utils/clipPersistence');
    stopClipCaptureMock.mockRejectedValueOnce(new ClipCaptureError('clip_directory_unavailable'));

    await act(async () => {
      recordPressable.props.onPress();
      await Promise.resolve();
    });

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Amy kann auf diesem Gerät keine Videoclips speichern. Deine Handbewegungen werden trotzdem gespeichert.',
        tone: 'info',
      }),
    );
    expect(fs.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it('blockiert die Aufnahme, bis ein Profil geladen wurde', async () => {
    (storage.loadProfile as jest.Mock).mockResolvedValue(null);

    await act(async () => {
      component = renderer.create(
        (
          <RecordingScreen
            navigation={{ goBack: jest.fn() }}
            route={{ params: { gestureLabel: 'hello' } }}
          />
        ) as any,
      );
      await Promise.resolve();
    });

    const recordPressable = findRecordPressable();
    expect(recordPressable.props.disabled).toBe(true);
    expect(recordPressable.props.accessibilityLabel).toBe('Profil wird geladen …');
  });

});
