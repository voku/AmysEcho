import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import RecognitionScreen from '../../src/screens/RecognitionScreen';
import { audioService, triggerSpeakAndShow } from '../../src/services';

// Mock all dependencies
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

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (props: any) => React.createElement('View', props, props.children),
    Text: (props: any) => React.createElement('Text', props, props.children),
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
    AccessibilityInfo: {
      isScreenReaderEnabled: jest.fn().mockResolvedValue(false),
    },
  } as any;
});

jest.mock('../../src/services/LanguageManager', () => ({
  LanguageManager: {
    t: (k: string) => k === 'recognition.toggleDgsVideo' ? 'DGS-Video umschalten' : k,
    getGestureLabel: (id: string) => {
      const labels: { [key: string]: string } = {
        red: 'Rot',
        blue: 'Blau',
        green: 'Grün',
        yellow: 'Gelb',
        apple: 'Apfel',
        banana: 'Banane',
        bread: 'Brot',
        milk: 'Milch',
        hello: 'Hallo'
      };
      return labels[id] || id;
    },
  },
}));

jest.mock('../../src/components/MediaPipeGestureDetector', () => {
  const React = require('react');
  return {
    MediaPipeGestureDetector: (props: any) => React.createElement('MediaPipeGestureDetector', props, props.children),
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
jest.mock('../../src/components/Celebration', () => {
  const React = require('react');
  return (props: any) => React.createElement('Celebration', props, null);
});

jest.mock('../../src/telemetry/recorder', () => ({
  telemetry: { add: jest.fn() },
}));
jest.mock('../../src/storage', () => ({
  loadProfile: () => Promise.resolve(null),
  logCorrection: jest.fn(),
}));
jest.mock('../../src/model', () => ({
  gestureModel: {
    gestures: [
      { id: 'red', label: 'Red', dgsVideoUri: 'dgs/red.mp4' },
      { id: 'blue', label: 'Blue', dgsVideoUri: 'dgs/blue.mp4' },
      { id: 'green', label: 'Green', dgsVideoUri: 'dgs/green.mp4' },
      { id: 'yellow', label: 'Yellow', dgsVideoUri: 'dgs/yellow.mp4' },
      { id: 'apple', label: 'Apple', dgsVideoUri: 'dgs/apple.mp4' },
      { id: 'banana', label: 'Banana', dgsVideoUri: 'dgs/banana.mp4' },
      { id: 'bread', label: 'Bread', dgsVideoUri: 'dgs/bread.mp4' },
      { id: 'milk', label: 'Milk', dgsVideoUri: 'dgs/milk.mp4' },
      { id: 'hello', label: 'Hello', dgsVideoUri: 'dgs/hello.mp4' }
    ]
  },
}));
jest.mock('../../src/context/MessageContext', () => ({
  useMessage: () => ({ setMessage: jest.fn(), message: null }),
}));
jest.mock('../../src/services/dgsModelClient', () => ({
  onMlpModelUpdated: jest.fn(() => () => {}),
}));
jest.mock('../../src/services/localCentroids', () => ({
  buildLocalCentroids: jest.fn().mockResolvedValue({
    red: [[0.5, 0.5, -0.05]],
    blue: [[0.51, 0.5, -0.05]],
    apple: [[0.52, 0.5, -0.05]]
  }),
}));

const mockClassifyWithCentroids = jest.fn();
jest.mock('../../src/services/offlineClassifier', () => ({
  classifyWithCentroids: (...args: any[]) => mockClassifyWithCentroids(...args),
}));

describe('Gesture Recognition Integration - Amy Vocabulary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClassifyWithCentroids.mockReset();
  });

  describe('Color Gesture Recognition', () => {
    it('recognizes red gesture and provides German feedback', async () => {
      mockClassifyWithCentroids.mockReturnValue({ label: 'red', confidence: 0.9 });

      const { getByText } = render(
        <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />
      );

      // Simulate gesture detection
      const detector = getByText('MediaPipeGestureDetector');
      await act(async () => {
        detector.props.onGestureDetected('red', 0.9, [], []);
      });

      await waitFor(() => {
        expect(audioService.speak).toHaveBeenCalledWith('Rot');
        expect(triggerSpeakAndShow).toHaveBeenCalled();
      });
    });

    it('recognizes blue gesture with celebration', async () => {
      mockClassifyWithCentroids.mockReturnValue({ label: 'blue', confidence: 0.95 });

      const { getByText } = render(
        <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />
      );

      const detector = getByText('MediaPipeGestureDetector');
      await act(async () => {
        detector.props.onGestureDetected('blue', 0.95, [], []);
      });

      await waitFor(() => {
        expect(audioService.speak).toHaveBeenCalledWith('Blau');
        expect(audioService.playSuccessFeedback).toHaveBeenCalled();
      });
    });

    it('handles all color gestures', async () => {
      const colors = ['red', 'blue', 'green', 'yellow'];
      const germanLabels = ['Rot', 'Blau', 'Grün', 'Gelb'];

      for (let i = 0; i < colors.length; i++) {
        const color = colors[i];
        const label = germanLabels[i];

        mockClassifyWithCentroids.mockReturnValue({ label: color, confidence: 0.9 });

        const { getByText } = render(
          <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />
        );

        const detector = getByText('MediaPipeGestureDetector');
        await act(async () => {
          detector.props.onGestureDetected(color, 0.9, [], []);
        });

        await waitFor(() => {
          expect(audioService.speak).toHaveBeenCalledWith(label);
        });
      }
    });
  });

  describe('Food Gesture Recognition', () => {
    it('recognizes apple gesture', async () => {
      mockClassifyWithCentroids.mockReturnValue({ label: 'apple', confidence: 0.88 });

      const { getByText } = render(
        <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />
      );

      const detector = getByText('MediaPipeGestureDetector');
      await act(async () => {
        detector.props.onGestureDetected('apple', 0.88, [], []);
      });

      await waitFor(() => {
        expect(audioService.speak).toHaveBeenCalledWith('Apfel');
        expect(audioService.playSound).toHaveBeenCalledWith('confirmation', { volume: 0.5 });
      });
    });

    it('recognizes banana gesture', async () => {
      mockClassifyWithCentroids.mockReturnValue({ label: 'banana', confidence: 0.92 });

      const { getByText } = render(
        <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />
      );

      const detector = getByText('MediaPipeGestureDetector');
      await act(async () => {
        detector.props.onGestureDetected('banana', 0.92, [], []);
      });

      await waitFor(() => {
        expect(audioService.speak).toHaveBeenCalledWith('Banane');
      });
    });

    it('handles all food gestures', async () => {
      const foods = ['apple', 'banana', 'bread', 'milk'];
      const germanLabels = ['Apfel', 'Banane', 'Brot', 'Milch'];

      for (let i = 0; i < foods.length; i++) {
        const food = foods[i];
        const label = germanLabels[i];

        mockClassifyWithCentroids.mockReturnValue({ label: food, confidence: 0.9 });

        const { getByText } = render(
          <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />
        );

        const detector = getByText('MediaPipeGestureDetector');
        await act(async () => {
          detector.props.onGestureDetected(food, 0.9, [], []);
        });

        await waitFor(() => {
          expect(audioService.speak).toHaveBeenCalledWith(label);
        });
      }
    });
  });

  describe('Amy-First Optimizations', () => {
    it('provides positive feedback for all attempts (no error sounds)', async () => {
      mockClassifyWithCentroids.mockReturnValue(null); // Unrecognized gesture

      const { getByText } = render(
        <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />
      );

      const detector = getByText('MediaPipeGestureDetector');
      await act(async () => {
        detector.props.onGestureDetected(null, 0.3, [], []);
      });

      await waitFor(() => {
        expect(audioService.playErrorFeedback).not.toHaveBeenCalled();
        expect(audioService.playSound).toHaveBeenCalledWith('confirmation', { volume: 0.5 });
      });
    });

    it('processes gestures immediately without throttling', async () => {
      mockClassifyWithCentroids.mockReturnValue({ label: 'red', confidence: 0.8 });

      const { getByText } = render(
        <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />
      );

      const detector = getByText('MediaPipeGestureDetector');

      // Simulate rapid gesture attempts
      await act(async () => {
        detector.props.onGestureDetected('red', 0.8, [], []);
        detector.props.onGestureDetected('blue', 0.7, [], []);
        detector.props.onGestureDetected('apple', 0.9, [], []);
      });

      await waitFor(() => {
        expect(triggerSpeakAndShow).toHaveBeenCalledTimes(3);
      });
    });

    it('prioritizes emergency gestures', async () => {
      const { getByText } = render(
        <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />
      );

      const detector = getByText('MediaPipeGestureDetector');
      await act(async () => {
        detector.props.onGestureDetected('hilfe', 0.4, [], [], true); // emergency = true
      });

      await waitFor(() => {
        expect(audioService.speak).toHaveBeenCalledWith('hilfe');
        expect(audioService.playSound).toHaveBeenCalledWith('success', { volume: 0.8 });
      });
    });
  });

  describe('Fallback Classification', () => {
    it('falls back to centroid classification when primary detection fails', async () => {
      mockClassifyWithCentroids.mockReturnValue({ label: 'red', confidence: 0.85 });

      const { getByText } = render(
        <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />
      );

      const detector = getByText('MediaPipeGestureDetector');
      await act(async () => {
        detector.props.onGestureDetected(null, 0.1, [], []); // Low confidence, triggers fallback
      });

      await waitFor(() => {
        expect(mockClassifyWithCentroids).toHaveBeenCalled();
        expect(audioService.speak).toHaveBeenCalledWith('Rot');
      });
    });

    it('handles centroid classification failures gracefully', async () => {
      mockClassifyWithCentroids.mockReturnValue(null);

      const { getByText } = render(
        <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />
      );

      const detector = getByText('MediaPipeGestureDetector');
      await act(async () => {
        detector.props.onGestureDetected(null, 0.1, [], []);
      });

      await waitFor(() => {
        expect(audioService.playSound).toHaveBeenCalledWith('confirmation', { volume: 0.5 });
        expect(audioService.playErrorFeedback).not.toHaveBeenCalled();
      });
    });
  });

  describe('Accessibility and Localization', () => {
    it('provides German labels for all Amy gestures', async () => {
      const gestures = [
        { id: 'red', label: 'Rot' },
        { id: 'blue', label: 'Blau' },
        { id: 'green', label: 'Grün' },
        { id: 'yellow', label: 'Gelb' },
        { id: 'apple', label: 'Apfel' },
        { id: 'banana', label: 'Banane' },
        { id: 'bread', label: 'Brot' },
        { id: 'milk', label: 'Milch' }
      ];

      for (const gesture of gestures) {
        mockClassifyWithCentroids.mockReturnValue({ label: gesture.id, confidence: 0.9 });

        const { getByText } = render(
          <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />
        );

        const detector = getByText('MediaPipeGestureDetector');
        await act(async () => {
          detector.props.onGestureDetected(gesture.id, 0.9, [], []);
        });

        await waitFor(() => {
          expect(audioService.speak).toHaveBeenCalledWith(gesture.label);
        });
      }
    });

    it('maintains accessibility labels in German', async () => {
      const { getByText } = render(
        <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />
      );

      const correctionButton = getByText('Korrekturseite öffnen');
      expect(correctionButton).toBeTruthy();
    });
  });

  describe('Performance and Reliability', () => {
    it('handles rapid gesture sequences without crashing', async () => {
      const { getByText } = render(
        <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />
      );

      const detector = getByText('MediaPipeGestureDetector');

      // Simulate rapid gesture attempts
      await act(async () => {
        for (let i = 0; i < 10; i++) {
          detector.props.onGestureDetected('red', 0.8 + i * 0.01, [], []);
        }
      });

      await waitFor(() => {
        expect(triggerSpeakAndShow).toHaveBeenCalledTimes(10);
      });
    });

    it('recovers from classification errors', async () => {
      mockClassifyWithCentroids.mockImplementation(() => {
        throw new Error('Classification failed');
      });

      const { getByText } = render(
        <RecognitionScreen navigation={{ navigate: jest.fn() } as any} />
      );

      const detector = getByText('MediaPipeGestureDetector');

      // Should not crash the app
      await act(async () => {
        detector.props.onGestureDetected(null, 0.1, [], []);
      });

      await waitFor(() => {
        expect(audioService.playSound).toHaveBeenCalledWith('confirmation', { volume: 0.5 });
      });
    });
  });
});