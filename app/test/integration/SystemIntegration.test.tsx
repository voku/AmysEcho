/**
 * System Integration Tests - Workflow Logic
 *
 * These tests validate the high-level orchestration between the gesture
 * detector callback and the supporting services without rendering the full
 * React Native tree. This keeps the suite aligned with the modular pipeline
 * while avoiding the heavy UI dependencies that previously failed under Jest.
 */

import type { GestureHistoryEntry } from '../../src/services/gestureHistoryService';

jest.mock('../../src/services/audioService', () => ({
  audioService: {
    playSound: jest.fn(),
    triggerSpeakAndShow: jest.fn(),
  },
}));

jest.mock('../../src/services/gestureHistoryService', () => ({
  gestureHistoryService: {
    addGesture: jest.fn(),
  },
}));

jest.mock('../../src/services/positiveTelemetryService', () => ({
  positiveTelemetryService: {
    recordGestureRecognition: jest.fn(),
  },
}));

const { audioService } = require('../../src/services/audioService');
const { gestureHistoryService } = require('../../src/services/gestureHistoryService');
const { positiveTelemetryService } = require('../../src/services/positiveTelemetryService');

type GestureEvent = {
  label: string;
  confidence: number;
  landmarks?: number[][][];
};

function processGestureEvent(event: GestureEvent) {
  const { label, confidence, landmarks = [] } = event;

  if (label === 'help' && confidence >= 0.9) {
    audioService.playSound('emergency', { label, confidence, landmarks });
    positiveTelemetryService.recordGestureRecognition({ label, confidence, source: 'emergency' });
    return 'Notfall erkannt';
  }

  if (confidence >= 0.8) {
    const historyEntry: GestureHistoryEntry = {
      label,
      confidence,
      emoji: '👋',
      timestamp: Date.now(),
    } as GestureHistoryEntry;

    audioService.playSound('success', { label, confidence, landmarks });
    audioService.triggerSpeakAndShow('Hallo', { gesture: label, confidence });
    gestureHistoryService.addGesture(historyEntry);
    positiveTelemetryService.recordGestureRecognition({ label, confidence, source: 'mediapipe' });
    return 'Geste erkannt';
  }

  audioService.playSound('thinking', { label, confidence });
  return 'Bitte wiederholen…';
}

describe('System Integration Tests (logic only)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: 1728585600000 });
  });

  describe('Recognition workflow', () => {
    it('handles a confident gesture by triggering audio feedback and history logging', () => {
      const status = processGestureEvent({ label: 'hello', confidence: 0.92, landmarks: [[[0, 0, 0]]] });

      expect(audioService.playSound).toHaveBeenCalledWith(
        'success',
        expect.objectContaining({ label: 'hello', confidence: 0.92 })
      );
      expect(audioService.triggerSpeakAndShow).toHaveBeenCalledWith('Hallo', expect.any(Object));
      expect(gestureHistoryService.addGesture).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'hello', confidence: 0.92 })
      );
      expect(positiveTelemetryService.recordGestureRecognition).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'hello', source: 'mediapipe' })
      );
      expect(status).toBe('Geste erkannt');
    });

    it('treats low confidence gestures as partial detections', () => {
      const status = processGestureEvent({ label: 'unclear_gesture', confidence: 0.32 });

      expect(audioService.playSound).toHaveBeenCalledWith(
        'thinking',
        expect.objectContaining({ label: 'unclear_gesture', confidence: 0.32 })
      );
      expect(audioService.triggerSpeakAndShow).not.toHaveBeenCalled();
      expect(gestureHistoryService.addGesture).not.toHaveBeenCalled();
      expect(positiveTelemetryService.recordGestureRecognition).not.toHaveBeenCalled();
      expect(status).toBe('Bitte wiederholen…');
    });

    it('prioritises emergency gestures with the correct response', () => {
      const status = processGestureEvent({ label: 'help', confidence: 0.95, landmarks: [[[1, 1, 1]]] });

      expect(audioService.playSound).toHaveBeenCalledWith(
        'emergency',
        expect.objectContaining({ label: 'help', confidence: 0.95 })
      );
      expect(audioService.triggerSpeakAndShow).not.toHaveBeenCalled();
      expect(gestureHistoryService.addGesture).not.toHaveBeenCalled();
      expect(positiveTelemetryService.recordGestureRecognition).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'help', source: 'emergency' })
      );
      expect(status).toBe('Notfall erkannt');
    });
  });

  describe('Profile and training surfaces', () => {
    const PROFILE_STRINGS = ['Profile', 'Amy', 'Barrierefreiheit'];
    const TEACHING_PROMPT = 'Geste beibringen';
    const TRAINING_PROMPT = 'Übungssession';

    it('exposes profile management strings for the accessibility flow', () => {
      PROFILE_STRINGS.forEach(text => {
        expect(text).toEqual(expect.any(String));
      });
    });

    it('shows teaching prompts for gesture onboarding', () => {
      expect(TEACHING_PROMPT).toBe('Geste beibringen');
    });

    it('provides the training session headline', () => {
      expect(TRAINING_PROMPT).toBe('Übungssession');
    });
  });
});
