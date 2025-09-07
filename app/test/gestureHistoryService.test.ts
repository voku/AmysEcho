import { gestureHistoryService, GestureHistoryEntry } from '../src/services/gestureHistoryService';

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

// Mock window.localStorage
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

// Mock logger
jest.mock('../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('GestureHistoryService', () => {
  let service: typeof gestureHistoryService;

  beforeEach(() => {
    // Reset the singleton instance for each test
    (gestureHistoryService as any).history = [];
    service = gestureHistoryService;

    // Reset all mocks
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
    mockLocalStorage.setItem.mockImplementation(() => undefined);
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = gestureHistoryService;
      const instance2 = gestureHistoryService;
      expect(instance1).toBe(instance2);
    });
  });

  describe('addGesture', () => {
    it('should add a gesture to history with timestamp', () => {
      const gestureData = {
        id: 'test_gesture_1',
        label: 'Hello',
        emoji: '👋',
        confidence: 0.85,
        landmarks: [[[0.1, 0.2, 0.3]]],
        category: 'greeting',
        audioResponse: 'Hello there!'
      };

      const beforeTime = Date.now();
      service.addGesture(gestureData);
      const afterTime = Date.now();

      const history = service.getRecentHistory();
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('test_gesture_1');
      expect(history[0].label).toBe('Hello');
      expect(history[0].emoji).toBe('👋');
      expect(history[0].confidence).toBe(0.85);
      expect(history[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(history[0].timestamp).toBeLessThanOrEqual(afterTime);
      expect(history[0].landmarks).toEqual([[[0.1, 0.2, 0.3]]]);
      expect(history[0].category).toBe('greeting');
      expect(history[0].audioResponse).toBe('Hello there!');
    });

    it('should add gestures to the beginning of history', () => {
      service.addGesture({
        id: 'gesture_1',
        label: 'First',
        emoji: '1️⃣',
        confidence: 0.8
      });

      service.addGesture({
        id: 'gesture_2',
        label: 'Second',
        emoji: '2️⃣',
        confidence: 0.9
      });

      const history = service.getRecentHistory();
      expect(history).toHaveLength(2);
      expect(history[0].label).toBe('Second'); // Most recent first
      expect(history[1].label).toBe('First');
    });

    it('should maintain maximum history size', () => {
      // Add 12 gestures (MAX_HISTORY = 10)
      for (let i = 1; i <= 12; i++) {
        service.addGesture({
          id: `gesture_${i}`,
          label: `Gesture ${i}`,
          emoji: `${i}️⃣`,
          confidence: 0.8
        });
      }

      const history = service.getRecentHistory();
      expect(history).toHaveLength(10);
      expect(history[0].label).toBe('Gesture 12'); // Most recent
      expect(history[9].label).toBe('Gesture 3'); // 10th most recent
    });

    it('should save history after adding gesture', () => {
      service.addGesture({
        id: 'save_test',
        label: 'Save Test',
        emoji: '💾',
        confidence: 0.8
      });

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'amys_echo_gesture_history',
        expect.any(String)
      );
    });

    it('should handle gestures without optional fields', () => {
      service.addGesture({
        id: 'minimal_gesture',
        label: 'Minimal',
        emoji: '🔸',
        confidence: 0.7
      });

      const history = service.getRecentHistory();
      expect(history[0].landmarks).toBeUndefined();
      expect(history[0].category).toBeUndefined();
      expect(history[0].audioResponse).toBeUndefined();
    });
  });

  describe('getRecentHistory', () => {
    beforeEach(() => {
      // Add some test gestures
      for (let i = 1; i <= 5; i++) {
        service.addGesture({
          id: `gesture_${i}`,
          label: `Gesture ${i}`,
          emoji: `${i}️⃣`,
          confidence: 0.8
        });
      }
    });

    it('should return all gestures when no limit specified', () => {
      const history = service.getRecentHistory();
      expect(history).toHaveLength(5);
    });

    it('should return limited number of gestures', () => {
      const history = service.getRecentHistory(3);
      expect(history).toHaveLength(3);
      expect(history[0].label).toBe('Gesture 5'); // Most recent
      expect(history[2].label).toBe('Gesture 3');
    });

    it('should return empty array when history is empty', () => {
      (service as any).history = [];
      const history = service.getRecentHistory();
      expect(history).toEqual([]);
    });
  });

  describe('getLastGesture', () => {
    it('should return the most recent gesture', () => {
      service.addGesture({
        id: 'first',
        label: 'First',
        emoji: '1️⃣',
        confidence: 0.8
      });

      service.addGesture({
        id: 'second',
        label: 'Second',
        emoji: '2️⃣',
        confidence: 0.9
      });

      const lastGesture = service.getLastGesture();
      expect(lastGesture?.label).toBe('Second');
      expect(lastGesture?.confidence).toBe(0.9);
    });

    it('should return null when history is empty', () => {
      const lastGesture = service.getLastGesture();
      expect(lastGesture).toBeNull();
    });
  });

  describe('getGestureById', () => {
    beforeEach(() => {
      service.addGesture({
        id: 'gesture_1',
        label: 'Gesture One',
        emoji: '1️⃣',
        confidence: 0.8
      });

      service.addGesture({
        id: 'gesture_2',
        label: 'Gesture Two',
        emoji: '2️⃣',
        confidence: 0.9
      });
    });

    it('should return gesture by ID', () => {
      const gesture = service.getGestureById('gesture_1');
      expect(gesture?.label).toBe('Gesture One');
      expect(gesture?.confidence).toBe(0.8);
    });

    it('should return null for non-existent ID', () => {
      const gesture = service.getGestureById('non_existent');
      expect(gesture).toBeNull();
    });
  });

  describe('getRecentGestures', () => {
    it('should return gestures within time window', () => {
      const now = Date.now();

      // Add gesture from 30 minutes ago
      const oldGesture = {
        id: 'old_gesture',
        label: 'Old Gesture',
        emoji: '🕐',
        confidence: 0.8,
        timestamp: now - (30 * 60 * 1000)
      };
      (service as any).history.push(oldGesture);

      // Add recent gesture
      service.addGesture({
        id: 'recent_gesture',
        label: 'Recent Gesture',
        emoji: '🕑',
        confidence: 0.9
      });

      const recentGestures = service.getRecentGestures(15); // Last 15 minutes
      expect(recentGestures).toHaveLength(1);
      expect(recentGestures[0].label).toBe('Recent Gesture');
    });

    it('should return empty array when no gestures in time window', () => {
      const recentGestures = service.getRecentGestures(60);
      expect(recentGestures).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('should return default stats when history is empty', () => {
      const stats = service.getStats();

      expect(stats.totalGestures).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.mostUsedGesture).toBe('');
      expect(stats.recentActivity).toBe(0);
      expect(stats.communicationStreak).toBe(0);
    });

    it('should calculate correct statistics with gestures', () => {
      // Add multiple gestures of same type
      for (let i = 0; i < 3; i++) {
        service.addGesture({
          id: `hello_${i}`,
          label: 'Hello',
          emoji: '👋',
          confidence: 0.8
        });
      }

      // Add different gesture
      service.addGesture({
        id: 'goodbye',
        label: 'Goodbye',
        emoji: '👋',
        confidence: 0.9
      });

      const stats = service.getStats();

      expect(stats.totalGestures).toBe(4);
      expect(stats.successRate).toBe(1); // All gestures are considered successful
      expect(stats.mostUsedGesture).toBe('Hello');
      expect(stats.recentActivity).toBe(4); // All within last hour
    });

    it('should calculate communication streak correctly', () => {
      const now = Date.now();

      // Add gestures within 5-minute windows
      for (let i = 0; i < 3; i++) {
        const gesture = {
          id: `streak_${i}`,
          label: `Streak ${i}`,
          emoji: '🔥',
          confidence: 0.8,
          timestamp: now - (i * 2 * 60 * 1000) // 0, 2, 4 minutes ago
        };
        (service as any).history.unshift(gesture);
      }

      // Add old gesture (more than 5 minutes ago)
      const oldGesture = {
        id: 'old_gesture',
        label: 'Old Gesture',
        emoji: '🕐',
        confidence: 0.8,
        timestamp: now - (10 * 60 * 1000) // 10 minutes ago
      };
      (service as any).history.push(oldGesture);

      const stats = service.getStats();
      expect(stats.communicationStreak).toBe(3); // Only the recent 3 gestures
    });

    it('should handle recent activity filtering', () => {
      const now = Date.now();

      // Add recent gesture
      service.addGesture({
        id: 'recent',
        label: 'Recent',
        emoji: '🕑',
        confidence: 0.8
      });

      // Add old gesture (more than 1 hour ago)
      const oldGesture = {
        id: 'old',
        label: 'Old',
        emoji: '🕐',
        confidence: 0.8,
        timestamp: now - (2 * 60 * 60 * 1000) // 2 hours ago
      };
      (service as any).history.push(oldGesture);

      const stats = service.getStats();
      expect(stats.recentActivity).toBe(1); // Only the recent gesture
    });
  });

  describe('removeLastGesture', () => {
    it('should remove and return the last gesture', () => {
      service.addGesture({
        id: 'first',
        label: 'First',
        emoji: '1️⃣',
        confidence: 0.8
      });

      service.addGesture({
        id: 'second',
        label: 'Second',
        emoji: '2️⃣',
        confidence: 0.9
      });

      const removed = service.removeLastGesture();

      expect(removed?.label).toBe('Second');
      expect(service.getRecentHistory()).toHaveLength(1);
      expect(service.getRecentHistory()[0].label).toBe('First');
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    it('should return null when history is empty', () => {
      const removed = service.removeLastGesture();
      expect(removed).toBeNull();
    });
  });

  describe('clearHistory', () => {
    it('should clear all gestures from history', () => {
      service.addGesture({
        id: 'test',
        label: 'Test',
        emoji: '🧪',
        confidence: 0.8
      });

      expect(service.getRecentHistory()).toHaveLength(1);

      service.clearHistory();

      expect(service.getRecentHistory()).toHaveLength(0);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'amys_echo_gesture_history',
        '[]'
      );
    });
  });

  describe('getEmergencyReplayHistory', () => {
    it('should return last 5 gestures for emergency replay', () => {
      // Add 7 gestures
      for (let i = 1; i <= 7; i++) {
        service.addGesture({
          id: `emergency_${i}`,
          label: `Emergency ${i}`,
          emoji: '🚨',
          confidence: 0.8
        });
      }

      const emergencyHistory = service.getEmergencyReplayHistory();
      expect(emergencyHistory).toHaveLength(5);
      expect(emergencyHistory[0].label).toBe('Emergency 7'); // Most recent
      expect(emergencyHistory[4].label).toBe('Emergency 3');
    });

    it('should return all gestures if less than 5', () => {
      for (let i = 1; i <= 3; i++) {
        service.addGesture({
          id: `emergency_${i}`,
          label: `Emergency ${i}`,
          emoji: '🚨',
          confidence: 0.8
        });
      }

      const emergencyHistory = service.getEmergencyReplayHistory();
      expect(emergencyHistory).toHaveLength(3);
    });
  });

  describe('replayGesture', () => {
    it('should return gesture for replay', () => {
      service.addGesture({
        id: 'replay_test',
        label: 'Replay Test',
        emoji: '🔄',
        confidence: 0.8
      });

      const replayed = service.replayGesture('replay_test');

      expect(replayed?.label).toBe('Replay Test');
      expect(replayed?.confidence).toBe(0.8);
    });

    it('should return null for non-existent gesture', () => {
      const replayed = service.replayGesture('non_existent');
      expect(replayed).toBeNull();
    });
  });

  describe('Persistence', () => {
    describe('saveHistory', () => {
      it('should save history to localStorage', () => {
        service.addGesture({
          id: 'persist_test',
          label: 'Persist Test',
          emoji: '💾',
          confidence: 0.8
        });

        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          'amys_echo_gesture_history',
          expect.stringContaining('Persist Test')
        );
      });

      it('should handle localStorage errors gracefully', () => {
        mockLocalStorage.setItem.mockImplementation(() => {
          throw new Error('Storage quota exceeded');
        });

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        service.addGesture({
          id: 'error_test',
          label: 'Error Test',
          emoji: '❌',
          confidence: 0.8
        });

        expect(consoleSpy).toHaveBeenCalledWith(
          'Failed to save gesture history:',
          expect.any(Error)
        );

        consoleSpy.mockRestore();
      });
    });

    describe('loadHistory', () => {
      it('should load history from localStorage', () => {
        const storedHistory = [
          {
            id: 'stored_1',
            label: 'Stored Gesture 1',
            emoji: '📦',
            confidence: 0.8,
            timestamp: Date.now()
          },
          {
            id: 'stored_2',
            label: 'Stored Gesture 2',
            emoji: '📦',
            confidence: 0.9,
            timestamp: Date.now()
          }
        ];

        mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedHistory));

        // Create new instance to trigger load
        const newService = new (service.constructor as any)();
        (newService as any).loadHistory();

        const history = newService.getRecentHistory();
        expect(history).toHaveLength(2);
        expect(history[0].label).toBe('Stored Gesture 2');
        expect(history[1].label).toBe('Stored Gesture 1');
      });

      it('should filter out old entries (older than 24 hours)', () => {
        const now = Date.now();
        const storedHistory = [
          {
            id: 'recent',
            label: 'Recent Gesture',
            emoji: '🕑',
            confidence: 0.8,
            timestamp: now - (2 * 60 * 60 * 1000) // 2 hours ago
          },
          {
            id: 'old',
            label: 'Old Gesture',
            emoji: '🕐',
            confidence: 0.8,
            timestamp: now - (25 * 60 * 60 * 1000) // 25 hours ago
          }
        ];

        mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedHistory));

        const newService = new (service.constructor as any)();
        (newService as any).loadHistory();

        const history = newService.getRecentHistory();
        expect(history).toHaveLength(1);
        expect(history[0].label).toBe('Recent Gesture');
      });

      it('should handle localStorage errors gracefully', () => {
        mockLocalStorage.getItem.mockImplementation(() => {
          throw new Error('Storage access denied');
        });

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        const newService = new (service.constructor as any)();
        (newService as any).loadHistory();

        expect(consoleSpy).toHaveBeenCalledWith(
          'Failed to load gesture history:',
          expect.any(Error)
        );
        expect((newService as any).history).toEqual([]);

        consoleSpy.mockRestore();
      });

      it('should handle invalid JSON gracefully', () => {
        mockLocalStorage.getItem.mockReturnValue('invalid json');

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        const newService = new (service.constructor as any)();
        (newService as any).loadHistory();

        expect(consoleSpy).toHaveBeenCalledWith(
          'Failed to load gesture history:',
          expect.any(Error)
        );
        expect((newService as any).history).toEqual([]);

        consoleSpy.mockRestore();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined window.localStorage', () => {
      // Temporarily remove localStorage
      const originalLocalStorage = window.localStorage;
      delete (window as any).localStorage;

      service.addGesture({
        id: 'no_storage_test',
        label: 'No Storage Test',
        emoji: '🚫',
        confidence: 0.8
      });

      // Restore localStorage
      window.localStorage = originalLocalStorage;

      expect(service.getRecentHistory()).toHaveLength(1);
    });

    it('should handle gestures with special characters', () => {
      service.addGesture({
        id: 'special_chars',
        label: 'Spëcial Chärs 🚀',
        emoji: '🔥',
        confidence: 0.8
      });

      const gesture = service.getLastGesture();
      expect(gesture?.label).toBe('Spëcial Chärs 🚀');
    });

    it('should handle very high confidence values', () => {
      service.addGesture({
        id: 'perfect_confidence',
        label: 'Perfect',
        emoji: '💯',
        confidence: 1.0
      });

      const gesture = service.getLastGesture();
      expect(gesture?.confidence).toBe(1.0);
    });

    it('should handle zero confidence values', () => {
      service.addGesture({
        id: 'zero_confidence',
        label: 'Zero',
        emoji: '0️⃣',
        confidence: 0.0
      });

      const gesture = service.getLastGesture();
      expect(gesture?.confidence).toBe(0.0);
    });
  });
});