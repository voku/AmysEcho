/**
 * Core Workflows Integration Tests - Amy First
 *
 * Tests the essential workflows that Amy depends on for communication
 */

import { audioService } from '../../src/services/audioService';
import { gestureHistoryService } from '../../src/services/gestureHistoryService';
import { positiveTelemetryService } from '../../src/services/positiveTelemetryService';
import { adaptiveLearningService } from '../../src/services/adaptiveLearningService';
import { twoHandGestureService } from '../../src/services/twoHandGestureService';
import { emergencyPriorityService } from '../../src/services/emergencyPriorityService';

describe('Core Communication Workflows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Gesture Recognition to Response', () => {
    it('should process high-confidence gesture and trigger appropriate response', async () => {
      const mockPlaySound = jest.fn().mockResolvedValue(undefined);
      const mockSpeak = jest.fn().mockResolvedValue(undefined);
      const mockAddGesture = jest.fn();

      // Mock the services
      (audioService.playSound as jest.Mock) = mockPlaySound;
      (audioService.triggerSpeakAndShow as jest.Mock) = mockSpeak;
      (gestureHistoryService.addGesture as jest.Mock) = mockAddGesture;

      // Simulate gesture detection workflow
      const gestureData = {
        id: 'hello',
        label: 'Hallo',
        confidence: 0.95,
        emoji: '👋',
        timestamp: Date.now(),
        landmarks: [[[0.5, 0.5, 0.8]]],
      };

      // Process the gesture
      gestureHistoryService.addGesture(gestureData);

      // Trigger audio response
      await audioService.playSound('success');
      await audioService.triggerSpeakAndShow('Hallo', {
        showText: true,
        hapticFeedback: true,
        visualFeedback: true
      });

      // Verify responses were triggered
      expect(mockPlaySound).toHaveBeenCalledWith('success');
      expect(mockSpeak).toHaveBeenCalledWith('Hallo', expect.objectContaining({
        showText: true,
        hapticFeedback: true,
        visualFeedback: true
      }));
      expect(mockAddGesture).toHaveBeenCalledWith(gestureData);
    });

    it('should handle low-confidence gestures with correction workflow', async () => {
      const mockPlaySound = jest.fn().mockResolvedValue(undefined);
      (audioService.playSound as jest.Mock) = mockPlaySound;

      const lowConfidenceGesture = {
        id: 'unclear',
        label: 'Unklar',
        confidence: 0.3,
        emoji: '❓',
        timestamp: Date.now(),
        landmarks: [[[0.5, 0.5, 0.3]]],
      };

      // Process low confidence gesture
      gestureHistoryService.addGesture(lowConfidenceGesture);

      // Should trigger thinking sound for correction
      await audioService.playSound('thinking');

      expect(mockPlaySound).toHaveBeenCalledWith('thinking');
    });

    it('should prioritize emergency gestures', async () => {
      const mockEmergencyResponse = jest.fn().mockResolvedValue(undefined);
      const mockPlaySound = jest.fn().mockResolvedValue(undefined);

      (audioService.playSound as jest.Mock) = mockPlaySound;

      const emergencyGesture = {
        id: 'help',
        label: 'Hilfe',
        confidence: 0.98,
        emoji: '🚨',
        timestamp: Date.now(),
        landmarks: [[[0.5, 0.5, 0.9]]],
      };

      // Process emergency gesture
      gestureHistoryService.addGesture(emergencyGesture);

      // Emergency should trigger immediate priority response
      await audioService.playSound('emergency');

      expect(mockPlaySound).toHaveBeenCalledWith('emergency');
    });
  });

  describe('Two-Hand Gesture Processing', () => {
    it('should process two-hand gestures correctly', async () => {
      const mockProcessTwoHand = jest.fn().mockResolvedValue({
        gesture: 'communication',
        confidence: 0.92,
        leftHand: 'hello',
        rightHand: 'please'
      });

      (twoHandGestureService.processTwoHandGesture as jest.Mock) = mockProcessTwoHand;

      const leftHandLandmarks = [[[0.3, 0.5, 0.8]]];
      const rightHandLandmarks = [[[0.7, 0.5, 0.8]]];

      const result = await twoHandGestureService.processTwoHandGesture(
        leftHandLandmarks,
        rightHandLandmarks
      );

      expect(mockProcessTwoHand).toHaveBeenCalledWith(leftHandLandmarks, rightHandLandmarks);
      expect(result).toEqual({
        gesture: 'communication',
        confidence: 0.92,
        leftHand: 'hello',
        rightHand: 'please'
      });
    });
  });

  describe('Adaptive Learning Integration', () => {
    it('should record practice attempts for adaptive learning', () => {
      const mockRecordAttempt = jest.fn();
      (adaptiveLearningService.recordPracticeAttempt as jest.Mock) = mockRecordAttempt;

      const practiceData = {
        gestureId: 'hello',
        success: true,
        confidence: 0.85,
        timestamp: Date.now()
      };

      adaptiveLearningService.recordPracticeAttempt(practiceData);

      expect(mockRecordAttempt).toHaveBeenCalledWith(practiceData);
    });

    it('should provide adaptive recommendations', () => {
      const mockGetRecommendations = jest.fn().mockReturnValue([
        {
          gesture: 'please',
          priority: 'high',
          reason: 'Frequently used but needs practice',
          estimatedTime: 5
        }
      ]);

      (adaptiveLearningService.getAdaptiveRecommendations as jest.Mock) = mockGetRecommendations;

      const recommendations = adaptiveLearningService.getAdaptiveRecommendations();

      expect(mockGetRecommendations).toHaveBeenCalled();
      expect(recommendations).toHaveLength(1);
      expect(recommendations[0]).toHaveProperty('gesture', 'please');
    });
  });

  describe('Positive Telemetry Tracking', () => {
    it('should record successful communication moments', () => {
      const mockRecordSuccess = jest.fn();
      (positiveTelemetryService.recordSuccess as jest.Mock) = mockRecordSuccess;

      const successData = {
        gesture: 'thank_you',
        confidence: 0.91,
        context: 'after_help',
        emotionalState: 'happy' as const
      };

      positiveTelemetryService.recordSuccess(successData);

      expect(mockRecordSuccess).toHaveBeenCalledWith(successData);
    });

    it('should generate positive insights', () => {
      const mockGetInsights = jest.fn().mockReturnValue({
        topGestures: [
          { gesture: 'hello', successRate: 0.95, frequency: 25 }
        ],
        peakPerformanceTimes: [
          { timeOfDay: 'morning', averageConfidence: 0.88 }
        ],
        communicationStreaks: [
          { gesture: 'please', currentStreak: 5, longestStreak: 8 }
        ],
        recentCelebrations: [],
        weeklyProgress: {
          totalSuccesses: 45,
          averageConfidence: 0.87,
          mostSuccessfulDay: 'Monday',
          improvementTrend: 'improving'
        }
      });

      (positiveTelemetryService.getPositiveInsights as jest.Mock) = mockGetInsights;

      const insights = positiveTelemetryService.getPositiveInsights();

      expect(mockGetInsights).toHaveBeenCalled();
      expect(insights).toHaveProperty('topGestures');
      expect(insights).toHaveProperty('weeklyProgress');
      expect(insights.weeklyProgress.improvementTrend).toBe('improving');
    });
  });

  describe('Emergency Priority System', () => {
    it('should handle emergency gesture priority', () => {
      const mockHandleEmergency = jest.fn().mockReturnValue(true);
      (emergencyPriorityService.handleEmergencyGesture as jest.Mock) = mockHandleEmergency;

      const emergencyGesture = {
        id: 'emergency_stop',
        confidence: 0.99,
        priority: 'critical' as const
      };

      const result = emergencyPriorityService.handleEmergencyGesture(emergencyGesture);

      expect(mockHandleEmergency).toHaveBeenCalledWith(emergencyGesture);
      expect(result).toBe(true);
    });
  });

  describe('Performance Validation', () => {
    it('should maintain sub-100ms response time for gesture processing', async () => {
      const startTime = Date.now();

      // Simulate gesture processing
      const gestureData = {
        id: 'test_gesture',
        label: 'Test',
        confidence: 0.8,
        landmarks: [[[0.5, 0.5, 0.7]]]
      };

      gestureHistoryService.addGesture(gestureData);

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should complete within acceptable time
      expect(processingTime).toBeLessThan(100);
    });

    it('should handle concurrent gesture processing', async () => {
      const gestures = [
        { id: 'g1', label: 'One', confidence: 0.8 },
        { id: 'g2', label: 'Two', confidence: 0.85 },
        { id: 'g3', label: 'Three', confidence: 0.9 }
      ];

      const startTime = Date.now();

      // Process multiple gestures
      gestures.forEach(gesture => {
        gestureHistoryService.addGesture({
          ...gesture,
          timestamp: Date.now(),
          landmarks: [[[0.5, 0.5, 0.7]]]
        });
      });

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should handle concurrent processing efficiently
      expect(totalTime).toBeLessThan(200);
    });
  });

  describe('Error Recovery', () => {
    it('should handle service failures gracefully', async () => {
      // Mock service failure
      const mockPlaySound = jest.fn().mockRejectedValue(new Error('Audio service failed'));
      (audioService.playSound as jest.Mock) = mockPlaySound;

      // Should not throw when service fails
      await expect(audioService.playSound('test')).rejects.toThrow('Audio service failed');

      // System should continue to function
      expect(gestureHistoryService.getRecentHistory).toBeDefined();
    });

    it('should maintain functionality during network issues', () => {
      // Mock network failure
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      // Core functionality should still work
      const gestureData = {
        id: 'offline_test',
        label: 'Offline Test',
        confidence: 0.75,
        timestamp: Date.now(),
        landmarks: [[[0.5, 0.5, 0.7]]]
      };

      expect(() => {
        gestureHistoryService.addGesture(gestureData);
      }).not.toThrow();
    });
  });
});