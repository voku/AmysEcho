import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (props: any) => React.createElement('View', props, props.children),
    Text: (props: any) => React.createElement('Text', props, props.children),
    Button: (props: any) => React.createElement('Button', props, props.children),
    Switch: (props: any) => React.createElement('Switch', props, props.children),
    SafeAreaView: (props: any) => React.createElement('SafeAreaView', props, props.children),
    StyleSheet: { create: (s: any) => s },
    Animated: {
      Value: class { constructor(public v: any) {} setValue(_: any) {} },
      timing: () => ({ start: jest.fn() }),
      spring: () => ({ start: jest.fn() }),
      delay: () => ({ start: jest.fn(), stop: jest.fn() }),
      sequence: () => ({ start: jest.fn(), stop: jest.fn() }),
      View: (p: any) => React.createElement('Animated.View', p, p.children),
      Text: (p: any) => React.createElement('Animated.Text', p, p.children),
    },
    Easing: { out: (fn: any) => fn, ease: (t: number) => t },
    AccessibilityInfo: {
      isScreenReaderEnabled: jest.fn().mockResolvedValue(false),
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    },
  } as any;
});

jest.mock('../../src/services/LanguageManager', () => ({
  LanguageManager: {
    t: (k: string) =>
      k === 'recognition.toggleDgsVideo'
        ? 'DGS-Video umschalten'
        : k === 'recognition.showDgsVideo'
        ? 'DGS-Video anzeigen'
        : k === 'celebration.label'
        ? 'Gut gemacht!'
        : k,
    getGestureLabel: (id: string) => (id === 'hello' ? 'Hallo' : id),
  },
}));

import RecognitionScreen from '../../src/screens/RecognitionScreen';
import Celebration from '../../src/components/Celebration';
import { audioService, triggerSpeakAndShow, announceGestureRecognition } from '../../src/services';

jest.mock('../../src/components/MediaPipeGestureDetector', () => {
  const React = require('react');
  return {
    MediaPipeGestureDetector: (props: any) => React.createElement('MediaPipeGestureDetector', props, null),
  };
});
jest.mock('../../src/components/BottomNav', () => () => null);
jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false }),
}));
jest.mock('../../src/components/CorrectionPanel', () => {
  const React = require('react');
  return (props: any) => React.createElement('CorrectionPanel', props, null);
});
jest.mock('../../src/components/DgsVideoPlayer', () => {
  const React = require('react');
  return (props: any) => React.createElement('DgsVideoPlayer', props, null);
});
jest.mock('../../src/services', () => ({
  audioService: {
    speak: jest.fn(),
    playEncouragement: jest.fn(),
    playSuccessFeedback: jest.fn(),
    playErrorFeedback: jest.fn(),
    playSound: jest.fn(),
  },
  triggerSpeakAndShow: jest.fn((_: any, __: any, cb: () => void) => cb()),
  correctionService: { logCorrection: jest.fn() },
  dialogEngine: { getSuggestions: jest.fn() },
  announceGestureRecognition: jest.fn(),
}));
jest.mock('../../src/telemetry/recorder', () => ({
  telemetry: { add: jest.fn() },
}));
jest.mock('../../src/storage', () => ({
  loadProfile: () => Promise.resolve(null),
  logCorrection: jest.fn(),
}));
jest.mock('../../src/model', () => ({
  gestureModel: { gestures: [{ id: 'hello', label: 'Hello', dgsVideoUri: 'video.mp4' }] },
}));
jest.mock('../../src/context/MessageContext', () => ({
  useMessage: () => ({ setMessage: jest.fn(), message: null }),
}));
jest.mock('../../src/services/dgsModelClient', () => ({
  onMlpModelUpdated: jest.fn(() => () => {}),
}));
jest.mock('../../src/services/localCentroids', () => ({
  buildLocalCentroids: jest.fn().mockResolvedValue({ foo: [[0, 0, 0]] }),
}));
const mockClassifyWithCentroids = jest.fn();
jest.mock('../../src/services/offlineClassifier', () => ({
  classifyWithCentroids: (...args: any[]) => mockClassifyWithCentroids(...args),
}));
jest.mock('../../src/services/handUtils', () => ({
  flattenHandsWithHandedness: jest.fn(() => [[0, 0, 0]]),
}));

