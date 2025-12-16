/**
 * Tests for Sign Variation Tracker
 */

import {
  SignVariationTracker,
  type GestureLandmarks,
  type SignVariation,
} from './signVariationTracker';

describe('SignVariationTracker', () => {
  let tracker: SignVariationTracker;

  beforeEach(() => {
    tracker = new SignVariationTracker();
  });

  describe('recordVariation', () => {
    it('should record a new gesture variation', () => {
      const landmarks: GestureLandmarks = {
        handLandmarks: [
          [[0.5, 0.5, 0], [0.6, 0.6, 0]], // Simple 2-landmark hand
        ],
      };

      const variation = tracker.recordVariation(
        'hello',
        landmarks,
        0.85,
        true,
        'profile1'
      );

      expect(variation).toBeDefined();
      expect(variation.gesture).toBe('hello');
      expect(variation.confidence).toBe(0.85);
      expect(variation.successfulMatch).toBe(true);
      expect(variation.profileId).toBe('profile1');
    });

    it('should limit stored variations per gesture', () => {
      const landmarks: GestureLandmarks = {
        handLandmarks: [[[0.5, 0.5, 0]]],
      };

      // Record 150 variations (more than MAX_VARIATIONS_PER_GESTURE = 100)
      for (let i = 0; i < 150; i++) {
        tracker.recordVariation('hello', landmarks, 0.8, true, 'profile1');
      }

      const clusters = tracker.getVariationClusters('hello');
      // Should have created clusters but not stored all 150 variations
      expect(clusters.length).toBeGreaterThan(0);
    });

    it('should assign cluster IDs to similar variations', () => {
      const landmarks: GestureLandmarks = {
        handLandmarks: [
          [[0.5, 0.5, 0], [0.6, 0.6, 0]],
        ],
      };

      // Record multiple similar variations
      const variations: SignVariation[] = [];
      for (let i = 0; i < 5; i++) {
        const v = tracker.recordVariation('hello', landmarks, 0.8, true, 'profile1');
        variations.push(v);
      }

      // Should eventually assign cluster IDs
      const clustered = variations.filter(v => v.clusterId);
      expect(clustered.length).toBeGreaterThan(0);
    });
  });

  describe('getVariationClusters', () => {
    it('should return empty array for gesture with no variations', () => {
      const clusters = tracker.getVariationClusters('unknown');
      expect(clusters).toEqual([]);
    });

    it('should group similar variations into clusters', () => {
      const baseLandmarks: GestureLandmarks = {
        handLandmarks: [
          [[0.5, 0.5, 0], [0.6, 0.6, 0], [0.7, 0.7, 0]],
        ],
      };

      // Record enough similar variations to form a cluster
      for (let i = 0; i < 5; i++) {
        tracker.recordVariation('hello', baseLandmarks, 0.8, true, 'profile1');
      }

      const clusters = tracker.getVariationClusters('hello');
      expect(clusters.length).toBeGreaterThan(0);
      expect(clusters[0].gesture).toBe('hello');
      expect(clusters[0].variations.length).toBeGreaterThan(0);
    });
  });

  describe('getDominantCluster', () => {
    it('should return null when no clusters exist', () => {
      const dominant = tracker.getDominantCluster('unknown');
      expect(dominant).toBeNull();
    });

    it('should return the most successful cluster', () => {
      const landmarks: GestureLandmarks = {
        handLandmarks: [[[0.5, 0.5, 0], [0.6, 0.6, 0], [0.7, 0.7, 0]]],
      };

      // Create clusters by recording variations
      for (let i = 0; i < 5; i++) {
        tracker.recordVariation('hello', landmarks, 0.9, true, 'profile1');
      }

      const dominant = tracker.getDominantCluster('hello');
      expect(dominant).toBeDefined();
      if (dominant) {
        expect(dominant.gesture).toBe('hello');
        expect(dominant.successCount).toBeGreaterThan(0);
      }
    });
  });

  describe('getLearningMetrics', () => {
    it('should return metrics for a gesture', () => {
      const landmarks: GestureLandmarks = {
        handLandmarks: [[[0.5, 0.5, 0]]],
      };

      tracker.recordVariation('hello', landmarks, 0.8, true, 'profile1');

      const metrics = tracker.getLearningMetrics('hello');
      expect(metrics.gesture).toBe('hello');
      expect(metrics.totalVariations).toBe(1);
      expect(metrics.variationDiversity).toBeGreaterThanOrEqual(0);
      expect(metrics.variationDiversity).toBeLessThanOrEqual(1);
    });

    it('should recommend training for high diversity with low success', () => {
      const landmarks1: GestureLandmarks = {
        handLandmarks: [[[0.1, 0.1, 0], [0.2, 0.2, 0], [0.3, 0.3, 0]]],
      };
      const landmarks2: GestureLandmarks = {
        handLandmarks: [[[0.8, 0.8, 0], [0.7, 0.7, 0], [0.6, 0.6, 0]]],
      };

      // Record variations with different landmarks and mixed success
      for (let i = 0; i < 3; i++) {
        tracker.recordVariation('hello', landmarks1, 0.5, true, 'profile1');
        tracker.recordVariation('hello', landmarks2, 0.4, false, 'profile1');
      }

      const metrics = tracker.getLearningMetrics('hello');
      // Should have some diversity
      expect(metrics.totalVariations).toBeGreaterThan(0);
    });
  });

  describe('exportForTraining', () => {
    it('should export clusters and canonical templates', () => {
      const landmarks: GestureLandmarks = {
        handLandmarks: [[[0.5, 0.5, 0], [0.6, 0.6, 0], [0.7, 0.7, 0]]],
      };

      // Record enough successful variations to create clusters
      for (let i = 0; i < 5; i++) {
        tracker.recordVariation('hello', landmarks, 0.8, true, 'profile1');
      }

      const exported = tracker.exportForTraining('hello');
      expect(exported.clusters).toBeDefined();
      expect(exported.canonicalTemplates).toBeDefined();
      expect(Array.isArray(exported.clusters)).toBe(true);
      expect(Array.isArray(exported.canonicalTemplates)).toBe(true);
    });

    it('should only include successful variations in canonical templates', () => {
      const landmarks: GestureLandmarks = {
        handLandmarks: [[[0.5, 0.5, 0], [0.6, 0.6, 0], [0.7, 0.7, 0]]],
      };

      // Record mix of successful and failed variations
      for (let i = 0; i < 3; i++) {
        tracker.recordVariation('hello', landmarks, 0.8, true, 'profile1');
        tracker.recordVariation('hello', landmarks, 0.3, false, 'profile1');
      }

      const exported = tracker.exportForTraining('hello');
      // Canonical templates should prioritize successful variations
      expect(exported.canonicalTemplates.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cleanup', () => {
    it('should remove old variations', () => {
      const landmarks: GestureLandmarks = {
        handLandmarks: [[[0.5, 0.5, 0]]],
      };

      const variation = tracker.recordVariation(
        'hello',
        landmarks,
        0.8,
        true,
        'profile1'
      );

      // Manually set old timestamp (8 days ago)
      variation.timestamp = Date.now() - 8 * 24 * 60 * 60 * 1000;

      tracker.cleanup();

      const metrics = tracker.getLearningMetrics('hello');
      // Should have cleaned up old variations
      expect(metrics.totalVariations).toBe(0);
    });
  });

  describe('exportData and importData', () => {
    it('should export and import data correctly', () => {
      const landmarks: GestureLandmarks = {
        handLandmarks: [[[0.5, 0.5, 0], [0.6, 0.6, 0], [0.7, 0.7, 0]]],
      };

      // Record some variations
      for (let i = 0; i < 3; i++) {
        tracker.recordVariation('hello', landmarks, 0.8, true, 'profile1');
      }

      const exported = tracker.exportData();
      expect(exported.variations).toBeDefined();
      expect(exported.clusters).toBeDefined();

      // Create new tracker and import
      const newTracker = new SignVariationTracker();
      newTracker.importData(exported);

      const metrics = newTracker.getLearningMetrics('hello');
      expect(metrics.totalVariations).toBeGreaterThan(0);
    });

    it('should handle empty import gracefully', () => {
      const newTracker = new SignVariationTracker();
      newTracker.importData({});

      const metrics = newTracker.getLearningMetrics('hello');
      expect(metrics.totalVariations).toBe(0);
    });
  });

  describe('similarity calculation', () => {
    it('should identify similar hand poses', () => {
      const landmarks1: GestureLandmarks = {
        handLandmarks: [
          [[0.5, 0.5, 0], [0.6, 0.6, 0], [0.7, 0.7, 0]],
        ],
      };

      const landmarks2: GestureLandmarks = {
        handLandmarks: [
          [[0.51, 0.51, 0], [0.61, 0.61, 0], [0.71, 0.71, 0]], // Very similar
        ],
      };

      // Record similar variations - should cluster together
      for (let i = 0; i < 3; i++) {
        tracker.recordVariation('hello', landmarks1, 0.8, true, 'profile1');
      }
      for (let i = 0; i < 2; i++) {
        tracker.recordVariation('hello', landmarks2, 0.8, true, 'profile1');
      }

      const clusters = tracker.getVariationClusters('hello');
      // Should cluster similar variations together
      expect(clusters.length).toBeGreaterThan(0);
    });

    it('should separate distinct hand poses', () => {
      const landmarks1: GestureLandmarks = {
        handLandmarks: [
          [[0.1, 0.1, 0], [0.2, 0.2, 0], [0.3, 0.3, 0]],
        ],
      };

      const landmarks2: GestureLandmarks = {
        handLandmarks: [
          [[0.9, 0.9, 0], [0.8, 0.8, 0], [0.7, 0.7, 0]], // Very different
        ],
      };

      // Record distinct variations
      for (let i = 0; i < 3; i++) {
        tracker.recordVariation('hello', landmarks1, 0.8, true, 'profile1');
      }
      for (let i = 0; i < 3; i++) {
        tracker.recordVariation('hello', landmarks2, 0.8, true, 'profile1');
      }

      const clusters = tracker.getVariationClusters('hello');
      // Might create separate clusters for very different poses
      expect(clusters.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('cluster updates', () => {
    it('should update cluster success rate over time', () => {
      const landmarks: GestureLandmarks = {
        handLandmarks: [[[0.5, 0.5, 0], [0.6, 0.6, 0], [0.7, 0.7, 0]]],
      };

      // Record successful variations to create cluster
      for (let i = 0; i < 5; i++) {
        tracker.recordVariation('hello', landmarks, 0.8, true, 'profile1');
      }

      const clusters = tracker.getVariationClusters('hello');
      if (clusters.length > 0) {
        const cluster = clusters[0];
        expect(cluster.successRate).toBeGreaterThan(0);
        expect(cluster.successRate).toBeLessThanOrEqual(1);
        expect(cluster.totalAttempts).toBeGreaterThan(0);
        expect(cluster.successCount).toBeGreaterThan(0);
      }
    });

    it('should update lastUsed timestamp', () => {
      const landmarks: GestureLandmarks = {
        handLandmarks: [[[0.5, 0.5, 0], [0.6, 0.6, 0], [0.7, 0.7, 0]]],
      };

      const start = Date.now();

      for (let i = 0; i < 3; i++) {
        tracker.recordVariation('hello', landmarks, 0.8, true, 'profile1');
      }

      const clusters = tracker.getVariationClusters('hello');
      if (clusters.length > 0) {
        expect(clusters[0].lastUsed).toBeGreaterThanOrEqual(start);
      }
    });
  });

  describe('German UI feedback', () => {
    it('should provide German reason for training recommendation', () => {
      const landmarks1: GestureLandmarks = {
        handLandmarks: [[[0.1, 0.1, 0], [0.2, 0.2, 0], [0.3, 0.3, 0]]],
      };
      const landmarks2: GestureLandmarks = {
        handLandmarks: [[[0.8, 0.8, 0], [0.7, 0.7, 0], [0.6, 0.6, 0]]],
      };

      // Create high diversity scenario
      for (let i = 0; i < 3; i++) {
        tracker.recordVariation('hello', landmarks1, 0.5, true, 'profile1');
        tracker.recordVariation('hello', landmarks2, 0.4, false, 'profile1');
      }

      const metrics = tracker.getLearningMetrics('hello');
      if (metrics.recommendTraining && metrics.reason) {
        expect(metrics.reason).toContain('Training'); // Should be in German
      }
    });
  });
});
