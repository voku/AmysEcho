import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock context-aware recognition service
jest.mock('../src/services/contextAwareRecognitionService', () => ({
  __esModule: true,
  contextAwareRecognitionService: {
    getContextAdjustment: jest.fn(),
  },
}));

const { personalizedConfidenceService } = require('../src/services/personalizedConfidenceService');
const { contextAwareRecognitionService } = require('../src/services/contextAwareRecognitionService');

describe('PersonalizedConfidenceService', () => {
  let service: typeof personalizedConfidenceService;

  beforeEach(() => {
    // Reset the singleton instance for each test
    (personalizedConfidenceService as any).profiles.clear();
    service = personalizedConfidenceService;

    // Reset all mocks and restore any spied methods
    jest.restoreAllMocks();

    // Mock AsyncStorage
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);

    // Mock context adjustment
    contextAwareRecognitionService.getContextAdjustment.mockReturnValue({
      confidenceMultiplier: 1.0,
      reason: 'No context adjustment',
    });
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = personalizedConfidenceService;
      const instance2 = personalizedConfidenceService;
      expect(instance1).toBe(instance2);
    });
  });

  describe('getPersonalizedThreshold', () => {
    it('should return default threshold for unknown gesture', () => {
      const result = service.getPersonalizedThreshold('unknown_gesture', 0.6);

      expect(result.threshold).toBe(0.5);
      expect(result.confidence).toBe('medium');
      expect(result.adjustments).toContain('Using default threshold: 0.5');
    });

    it('should apply personalized adjustments for known gesture', () => {
      // Create a profile manually
      const profile = {
        gestureId: 'known_gesture',
        baseThreshold: 0.6,
        timeOfDayAdjustments: {
          morning: -0.1,
          afternoon: 0.05,
          evening: 0,
          night: 0.1
        },
        learningProgress: 0.8,
        successRate: 0.9,
        lastUpdated: Date.now()
      };

      (service as any).profiles.set('known_gesture', profile);

      // Mock morning time
      jest.spyOn(service as any, 'getTimeOfDay').mockReturnValue('morning');

      const result = service.getPersonalizedThreshold('known_gesture', 0.7);

      expect(result.threshold).toBeCloseTo(0.65, 2); // 0.6 - 0.1 + 0.1 (mastered) + 0.05 (success rate)
      expect(result.confidence).toBe('high');
      expect(result.adjustments).toContain('Personalized base: 0.60');
      expect(result.adjustments).toContain('morning adjustment: -0.10');
      expect(result.adjustments).toContain('Mastered gesture: +0.1');
      expect(result.adjustments).toContain('High success rate: +0.05');
    });

    it('should apply learning adjustments for struggling gestures', () => {
      const profile = {
        gestureId: 'struggling_gesture',
        baseThreshold: 0.6,
        timeOfDayAdjustments: {
          morning: 0,
          afternoon: 0,
          evening: 0,
          night: 0
        },
        learningProgress: 0.2,
        successRate: 0.3,
        lastUpdated: Date.now()
      };

      (service as any).profiles.set('struggling_gesture', profile);

      const result = service.getPersonalizedThreshold('struggling_gesture', 0.5);

      expect(result.threshold).toBeCloseTo(0.35, 2); // 0.6 - 0.15 (learning) - 0.1 (low success)
      expect(result.confidence).toBe('low');
      expect(result.adjustments).toContain('Learning gesture: -0.15');
      expect(result.adjustments).toContain('Low success rate: -0.1');
    });

    it('should apply context adjustments', () => {
      const profile = {
        gestureId: 'context_gesture',
        baseThreshold: 0.5,
        timeOfDayAdjustments: {
          morning: 0,
          afternoon: 0,
          evening: 0,
          night: 0
        },
        learningProgress: 0.5,
        successRate: 0.5,
        lastUpdated: Date.now()
      };

      (service as any).profiles.set('context_gesture', profile);

      // Mock context adjustment
      contextAwareRecognitionService.getContextAdjustment.mockReturnValue({
        confidenceMultiplier: 1.2,
        reason: 'High confidence context',
      });

      const result = service.getPersonalizedThreshold('context_gesture', 0.6);

      expect(result.threshold).toBeCloseTo(0.6, 2); // 0.5 * 1.2
      expect(result.adjustments).toContain('Context: ×1.20 (High confidence context)');
    });

    it('should enforce threshold bounds', () => {
      const profile = {
        gestureId: 'extreme_gesture',
        baseThreshold: 0.9,
        timeOfDayAdjustments: {
          morning: 0.2,
          afternoon: 0,
          evening: 0,
          night: 0
        },
        learningProgress: 0.1,
        successRate: 0.1,
        lastUpdated: Date.now()
      };

      (service as any).profiles.set('extreme_gesture', profile);

      // Mock morning time
      jest.spyOn(service as any, 'getTimeOfDay').mockReturnValue('morning');

      const result = service.getPersonalizedThreshold('extreme_gesture', 0.8);

      // Should be adjusted based on limits
      expect(result.threshold).toBeCloseTo(0.55, 2);
    });

    it('should generate appropriate reason strings', () => {
      const profile = {
        gestureId: 'reason_gesture',
        baseThreshold: 0.5,
        timeOfDayAdjustments: {
          morning: 0,
          afternoon: 0,
          evening: 0,
          night: 0
        },
        learningProgress: 0.5,
        successRate: 0.5,
        lastUpdated: Date.now()
      };

      (service as any).profiles.set('reason_gesture', profile);

      const result = service.getPersonalizedThreshold('reason_gesture', 0.6);

      expect(result.reason).toBe('Personalized base: 0.50');
    });
  });

  describe('recordGestureAttempt', () => {
    it('should create default profile for new gesture', () => {
      service.recordGestureAttempt('new_gesture', 0.6, true);

      const profile = (service as any).profiles.get('new_gesture');
      expect(profile).toBeDefined();
      expect(profile.baseThreshold).toBe(0.5);
      expect(profile.learningProgress).toBe(0.5);
      expect(profile.successRate).toBeCloseTo(0.55, 2); // (0.5 * 9 + 1) / 10
    });

    it('should update success rate correctly', () => {
      // Initial attempt
      service.recordGestureAttempt('test_gesture', 0.6, true);
      let profile = (service as any).profiles.get('test_gesture');
      expect(profile.successRate).toBeCloseTo(0.55, 2);

      // Second successful attempt
      service.recordGestureAttempt('test_gesture', 0.7, true);
      profile = (service as any).profiles.get('test_gesture');
      expect(profile.successRate).toBeCloseTo(0.595, 2); // Rolling average

      // Failed attempt
      service.recordGestureAttempt('test_gesture', 0.4, false);
      profile = (service as any).profiles.get('test_gesture');
      expect(profile.successRate).toBeCloseTo(0.5355, 2);
    });

    it('should update learning progress based on performance', () => {
      const profile = {
        gestureId: 'learning_gesture',
        baseThreshold: 0.5,
        timeOfDayAdjustments: {
          morning: 0,
          afternoon: 0,
          evening: 0,
          night: 0
        },
        learningProgress: 0.5,
        successRate: 0.5,
        lastUpdated: Date.now()
      };

      (service as any).profiles.set('learning_gesture', profile);

      // Successful attempt with high confidence
      service.recordGestureAttempt('learning_gesture', 0.8, true);
      let updatedProfile = (service as any).profiles.get('learning_gesture');
      expect(updatedProfile.learningProgress).toBeCloseTo(0.55, 2); // 0.5 + 0.05

      // Failed attempt with low confidence
      service.recordGestureAttempt('learning_gesture', 0.2, false);
      updatedProfile = (service as any).profiles.get('learning_gesture');
      expect(updatedProfile.learningProgress).toBeCloseTo(0.53, 2); // 0.55 - 0.02
    });

    it('should adapt base threshold based on success patterns', () => {
      const profile = {
        gestureId: 'adaptation_gesture',
        baseThreshold: 0.5,
        timeOfDayAdjustments: {
          morning: 0,
          afternoon: 0,
          evening: 0,
          night: 0
        },
        learningProgress: 0.8,
        successRate: 0.9,
        lastUpdated: Date.now()
      };

      (service as any).profiles.set('adaptation_gesture', profile);

      service.recordGestureAttempt('adaptation_gesture', 0.8, true);
      const updatedProfile = (service as any).profiles.get('adaptation_gesture');

      // Should increase threshold slightly due to high success rate and learning progress
      expect(updatedProfile.baseThreshold).toBeGreaterThan(0.5);
      expect(updatedProfile.baseThreshold).toBeLessThanOrEqual(0.7);
    });

    it('should update time-of-day adjustments', () => {
      const profile = {
        gestureId: 'time_gesture',
        baseThreshold: 0.5,
        timeOfDayAdjustments: {
          morning: 0,
          afternoon: 0,
          evening: 0,
          night: 0
        },
        learningProgress: 0.5,
        successRate: 0.5,
        lastUpdated: Date.now()
      };

      (service as any).profiles.set('time_gesture', profile);

      // Mock morning time
      jest.spyOn(service as any, 'getTimeOfDay').mockReturnValue('morning');

      // Successful attempt
      service.recordGestureAttempt('time_gesture', 0.6, true);
      const updatedProfile = (service as any).profiles.get('time_gesture');

      // Should decrease morning adjustment slightly
      expect(updatedProfile.timeOfDayAdjustments.morning).toBeLessThan(0);
      expect(updatedProfile.timeOfDayAdjustments.morning).toBeGreaterThanOrEqual(-0.2);
    });

    it('should save profiles periodically', () => {
      // Mock Math.random to return < 0.1 to trigger save
      jest.spyOn(Math, 'random').mockReturnValue(0.05);

      service.recordGestureAttempt('save_gesture', 0.6, true);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'confidence_profiles',
        expect.any(String)
      );

      // Restore Math.random
      (Math.random as jest.Mock).mockRestore();
    });

    it('should not save profiles when random check fails', () => {
      // Mock Math.random to return > 0.1 to skip save
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      service.recordGestureAttempt('no_save_gesture', 0.6, true);

      expect(AsyncStorage.setItem).not.toHaveBeenCalled();

      // Restore Math.random
      (Math.random as jest.Mock).mockRestore();
    });
  });

  describe('getThresholdStats', () => {
    it('should return correct statistics for empty profiles', () => {
      const stats = service.getThresholdStats();

      expect(stats.totalProfiles).toBe(0);
      expect(stats.averageThreshold).toBe(0.5);
      expect(stats.learningProgress.mastered).toBe(0);
      expect(stats.learningProgress.learning).toBe(0);
      expect(stats.learningProgress.struggling).toBe(0);
    });

    it('should calculate statistics correctly with profiles', () => {
      // Add test profiles
      const profiles = [
        {
          gestureId: 'mastered_gesture',
          baseThreshold: 0.6,
          timeOfDayAdjustments: { morning: -0.1, afternoon: 0, evening: 0.1, night: 0 },
          learningProgress: 0.8,
          successRate: 0.9,
          lastUpdated: Date.now()
        },
        {
          gestureId: 'learning_gesture',
          baseThreshold: 0.4,
          timeOfDayAdjustments: { morning: 0, afternoon: -0.05, evening: 0, night: 0.05 },
          learningProgress: 0.4,
          successRate: 0.6,
          lastUpdated: Date.now()
        },
        {
          gestureId: 'struggling_gesture',
          baseThreshold: 0.5,
          timeOfDayAdjustments: { morning: 0.05, afternoon: 0, evening: -0.1, night: 0 },
          learningProgress: 0.2,
          successRate: 0.3,
          lastUpdated: Date.now()
        }
      ];

      profiles.forEach(profile => {
        (service as any).profiles.set(profile.gestureId, profile);
      });

      const stats = service.getThresholdStats();

      expect(stats.totalProfiles).toBe(3);
      expect(stats.averageThreshold).toBeCloseTo(0.5, 2); // (0.6 + 0.4 + 0.5) / 3
      expect(stats.learningProgress.mastered).toBe(1);
      expect(stats.learningProgress.learning).toBe(1);
      expect(stats.learningProgress.struggling).toBe(1);

      // Check time-of-day averages
      expect(stats.timeOfDayPreferences.morning).toBeCloseTo(-0.017, 2); // (-0.1 + 0 + 0.05) / 3
      expect(stats.timeOfDayPreferences.afternoon).toBeCloseTo(-0.017, 2); // (0 + -0.05 + 0) / 3
      expect(stats.timeOfDayPreferences.evening).toBeCloseTo(0, 2); // (0.1 + 0 + -0.1) / 3
      expect(stats.timeOfDayPreferences.night).toBeCloseTo(0.017, 2); // (0 + 0.05 + 0) / 3
    });
  });

  describe('resetProfiles', () => {
    it('should clear all profiles and remove from storage', () => {
      // Add a profile
      (service as any).profiles.set('test_gesture', {
        gestureId: 'test_gesture',
        baseThreshold: 0.5,
        timeOfDayAdjustments: { morning: 0, afternoon: 0, evening: 0, night: 0 },
        learningProgress: 0.5,
        successRate: 0.5,
        lastUpdated: Date.now()
      });

      expect((service as any).profiles.size).toBe(1);

      service.resetProfiles();

      expect((service as any).profiles.size).toBe(0);
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('confidence_profiles');
    });
  });

  describe('Private Methods', () => {
    describe('getTimeOfDay', () => {
      it('should return correct time of day', () => {
        const originalGetHours = Date.prototype.getHours;

        // Mock morning (6-11)
        Date.prototype.getHours = jest.fn().mockReturnValue(9);
        expect((service as any).getTimeOfDay()).toBe('morning');

        // Mock afternoon (12-16)
        Date.prototype.getHours = jest.fn().mockReturnValue(14);
        expect((service as any).getTimeOfDay()).toBe('afternoon');

        // Mock evening (17-20)
        Date.prototype.getHours = jest.fn().mockReturnValue(18);
        expect((service as any).getTimeOfDay()).toBe('evening');

        // Mock night (21-5)
        Date.prototype.getHours = jest.fn().mockReturnValue(22);
        expect((service as any).getTimeOfDay()).toBe('night');

        // Mock late night
        Date.prototype.getHours = jest.fn().mockReturnValue(3);
        expect((service as any).getTimeOfDay()).toBe('night');

        // Restore original method
        Date.prototype.getHours = originalGetHours;
      });
    });

    describe('createDefaultProfile', () => {
      it('should create profile with correct defaults', () => {
        const profile = (service as any).createDefaultProfile('test_gesture');

        expect(profile.gestureId).toBe('test_gesture');
        expect(profile.baseThreshold).toBe(0.5);
        expect(profile.learningProgress).toBe(0.5);
        expect(profile.successRate).toBe(0.5);
        expect(profile.timeOfDayAdjustments).toEqual({
          morning: 0,
          afternoon: 0,
          evening: 0,
          night: 0
        });
        expect(profile.lastUpdated).toBeDefined();
      });
    });

    describe('generateReason', () => {
      it('should generate reason for single adjustment', () => {
        const reason = (service as any).generateReason(['Single adjustment']);
        expect(reason).toBe('Single adjustment');
      });

      it('should generate reason for multiple adjustments', () => {
        const adjustments = ['Primary adjustment', 'Secondary', 'Tertiary'];
        const reason = (service as any).generateReason(adjustments);
        expect(reason).toBe('Primary adjustment (+2 adjustments)');
      });
    });

    describe('loadProfiles', () => {
      it('should load profiles from AsyncStorage', async () => {
        const storedProfiles = {
          gesture1: {
            gestureId: 'gesture1',
            baseThreshold: 0.6,
            timeOfDayAdjustments: { morning: 0, afternoon: 0, evening: 0, night: 0 },
            learningProgress: 0.7,
            successRate: 0.8,
            lastUpdated: Date.now()
          }
        };

        (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(storedProfiles));

        // Create new instance to trigger load
        const newService = new (service.constructor as any)();
        await (newService as any).loadProfiles();

        expect((newService as any).profiles.get('gesture1')).toBeDefined();
        expect((newService as any).profiles.get('gesture1').baseThreshold).toBe(0.6);
      });

      it('should handle AsyncStorage errors gracefully', async () => {
        (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        const newService = new (service.constructor as any)();
        await (newService as any).loadProfiles();

        expect(consoleSpy).toHaveBeenCalledWith('Failed to load confidence profiles:', expect.any(Error));
        expect((newService as any).profiles.size).toBe(0);

        consoleSpy.mockRestore();
      });
    });

    describe('saveProfiles', () => {
      it('should save profiles to AsyncStorage', async () => {
        const profile = {
          gestureId: 'save_test',
          baseThreshold: 0.5,
          timeOfDayAdjustments: { morning: 0, afternoon: 0, evening: 0, night: 0 },
          learningProgress: 0.5,
          successRate: 0.5,
          lastUpdated: Date.now()
        };

        (service as any).profiles.set('save_test', profile);

        await (service as any).saveProfiles();

        expect(AsyncStorage.setItem).toHaveBeenCalledWith(
          'confidence_profiles',
          expect.stringContaining('save_test')
        );
      });

      it('should handle AsyncStorage errors gracefully', async () => {
        (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        await (service as any).saveProfiles();

        expect(consoleSpy).toHaveBeenCalledWith('Failed to save confidence profiles:', expect.any(Error));

        consoleSpy.mockRestore();
      });
    });
  });

  describe('Integration Scenarios', () => {
    it('should adapt threshold over multiple attempts', () => {
      // Start with default profile
      service.recordGestureAttempt('adaptive_gesture', 0.6, true);
      let threshold = service.getPersonalizedThreshold('adaptive_gesture', 0.6);
      expect(threshold.threshold).toBeCloseTo(0.495, 3);

      // Multiple successful attempts
      for (let i = 0; i < 10; i++) {
        service.recordGestureAttempt('adaptive_gesture', 0.8, true);
      }

      threshold = service.getPersonalizedThreshold('adaptive_gesture', 0.6);
      // Threshold should have increased due to high success rate
      expect(threshold.threshold).toBeGreaterThan(0.5);
      expect(threshold.confidence).toBe('high');
    });

    it('should handle time-of-day learning', () => {
      // Mock morning time
      jest.spyOn(service as any, 'getTimeOfDay').mockReturnValue('morning');

      // Successful attempts in morning
      for (let i = 0; i < 5; i++) {
        service.recordGestureAttempt('morning_gesture', 0.7, true);
      }

      const morningThreshold = service.getPersonalizedThreshold('morning_gesture', 0.6);

      // Mock afternoon time
      jest.spyOn(service as any, 'getTimeOfDay').mockReturnValue('afternoon');

      const afternoonThreshold = service.getPersonalizedThreshold('morning_gesture', 0.6);

      // Morning threshold should be lower due to learned preference
      expect(morningThreshold.threshold).toBeLessThan(afternoonThreshold.threshold);
    });
  });
});