describe('RecognitionScreen', () => {
  let component: renderer.ReactTestRenderer | null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClassifyWithCentroids.mockReset();
    mockClassifyWithCentroids.mockReturnValue(null);
    component = null;
  });

  afterEach(() => {
    if (component) {
      act(() => component!.unmount());
      component = null;
    }
  });

  it('navigates to Correction screen when correction button is pressed', async () => {
    const navigate = jest.fn();
    await act(async () => {
      component = renderer.create(
        <RecognitionScreen navigation={{ navigate } as any} />,
      );
    });
    const button = component.root.findByProps({ testID: 'btn-correction' });
    act(() => {
      button.props.onPress();
    });
    expect(navigate).toHaveBeenCalledWith('Correction');
  });

  it('navigates to Teaching screen when teach button is pressed', async () => {
    const navigate = jest.fn();
    await act(async () => {
      component = renderer.create(
        <RecognitionScreen navigation={{ navigate } as any} />,
      );
    });
    const button = component.root.findByProps({ testID: 'btn-teach' });
    act(() => {
      button.props.onPress();
    });
    expect(navigate).toHaveBeenCalledWith('Teaching');
  });

  it('shows correction panel when help-me-choose button is pressed', async () => {
    await act(async () => {
      component = renderer.create(
        <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />,
      );
    });
    const button = component.root.findByProps({ testID: 'btn-help-me-choose' });
    act(() => {
      button.props.onPress();
    });
    const panels = component.root.findAllByType('CorrectionPanel');
    expect(panels.length).toBe(1);
  });

  it('exposes correction button accessibility label', async () => {
    await act(async () => {
      component = renderer.create(
        <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />,
      );
    });
    const button = component.root.findByProps({ testID: 'btn-correction' });
    expect(button.props.accessibilityLabel).toBe('Korrekturseite öffnen');
  });

  it('provides positive feedback for all gesture attempts (Amy optimization)', async () => {
    await act(async () => {
      component = renderer.create(
        <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />,
      );
    });
    const detector = component.root.findByType('MediaPipeGestureDetector');
    await act(async () => {
      // Use confidence that triggers uncertain path but still gets feedback
      await detector.props.onGestureDetected(null, 0.3, [], []);
    });
    // Amy First: All attempts get positive feedback, not error feedback
    expect(audioService.playErrorFeedback).not.toHaveBeenCalled();
    expect(audioService.playSound).toHaveBeenCalledWith('confirmation', { volume: 0.5 });
  });

  it('shows DGS video when toggle enabled and gesture recognized', async () => {
    await act(async () => {
      component = renderer.create(
        <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />,
      );
    });
    const toggle = component.root.findByProps({ accessibilityLabel: 'DGS-Video umschalten' });
    act(() => {
      toggle.props.onValueChange(true);
    });
    const detector = component.root.findByType('MediaPipeGestureDetector');
    await act(async () => {
      detector.props.onGestureDetected('hello', 0.9, [], []);
    });
    const vids = component.root.findAllByType('DgsVideoPlayer');
    expect(vids.length).toBe(1);
  });

  it('falls back to centroid classification when local detection is uncertain', async () => {
    await act(async () => {
      component = renderer.create(
        <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />,
      );
    });
    await act(async () => {});
    const detector = component.root.findByType('MediaPipeGestureDetector');
    await act(async () => {
      mockClassifyWithCentroids.mockReturnValue({ label: 'hello', confidence: 0.95 });
      await detector.props.onGestureDetected(null, 0.1, [], []);
    });
    const pathNode = component.root.findByProps({ testID: 'recognition-path' });
    const txt = Array.isArray(pathNode.props.children)
      ? pathNode.props.children.join(' ')
      : String(pathNode.props.children);
    expect(txt.trim().toLowerCase()).toContain('centroid');
  });

  it('shows celebration when gesture recognized with high confidence', async () => {
    await act(async () => {
      component = renderer.create(
        <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />,
      );
    });
    const detector = component.root.findByType('MediaPipeGestureDetector');
    await act(async () => {
      detector.props.onGestureDetected('hello', 0.9, [], []);
    });
    const celebrations = component.root.findAllByType(Celebration);
    expect(celebrations.length).toBe(1);
    // Amy optimization: provideInstantFeedback also calls triggerSpeakAndShow
    expect(triggerSpeakAndShow).toHaveBeenCalledTimes(2);
    // announceGestureRecognition is called from both successful recognition and provideInstantFeedback
    expect(announceGestureRecognition).toHaveBeenCalledTimes(2);
  });

  it('does not spam celebration for repeated gestures', async () => {
    await act(async () => {
      component = renderer.create(
        <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />,
      );
    });
    const detector = component.root.findByType('MediaPipeGestureDetector');
    await act(async () => {
      detector.props.onGestureDetected('hello', 0.9, [], []);
      detector.props.onGestureDetected('hello', 0.95, [], []);
    });
    // First call from successful recognition, second from provideInstantFeedback
    expect(triggerSpeakAndShow).toHaveBeenCalledTimes(2);
    // announceGestureRecognition is called from both successful recognition and provideInstantFeedback
    expect(announceGestureRecognition).toHaveBeenCalledTimes(2);
  });

  it('prioritizes emergency gestures immediately', async () => {
    await act(async () => {
      component = renderer.create(
        <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />,
      );
    });
    const detector = component.root.findByType('MediaPipeGestureDetector');
    await act(async () => {
      detector.props.onGestureDetected('hilfe', 0.4, [], [], true); // emergency = true
    });
    expect(audioService.speak).toHaveBeenCalledWith('hilfe');
    expect(audioService.playSound).toHaveBeenCalledWith('success', { volume: 0.8 });
  });

  it('processes every gesture immediately (Amy optimization - no throttling)', async () => {
    await act(async () => {
      component = renderer.create(
        <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />,
      );
    });
    const detector = component.root.findByType('MediaPipeGestureDetector');
    await act(async () => {
      detector.props.onGestureDetected('hello', 0.9, [], []);
      detector.props.onGestureDetected(null, 0.3, [], []);
    });
    // Amy First: No throttling - every gesture is processed immediately
    // First call from successful recognition, second from provideInstantFeedback for failed attempt
    expect(triggerSpeakAndShow).toHaveBeenCalledTimes(2);
  });
});
