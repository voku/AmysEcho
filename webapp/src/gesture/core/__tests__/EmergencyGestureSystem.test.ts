import { describe, expect, it, beforeEach, vi } from 'vitest';

// Mock the MessageBatcher before importing the module
vi.mock('../../utils/MessageBatcher', () => ({
  messageBatcher: {
    queueMessage: vi.fn(),
  },
}));

import { EmergencyGestureSystem } from '../EmergencyGestureSystem';
import { messageBatcher } from '../../utils/MessageBatcher';

describe('EmergencyGestureSystem', () => {
  let system: EmergencyGestureSystem;

  beforeEach(() => {
    vi.clearAllMocks();
    system = new EmergencyGestureSystem();
  });

  describe('isEmergencyGesture', () => {
    it('flags key emergency gestures even at low confidence', () => {
      ['hilfe', 'help', 'danger'].forEach((gesture) => {
        expect(system.isEmergencyGesture(gesture, 0.3)).toBe(true);
      });
    });

    it('returns false for non-emergency gestures even with high confidence', () => {
      expect(system.isEmergencyGesture('hello', 0.9)).toBe(false);
      expect(system.isEmergencyGesture('wave', 0.95)).toBe(false);
    });

    it('returns false for empty or invalid gesture', () => {
      expect(system.isEmergencyGesture('', 0.9)).toBe(false);
      expect(system.isEmergencyGesture(null as any, 0.9)).toBe(false);
    });

    it('returns false when confidence is too low', () => {
      expect(system.isEmergencyGesture('hilfe', 0.1)).toBe(false);
    });

    it('recognizes all emergency gesture variations', () => {
      const emergencyGestures = [
        'hilfe', 'help', 'emergency', 'stop', 'danger',
        'notfall', 'gefahr', 'au', 'schmerz', 'angst'
      ];
      emergencyGestures.forEach((gesture) => {
        expect(system.isEmergencyGesture(gesture, 0.3)).toBe(true);
      });
    });

    it('is case-insensitive', () => {
      expect(system.isEmergencyGesture('HILFE', 0.3)).toBe(true);
      expect(system.isEmergencyGesture('Help', 0.3)).toBe(true);
    });
  });

  describe('processEmergencyGesture', () => {
    it('processes emergencies with critical priority and feedback', () => {
      const result = system.processEmergencyGesture('hilfe', 0.4, [[[0, 0, 0]]]);
      expect(result.shouldProcess).toBe(true);
      expect(result.priority).toBe('critical');
      expect(result.feedback).toContain('Hilfe');
    });

    it('calls messageBatcher with correct event type', () => {
      system.processEmergencyGesture('hilfe', 0.4, [[[0, 0, 0]]]);
      expect(messageBatcher.queueMessage).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'emergency_gesture_detected' }),
        expect.any(Object),
      );
    });

    it('enforces cooldown between repeated emergencies', () => {
      system.processEmergencyGesture('hilfe', 0.4, [[[0, 0, 0]]]);
      const second = system.processEmergencyGesture('hilfe', 0.4, [[[0, 0, 0]]]);
      expect(second.shouldProcess).toBe(false);
      expect(second.cooldownRemaining).toBeGreaterThan(0);
    });

    it('returns normal priority for non-emergency gestures', () => {
      const result = system.processEmergencyGesture('wave', 0.9, [[[0, 0, 0]]]);
      expect(result.shouldProcess).toBe(false);
      expect(result.priority).toBe('normal');
    });

    it('provides appropriate feedback for different emergency gestures', () => {
      const stopResult = system.processEmergencyGesture('stop', 0.4, [[[0, 0, 0]]]);
      expect(stopResult.feedback).toContain('Stop');

      // Reset cooldown for next test
      system.reset();

      const dangerResult = system.processEmergencyGesture('danger', 0.4, [[[0, 0, 0]]]);
      expect(dangerResult.feedback).toContain('Gefahr');
    });
  });

  describe('shouldEnterEmergencyMode', () => {
    it('recommends emergency-only mode after multiple incidents', () => {
      const nowSpy = vi.spyOn(Date, 'now');
      for (let i = 0; i < 3; i += 1) {
        nowSpy.mockReturnValue(1_000 + i * 600); // Spaced 600ms apart to pass cooldown
        system.processEmergencyGesture('hilfe', 0.4, [[[0, 0, 0]]]);
        vi.clearAllMocks();
      }
      nowSpy.mockReturnValue(3_000);
      expect(system.shouldEnterEmergencyMode()).toBe(true);
      nowSpy.mockRestore();
    });

    it('returns false with few emergencies', () => {
      system.processEmergencyGesture('hilfe', 0.4, [[[0, 0, 0]]]);
      expect(system.shouldEnterEmergencyMode()).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('returns correct status after emergencies', () => {
      system.processEmergencyGesture('hilfe', 0.4, [[[0, 0, 0]]]);
      const status = system.getStatus();
      expect(status.activeEmergencies).toBe(1);
      expect(status.lastEmergencyTime).toBeGreaterThan(0);
    });

    it('returns zero activeEmergencies initially', () => {
      const status = system.getStatus();
      expect(status.activeEmergencies).toBe(0);
      expect(status.emergencyModeRecommended).toBe(false);
    });
  });

  describe('reset', () => {
    it('clears history and cooldown state', () => {
      system.processEmergencyGesture('hilfe', 0.4, [[[0, 0, 0]]]);
      system.reset();
      const result = system.processEmergencyGesture('hilfe', 0.4, [[[0, 0, 0]]]);
      expect(result.shouldProcess).toBe(true);
    });

    it('resets status to initial state', () => {
      system.processEmergencyGesture('hilfe', 0.4, [[[0, 0, 0]]]);
      system.reset();
      const status = system.getStatus();
      expect(status.activeEmergencies).toBe(0);
      expect(status.lastEmergencyTime).toBe(0);
    });
  });
});
