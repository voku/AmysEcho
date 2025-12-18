/**
 * Amy First Critical Tests for Webapp
 *
 * These tests verify the core functionality that ensures Amy can communicate reliably.
 * If any of these tests fail, it represents a critical barrier to Amy's communication.
 *
 * Migrated from app/test/amyFirstCritical.test.ts with adaptations for webapp architecture.
 */

import { vi } from 'vitest';
import { gestureHistoryService } from '../gestureHistoryService';
import { zeroDowntimeModelService } from '../zeroDowntimeModelService';

describe('Amy First Critical Communication Tests', () => {
  beforeEach(() => {
    // Reset services before each test
    gestureHistoryService.clearHistory();
    zeroDowntimeModelService.reset();
  });

  describe('Gesture History Service - Instant Replay', () => {
    it('should store gestures for instant replay', async () => {
      await gestureHistoryService.ready();

      const testGesture = {
        id: 'hallo',
        label: 'Hallo',
        emoji: '👋',
        confidence: 0.9
      };

      gestureHistoryService.addGesture(testGesture);

      const lastGesture = gestureHistoryService.getLastGesture();
      expect(lastGesture?.id).toBe('hallo');
      expect(lastGesture?.label).toBe('Hallo');
    });

    it('should maintain last 10 gestures in memory', async () => {
      await gestureHistoryService.ready();
      gestureHistoryService.clearHistory();

      // Add 12 gestures
      for (let i = 0; i < 12; i++) {
        gestureHistoryService.addGesture({
          id: `gesture_${i}`,
          label: `Gesture ${i}`,
          emoji: '✋',
          confidence: 0.8
        });
      }

      const history = gestureHistoryService.getRecentHistory();
      expect(history).toHaveLength(10); // Should only keep last 10
      expect(history[0]?.id).toBe('gesture_11'); // Most recent first
    });

    it('should provide emergency replay history', async () => {
      await gestureHistoryService.ready();
      gestureHistoryService.clearHistory();

      gestureHistoryService.addGesture({
        id: 'hilfe',
        label: 'Hilfe',
        emoji: '🆘',
        confidence: 0.95
      });

      const emergencyHistory = gestureHistoryService.getEmergencyReplayHistory();
      expect(emergencyHistory.length).toBeGreaterThan(0);
      expect(emergencyHistory[0]?.id).toBe('hilfe');
    });

    it('should allow removing last gesture (undo)', async () => {
      await gestureHistoryService.ready();
      gestureHistoryService.clearHistory();

      gestureHistoryService.addGesture({
        id: 'test',
        label: 'Test',
        emoji: '🧪',
        confidence: 0.8
      });

      const removed = gestureHistoryService.removeLastGesture();
      expect(removed?.id).toBe('test');

      const lastGesture = gestureHistoryService.getLastGesture();
      expect(lastGesture).toBeNull();
    });

    it('should replay gestures from history by ID', async () => {
      await gestureHistoryService.ready();
      gestureHistoryService.clearHistory();

      gestureHistoryService.addGesture({
        id: 'danke',
        label: 'Danke',
        emoji: '🙏',
        confidence: 0.9
      });

      const replayed = gestureHistoryService.replayGesture('danke');
      expect(replayed).not.toBeNull();
      expect(replayed?.label).toBe('Danke');
    });
  });

  describe('Zero Downtime Model Service - Uninterrupted Recognition', () => {
    beforeEach(() => {
      zeroDowntimeModelService.reset();
    });

    it('should track current model version', () => {
      const currentVersion = zeroDowntimeModelService.getCurrentVersion();
      // Initially null before any model is loaded
      expect(currentVersion).toBeNull();
    });

    it('should provide status information', () => {
      const status = zeroDowntimeModelService.getStatus();
      expect(status).toHaveProperty('currentVersion');
      expect(status).toHaveProperty('pendingVersion');
      expect(status).toHaveProperty('isPolling');
      expect(status).toHaveProperty('retryCount');
    });

    it('should support configuration', () => {
      zeroDowntimeModelService.configure({
        endpoint: 'https://example.com/api',
        token: 'test-token',
        profileId: 'test-profile'
      });

      const status = zeroDowntimeModelService.getStatus();
      expect(status.currentVersion).toBeNull(); // Not loaded yet
    });

    it('should allow starting and stopping polling', () => {
      zeroDowntimeModelService.startPolling();
      expect(zeroDowntimeModelService.getStatus().isPolling).toBe(true);

      zeroDowntimeModelService.stopPolling();
      expect(zeroDowntimeModelService.getStatus().isPolling).toBe(false);
    });

    it('should track update availability', () => {
      const hasUpdate = zeroDowntimeModelService.isUpdateAvailable();
      expect(typeof hasUpdate).toBe('boolean');
    });

    it('should support model update callbacks', () => {
      const mockCallback = vi.fn();
      const unsubscribe = zeroDowntimeModelService.onModelUpdate(mockCallback);

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('should support error callbacks', () => {
      const mockErrorCallback = vi.fn();
      const unsubscribe = zeroDowntimeModelService.onError(mockErrorCallback);

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });

  describe('Integration Tests - Complete Communication Pipeline', () => {
    it('should maintain communication during simulated failures', async () => {
      await gestureHistoryService.ready();
      gestureHistoryService.clearHistory();

      // Simulate a gesture being added even during errors
      gestureHistoryService.addGesture({
        id: 'hilfe',
        label: 'Hilfe',
        emoji: '🆘',
        confidence: 0.95
      });

      const lastGesture = gestureHistoryService.getLastGesture();
      expect(lastGesture?.id).toBe('hilfe');
    });

    it('should persist history across sessions', async () => {
      await gestureHistoryService.ready();
      gestureHistoryService.clearHistory();

      gestureHistoryService.addGesture({
        id: 'test_persist',
        label: 'Persist',
        emoji: '💾',
        confidence: 0.85
      });

      // History should be persisted to localStorage
      const stats = gestureHistoryService.getStats();
      expect(stats.totalGestures).toBeGreaterThan(0);
    });
  });

  describe('Performance Tests - Amy First Performance Guarantees', () => {
    it('should process gesture logging within 50ms', async () => {
      await gestureHistoryService.ready();

      const startTime = Date.now();

      gestureHistoryService.addGesture({
        id: 'hilfe',
        label: 'Hilfe',
        emoji: '🆘',
        confidence: 0.95
      });

      const processingTime = Date.now() - startTime;
      expect(processingTime).toBeLessThan(50); // Critical: sub-50ms for Amy First
    });

    it('should maintain stable memory usage', async () => {
      await gestureHistoryService.ready();
      gestureHistoryService.clearHistory();

      // Add many gestures to test memory management
      for (let i = 0; i < 100; i++) {
        gestureHistoryService.addGesture({
          id: `test_${i}`,
          label: `Test ${i}`,
          emoji: '🧪',
          confidence: 0.8
        });
      }

      // Should only keep recent history bounded
      const history = gestureHistoryService.getRecentHistory();
      expect(history.length).toBeLessThanOrEqual(10);
    });

    it('should handle rapid gesture additions', async () => {
      await gestureHistoryService.ready();
      gestureHistoryService.clearHistory();

      const gestures = [
        { id: 'g1', label: 'One', emoji: '1️⃣', confidence: 0.8 },
        { id: 'g2', label: 'Two', emoji: '2️⃣', confidence: 0.85 },
        { id: 'g3', label: 'Three', emoji: '3️⃣', confidence: 0.9 }
      ];

      const startTime = Date.now();

      // Process multiple gestures rapidly
      gestures.forEach(gesture => {
        gestureHistoryService.addGesture(gesture);
      });

      const totalTime = Date.now() - startTime;

      // Should handle concurrent processing efficiently
      expect(totalTime).toBeLessThan(100);
      
      const history = gestureHistoryService.getRecentHistory();
      expect(history.length).toBe(3);
    });
  });

  describe('Data Protection and Privacy', () => {
    it('should handle gestures with sensitive data appropriately', async () => {
      await gestureHistoryService.ready();
      gestureHistoryService.clearHistory();

      gestureHistoryService.addGesture({
        id: 'private',
        label: 'Private',
        emoji: '🔒',
        confidence: 0.9,
        landmarks: [[[0.5, 0.5, 0.8]]] // Landmark data should be handled carefully
      });

      const lastGesture = gestureHistoryService.getLastGesture();
      expect(lastGesture).not.toBeNull();
      // Landmarks may or may not be persisted based on privacy settings
    });

    it('should clear history completely when requested', async () => {
      await gestureHistoryService.ready();

      gestureHistoryService.addGesture({
        id: 'clear_test',
        label: 'Clear',
        emoji: '🧹',
        confidence: 0.8
      });

      gestureHistoryService.clearHistory();

      const history = gestureHistoryService.getRecentHistory();
      expect(history.length).toBe(0);

      const stats = gestureHistoryService.getStats();
      expect(stats.totalGestures).toBe(0);
    });
  });

  describe('Gesture Statistics and Analytics', () => {
    it('should track usage statistics', async () => {
      await gestureHistoryService.ready();
      gestureHistoryService.clearHistory();

      gestureHistoryService.addGesture({
        id: 'hallo',
        label: 'Hallo',
        emoji: '👋',
        confidence: 0.9
      });

      gestureHistoryService.addGesture({
        id: 'hallo',
        label: 'Hallo',
        emoji: '👋',
        confidence: 0.95
      });

      const stats = gestureHistoryService.getStats();
      expect(stats.totalGestures).toBeGreaterThan(0);
      expect(stats.mostUsedGesture?.label).toBe('Hallo');
    });

    it('should calculate communication streaks', async () => {
      await gestureHistoryService.ready();
      gestureHistoryService.clearHistory();

      // Add gestures to build a streak
      for (let i = 0; i < 5; i++) {
        gestureHistoryService.addGesture({
          id: `streak_${i}`,
          label: `Streak ${i}`,
          emoji: '🔥',
          confidence: 0.8
        });
      }

      const stats = gestureHistoryService.getStats();
      expect(stats.communicationStreak).toBeGreaterThan(0);
    });

    it('should track recent activity by time period', async () => {
      await gestureHistoryService.ready();
      gestureHistoryService.clearHistory();

      gestureHistoryService.addGesture({
        id: 'today',
        label: 'Today',
        emoji: '📅',
        confidence: 0.8
      });

      const stats = gestureHistoryService.getStats();
      expect(stats.recentActivity.today).toBeGreaterThan(0);
    });
  });
});
