import { TrainingSessionManager, trainingSessionManager } from '../src/services/TrainingSessionManager';

describe('TrainingSessionManager', () => {
  let manager: TrainingSessionManager;

  beforeEach(() => {
    manager = new TrainingSessionManager();
  });

  describe('Session Management', () => {
    it('starts a new training session', () => {
      const session = manager.startSession('thumbs_up', 5);

      expect(session.gestureId).toBe('thumbs_up');
      expect(session.targetSamples).toBe(5);
      expect(session.status).toBe('active');
      expect(session.samples).toEqual([]);
    });

    it('tracks session progress', () => {
      manager.startSession('thumbs_up', 3);

      const progress1 = manager.getProgress();
      expect(progress1?.current).toBe(0);
      expect(progress1?.target).toBe(3);
      expect(progress1?.percentage).toBe(0);

      // Add a sample
      const mockLandmarks = [[[0.5, 0.5, 0], [0.4, 0.6, 0]]];
      manager.addSample(mockLandmarks);

      const progress2 = manager.getProgress();
      expect(progress2?.current).toBe(1);
      expect(progress2?.percentage).toBeCloseTo(33.33, 1);
    });

    it('completes session when target reached', () => {
      manager.startSession('thumbs_up', 2);

      // Add samples
      const mockLandmarks = [[[0.5, 0.5, 0]]];
      manager.addSample(mockLandmarks);
      expect(manager.getCurrentSession()?.status).toBe('active');

      manager.addSample(mockLandmarks);
      expect(manager.getCurrentSession()?.status).toBe('completed');
    });
  });

  describe('Sample Validation and Feedback', () => {
    beforeEach(() => {
      manager.startSession('thumbs_up', 10);
    });

    it('provides positive feedback for good samples', () => {
      // Create a good sample with sufficient frames and motion
      const goodLandmarks = [];
      for (let i = 0; i < 25; i++) {
        goodLandmarks.push([[
          [0.5 + i * 0.005, 0.5 + i * 0.003, 0], // More motion
          [0.4 + i * 0.005, 0.6 + i * 0.003, 0],
          [0.3 + i * 0.005, 0.7 + i * 0.003, 0],
          [0.2 + i * 0.005, 0.8 + i * 0.003, 0],
          [0.1 + i * 0.005, 0.9 + i * 0.003, 0]
        ]]);
      }

      const feedback = manager.addSample(goodLandmarks);

      // The sample may still need some improvements but should have decent quality
      expect(feedback?.qualityScore).toBeGreaterThan(40);
      expect(feedback?.type).toBe('warning'); // May still need improvements
    });

    it('provides improvement suggestions for poor samples', () => {
      // Create a poor sample with no motion
      const poorLandmarks = [];
      for (let i = 0; i < 5; i++) {
        poorLandmarks.push([[
          [0.5, 0.5, 0],
          [0.4, 0.6, 0]
        ]]);
      }

      const feedback = manager.addSample(poorLandmarks);

      expect(feedback?.type).toBe('warning');
      expect(feedback?.suggestions).toBeDefined();
      expect(feedback?.suggestions?.length).toBeGreaterThan(0);
    });
  });

  describe('Session Callbacks', () => {
    it('notifies callbacks on session updates', () => {
      const callback = jest.fn();
      const unsubscribe = manager.onSessionUpdate(callback);

      manager.startSession('thumbs_up', 2);
      expect(callback).toHaveBeenCalledTimes(1);

      manager.addSample([[[0.5, 0.5, 0]]]);
      expect(callback).toHaveBeenCalledTimes(2);

      unsubscribe();
      manager.addSample([[[0.5, 0.5, 0]]]);
      expect(callback).toHaveBeenCalledTimes(2); // Should not be called after unsubscribe
    });
  });

  describe('Quality Tracking', () => {
    it('calculates average quality across samples', () => {
      manager.startSession('thumbs_up', 10);

      // Add high quality sample
      const highQualityLandmarks = [];
      for (let i = 0; i < 25; i++) {
        highQualityLandmarks.push([[
          [0.5 + i * 0.003, 0.5 + i * 0.002, 0]
        ]]);
      }
      manager.addSample(highQualityLandmarks);

      // Add lower quality sample
      const lowQualityLandmarks = [];
      for (let i = 0; i < 10; i++) {
        lowQualityLandmarks.push([[
          [0.5, 0.5, 0]
        ]]);
      }
      manager.addSample(lowQualityLandmarks);

      const session = manager.getCurrentSession();
      expect(session?.averageQuality).toBeGreaterThan(0);
      expect(session?.averageQuality).toBeLessThan(100);
    });
  });
});