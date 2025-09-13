import { emergencyPriorityService, EmergencyGesture } from '../src/services/emergencyPriorityService';

// Mock logger
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('EmergencyPriorityService', () => {
  let service: typeof emergencyPriorityService;

  beforeEach(() => {
    // Reset the singleton instance for each test
    (emergencyPriorityService as any).emergencyQueue = [];
    (emergencyPriorityService as any).processingQueue = [];
    (emergencyPriorityService as any).isProcessing = false;
    service = emergencyPriorityService;

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    service.stopProcessingLoop();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = emergencyPriorityService;
      const instance2 = emergencyPriorityService;
      expect(instance1).toBe(instance2);
    });
  });

  describe('addEmergencyGesture', () => {
    it('should add emergency gesture to queue with correct priority', () => {
      const result = service.addEmergencyGesture('hilfe', 0.95);

      expect(result).toBe(true);

      const queueStatus = service.getQueueStatus();
      expect(queueStatus.queueLength).toBe(1);
      expect(queueStatus.nextGesture?.gesture).toBe('hilfe');
      expect(queueStatus.nextGesture?.priority).toBe('critical');
      expect(queueStatus.nextGesture?.confidence).toBe(0.95);
      expect(queueStatus.nextGesture?.processed).toBe(false);
    });

    it('should not add non-emergency gestures to queue', () => {
      const result = service.addEmergencyGesture('hello', 0.9);

      expect(result).toBe(false);

      const queueStatus = service.getQueueStatus();
      expect(queueStatus.queueLength).toBe(0);
    });

    it('should handle case-insensitive emergency gesture detection', () => {
      const result = service.addEmergencyGesture('HILFE', 0.8);

      expect(result).toBe(true);
      const queueStatus = service.getQueueStatus();
      expect(queueStatus.nextGesture?.gesture).toBe('HILFE');
    });

    it('should trim whitespace from gesture names', () => {
      const result = service.addEmergencyGesture(' hilfe ', 0.8);

      expect(result).toBe(true);
      const queueStatus = service.getQueueStatus();
      expect(queueStatus.nextGesture?.gesture).toBe(' hilfe ');
    });

    it('should assign correct priority based on confidence', () => {
      // High confidence critical gesture
      service.addEmergencyGesture('hilfe', 0.95);
      let queueStatus = service.getQueueStatus();
      expect(queueStatus.nextGesture?.priority).toBe('critical');

      // Clear queue
      (service as any).emergencyQueue = [];

      // Medium confidence critical gesture
      service.addEmergencyGesture('hilfe', 0.75);
      queueStatus = service.getQueueStatus();
      expect(queueStatus.nextGesture?.priority).toBe('high');

      // Clear queue
      (service as any).emergencyQueue = [];

      // Low confidence critical gesture
      service.addEmergencyGesture('hilfe', 0.5);
      queueStatus = service.getQueueStatus();
      expect(queueStatus.nextGesture?.priority).toBe('low');
    });

    it('should include context when provided', () => {
      service.addEmergencyGesture('stop', 0.8, 'immediate_stop_needed');

      const queueStatus = service.getQueueStatus();
      expect(queueStatus.nextGesture?.context).toBe('immediate_stop_needed');
    });

    it('should maintain queue size limit', () => {
      // Add more than MAX_QUEUE_SIZE (10) gestures
      for (let i = 0; i < 12; i++) {
        service.addEmergencyGesture('hilfe', 0.8);
      }

      const queueStatus = service.getQueueStatus();
      expect(queueStatus.queueLength).toBe(10);
    });

    it('should generate unique IDs for each gesture', () => {
      service.addEmergencyGesture('hilfe', 0.8);
      service.addEmergencyGesture('stop', 0.9);

      const queueStatus = service.getQueueStatus();
      const gestures = (service as any).emergencyQueue;
      expect(gestures[0].id).not.toBe(gestures[1].id);
      expect(gestures[0].id).toMatch(/^emergency_\d+_[a-z0-9]+$/);
    });
  });

  describe('Priority Ordering', () => {
    it('should order gestures by priority (critical > high > medium > low)', () => {
      service.addEmergencyGesture('hilfe', 0.95); // critical
      service.addEmergencyGesture('stop', 0.9); // high
      service.addEmergencyGesture('danger', 0.8); // critical
      service.addEmergencyGesture('gefahr', 0.7); // critical

      const gestures = (service as any).emergencyQueue;

      // All should be critical priority, ordered by addition time
      expect(gestures[0].gesture).toBe('hilfe');
      expect(gestures[1].gesture).toBe('danger');
      expect(gestures[2].gesture).toBe('gefahr');
      expect(gestures[3].gesture).toBe('stop');
    });

    it('should insert lower priority gestures after higher priority ones', () => {
      service.addEmergencyGesture('hilfe', 0.95); // critical
      service.addEmergencyGesture('stop', 0.6); // medium (due to lower confidence)

      const gestures = (service as any).emergencyQueue;
      expect(gestures[0].priority).toBe('critical');
      expect(gestures[1].priority).toBe('low');
    });
  });

  describe('processNextEmergency', () => {
    it('should process the highest priority emergency gesture', async () => {
      service.addEmergencyGesture('hilfe', 0.95);
      service.addEmergencyGesture('stop', 0.8);

      const processed = await service.processNextEmergency();

      expect(processed?.gesture).toBe('hilfe');
      expect(processed?.processed).toBe(true);

      // Check that it's moved to processing queue
      expect((service as any).processingQueue).toContain(processed);
      expect((service as any).emergencyQueue).toHaveLength(1);
    });

    it('should return null when queue is empty', async () => {
      const processed = await service.processNextEmergency();
      expect(processed).toBeNull();
    });

    it('should handle processing errors gracefully', async () => {
      service.addEmergencyGesture('hilfe', 0.8);

      // Mock processEmergencyGesture to throw error
      const originalProcess = (service as any).processEmergencyGesture;
      (service as any).processEmergencyGesture = jest.fn().mockRejectedValue(new Error('Processing failed'));

      const processed = await service.processNextEmergency();

      expect(processed?.gesture).toBe('hilfe');
      expect(processed?.processed).toBe(true);

      // Restore original method
      (service as any).processEmergencyGesture = originalProcess;
    });
  });

  describe('getQueueStatus', () => {
    it('should return correct queue status', () => {
      service.addEmergencyGesture('hilfe', 0.95);
      service.addEmergencyGesture('stop', 0.8);
      service.addEmergencyGesture('danger', 0.9);

      const status = service.getQueueStatus();

      expect(status.queueLength).toBe(3);
      expect(status.nextGesture?.gesture).toBe('hilfe');
      expect(status.criticalCount).toBe(2); // hilfe and danger are critical
      expect(status.isProcessing).toBe(false);
    });

    it('should return correct status for empty queue', () => {
      const status = service.getQueueStatus();

      expect(status.queueLength).toBe(0);
      expect(status.nextGesture).toBeUndefined();
      expect(status.criticalCount).toBe(0);
      expect(status.isProcessing).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      service.addEmergencyGesture('hilfe', 0.95); // critical
      service.addEmergencyGesture('stop', 0.8); // high
      service.addEmergencyGesture('danger', 0.9); // critical

      const stats = service.getStats();

      expect(stats.queueLength).toBe(3);
      expect(stats.criticalCount).toBe(2);
      expect(stats.highCount).toBe(1);
      expect(typeof stats.processingRate).toBe('number');
      expect(typeof stats.averageWaitTime).toBe('number');
    });

    it('should calculate processing rate correctly', () => {
      // Add some processed gestures
      const now = Date.now();
      (service as any).processingQueue = [
        { timestamp: now - 30000 }, // 30 seconds ago
        { timestamp: now - 20000 }, // 20 seconds ago
        { timestamp: now - 10000 }, // 10 seconds ago
      ];

      const stats = service.getStats();
      expect(stats.processingRate).toBeCloseTo(3 / 60, 2); // 3 gestures per minute = 0.05 per second
    });
  });

  describe('clearQueue', () => {
    it('should clear all gestures from queue', () => {
      service.addEmergencyGesture('hilfe', 0.8);
      service.addEmergencyGesture('stop', 0.9);

      expect((service as any).emergencyQueue).toHaveLength(2);

      service.clearQueue();

      expect((service as any).emergencyQueue).toHaveLength(0);
      expect((service as any).processingQueue).toHaveLength(0);
    });
  });

  describe('isEmergencyGesture', () => {
    it('should correctly identify emergency gestures', () => {
      expect(service.isEmergencyGesture('hilfe')).toBe(true);
      expect(service.isEmergencyGesture('help')).toBe(true);
      expect(service.isEmergencyGesture('emergency')).toBe(true);
      expect(service.isEmergencyGesture('stop')).toBe(true);
      expect(service.isEmergencyGesture('danger')).toBe(true);
      expect(service.isEmergencyGesture('notfall')).toBe(true);
      expect(service.isEmergencyGesture('gefahr')).toBe(true);
    });

    it('should return false for non-emergency gestures', () => {
      expect(service.isEmergencyGesture('hello')).toBe(false);
      expect(service.isEmergencyGesture('thank_you')).toBe(false);
      expect(service.isEmergencyGesture('goodbye')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(service.isEmergencyGesture('HILFE')).toBe(true);
      expect(service.isEmergencyGesture('Help')).toBe(true);
      expect(service.isEmergencyGesture('STOP')).toBe(true);
    });

    it('should trim whitespace', () => {
      expect(service.isEmergencyGesture(' hilfe ')).toBe(true);
      expect(service.isEmergencyGesture('  stop  ')).toBe(true);
    });
  });

  describe('getEmergencyResponse', () => {
    it('should return correct response for hilfe/help', () => {
      const response = service.getEmergencyResponse('hilfe');
      expect(response.message).toBe('🆘 Hilfe wird gerufen!');
      expect(response.action).toBe('call_help');
      expect(response.priority).toBe('critical');
    });

    it('should return correct response for emergency/notfall', () => {
      const response = service.getEmergencyResponse('emergency');
      expect(response.message).toBe('🚨 Notfall erkannt!');
      expect(response.action).toBe('emergency_alert');
      expect(response.priority).toBe('critical');
    });

    it('should return correct response for stop', () => {
      const response = service.getEmergencyResponse('stop');
      expect(response.message).toBe('⏹️ Stopp erkannt!');
      expect(response.action).toBe('stop_current');
      expect(response.priority).toBe('high');
    });

    it('should return correct response for danger/gefahr', () => {
      const response = service.getEmergencyResponse('danger');
      expect(response.message).toBe('⚠️ Gefahr erkannt!');
      expect(response.action).toBe('danger_alert');
      expect(response.priority).toBe('critical');
    });

    it('should return default response for unknown emergency gestures', () => {
      const response = service.getEmergencyResponse('unknown_emergency');
      expect(response.message).toBe('⚠️ Dringende Geste erkannt!');
      expect(response.action).toBe('general_alert');
      expect(response.priority).toBe('medium');
    });

    it('should be case-insensitive', () => {
      const response = service.getEmergencyResponse('HILFE');
      expect(response.action).toBe('call_help');
    });
  });

  describe('Background Processing', () => {
    it('should automatically process gestures in background', async () => {
      jest.useFakeTimers();
      service.startProcessingLoop();

      service.addEmergencyGesture('hilfe', 0.8);

      jest.advanceTimersByTime(200);
      await Promise.resolve();

      const queueStatus = service.getQueueStatus();
      expect(queueStatus.queueLength).toBe(0); // Should be processed
    });

    it('should not process when already processing', async () => {
      jest.useFakeTimers();
      service.startProcessingLoop();

      // Mock a long-running process
      const originalProcess = (service as any).processEmergencyGesture;
      (service as any).processEmergencyGesture = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 1000))
      );

      service.addEmergencyGesture('hilfe', 0.8);
      service.addEmergencyGesture('stop', 0.9);

      jest.advanceTimersByTime(150);
      await Promise.resolve();

      const queueStatus = service.getQueueStatus();
      expect(queueStatus.queueLength).toBe(1);

      (service as any).processEmergencyGesture = originalProcess;
    });
  });

  describe('Private Methods', () => {
    describe('calculatePriority', () => {
      it('should maintain priority for high confidence', () => {
        const priority = (service as any).calculatePriority('hilfe', 0.95);
        expect(priority).toBe('critical');
      });

      it('should reduce priority for medium confidence', () => {
        const priority = (service as any).calculatePriority('hilfe', 0.75);
        expect(priority).toBe('high'); // critical -> high
      });

      it('should reduce priority significantly for low confidence', () => {
        const priority = (service as any).calculatePriority('hilfe', 0.6);
        expect(priority).toBe('low');
      });

      it('should handle stop gesture priority reduction', () => {
        const priority = (service as any).calculatePriority('stop', 0.75);
        expect(priority).toBe('medium'); // high -> medium
      });
    });

    describe('addToQueue', () => {
      it('should insert gestures in correct priority order', () => {
        const gesture1 = {
          id: '1',
          gesture: 'stop',
          confidence: 0.8,
          timestamp: Date.now(),
          priority: 'high' as const,
          processed: false
        };

        const gesture2 = {
          id: '2',
          gesture: 'hilfe',
          confidence: 0.9,
          timestamp: Date.now(),
          priority: 'critical' as const,
          processed: false
        };

        (service as any).addToQueue(gesture1);
        (service as any).addToQueue(gesture2);

        const queue = (service as any).emergencyQueue;
        expect(queue[0].priority).toBe('critical');
        expect(queue[1].priority).toBe('high');
      });
    });

    describe('getPriorityWeight', () => {
      it('should return correct weights for priorities', () => {
        expect((service as any).getPriorityWeight('critical')).toBe(4);
        expect((service as any).getPriorityWeight('high')).toBe(3);
        expect((service as any).getPriorityWeight('medium')).toBe(2);
        expect((service as any).getPriorityWeight('low')).toBe(1);
      });
    });

    describe('calculateAverageWaitTime', () => {
      it('should calculate correct average wait time', () => {
        const now = Date.now();
        (service as any).processingQueue = [
          { timestamp: now - 5000 }, // 5 seconds ago
          { timestamp: now - 3000 }, // 3 seconds ago
          { timestamp: now - 1000 }, // 1 second ago
        ];

        const avgWaitTime = (service as any).calculateAverageWaitTime();
        expect(avgWaitTime).toBeCloseTo(3000, 0); // (5000 + 3000 + 1000) / 3
      });

      it('should return 0 for empty processing queue', () => {
        (service as any).processingQueue = [];
        const avgWaitTime = (service as any).calculateAverageWaitTime();
        expect(avgWaitTime).toBe(0);
      });
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle multiple emergency gestures in sequence', async () => {
      service.addEmergencyGesture('hilfe', 0.95); // critical
      service.addEmergencyGesture('stop', 0.8); // high
      service.addEmergencyGesture('danger', 0.9); // critical

      // Process first gesture
      const first = await service.processNextEmergency();
      expect(first?.gesture).toBe('hilfe');
      expect(first?.priority).toBe('critical');

      // Process second gesture
      const second = await service.processNextEmergency();
      expect(second?.gesture).toBe('danger');
      expect(second?.priority).toBe('critical');

      // Process third gesture
      const third = await service.processNextEmergency();
      expect(third?.gesture).toBe('stop');
      expect(third?.priority).toBe('high');
    });

    it('should maintain priority order during concurrent additions', () => {
      // Add gestures in non-priority order
      service.addEmergencyGesture('stop', 0.8); // high
      service.addEmergencyGesture('hilfe', 0.95); // critical
      service.addEmergencyGesture('danger', 0.7); // high (reduced from critical due to confidence)

      const queue = (service as any).emergencyQueue;
      expect(queue[0].gesture).toBe('hilfe'); // critical first
      expect(queue[1].gesture).toBe('stop'); // high second
      expect(queue[2].gesture).toBe('danger'); // high third
    });

    it('should handle queue overflow correctly', () => {
      // Add 12 gestures (over the limit of 10)
      for (let i = 0; i < 12; i++) {
        service.addEmergencyGesture('hilfe', 0.8);
      }

      expect((service as any).emergencyQueue).toHaveLength(10);
      expect((service as any).emergencyQueue[0].priority).toBe('high'); // Reduced due to confidence
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid gesture names gracefully', () => {
      expect(() => service.addEmergencyGesture('', 0.8)).toThrow();
      expect(() => service.addEmergencyGesture(null as any, 0.8)).toThrow();
    });

    it('should handle invalid confidence values', () => {
      expect(() => service.addEmergencyGesture('hilfe', -0.1)).not.toThrow();
      expect(() => service.addEmergencyGesture('hilfe', 1.5)).not.toThrow();
    });

    it('should handle processing timeout gracefully', async () => {
      jest.useFakeTimers();
      service.addEmergencyGesture('hilfe', 0.8);

      // Mock a very long process
      const originalProcess = (service as any).processEmergencyGesture;
      (service as any).processEmergencyGesture = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 10000))
      );

      const promise = service.processNextEmergency();

      jest.advanceTimersByTime(6000);
      await expect(promise).resolves.toBeDefined();

      (service as any).processEmergencyGesture = originalProcess;
    });
  });
});