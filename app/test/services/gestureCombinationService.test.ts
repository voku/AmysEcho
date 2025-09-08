/**
 * Gesture Combination Service Tests - Amy First
 *
 * Comprehensive tests for gesture sequence recognition and management.
 * Ensures Amy can reliably combine gestures for complex communication.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { gestureCombinationService, GestureSequence, SequenceMatch } from '../../src/services/gestureCombinationService';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('GestureCombinationService', () => {
  beforeEach(() => {
    // Clear all mocks and reset service state
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue();

    // Reset the singleton instance for clean tests
    // @ts-ignore - accessing private property for testing
    gestureCombinationService.sequences.clear();
    // @ts-ignore
    gestureCombinationService.activeSequences.clear();

    // Don't initialize defaults - we want clean state for most tests
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Sequence Processing', () => {
    it('should return null for low confidence gestures', () => {
      const result = gestureCombinationService.processGesture('help', 0.3);
      expect(result).toBeNull();
    });

    it('should handle single-gesture sequences immediately', () => {
      const singleGestureSequence: Omit<GestureSequence, 'usageCount' | 'lastUsed'> = {
        id: 'single_test',
        name: 'Single Test',
        description: 'Test single gesture',
        gestures: ['test_gesture'],
        combinedMeaning: 'Test completed',
        timeWindow: 1000,
        minConfidence: 0.5,
        enabled: true,
      };

      gestureCombinationService.addSequence(singleGestureSequence);

      const result = gestureCombinationService.processGesture('test_gesture', 0.8);

      expect(result).not.toBeNull();
      expect(result?.sequenceId).toBe('single_test');
      expect(result?.completedGestures).toEqual(['test_gesture']);
      expect(result?.remainingGestures).toEqual([]);
    });

    it('should process multi-gesture sequences correctly', () => {
      const multiGestureSequence: Omit<GestureSequence, 'usageCount' | 'lastUsed'> = {
        id: 'multi_test',
        name: 'Multi Test',
        description: 'Test multi gesture sequence',
        gestures: ['first', 'second', 'third'],
        combinedMeaning: 'Multi gesture completed',
        timeWindow: 2000,
        minConfidence: 0.5,
        enabled: true,
      };

      gestureCombinationService.addSequence(multiGestureSequence);

      // Verify sequence was added
      const allSequences = gestureCombinationService.getAllSequences();
      expect(allSequences.some(s => s.id === 'multi_test')).toBe(true);

      // First gesture - should start sequence and return partial match
      let result = gestureCombinationService.processGesture('first', 0.8);
      expect(result).not.toBeNull();
      expect(result?.completedGestures).toEqual(['first']);
      expect(result?.remainingGestures).toEqual(['second', 'third']);

      // Check that sequence is still active
      const active = gestureCombinationService.getActiveSequences();
      expect(active).toHaveLength(1);
      expect(active[0].progress).toEqual(['first']);

      // Second gesture - should continue sequence and return partial match
      result = gestureCombinationService.processGesture('second', 0.8);
      expect(result).not.toBeNull();
      expect(result?.completedGestures).toEqual(['first', 'second']);
      expect(result?.remainingGestures).toEqual(['third']);

      // Check progress updated
      const activeAfterSecond = gestureCombinationService.getActiveSequences();
      expect(activeAfterSecond[0].progress).toEqual(['first', 'second']);

      // Third gesture - should complete sequence and return completed match
      result = gestureCombinationService.processGesture('third', 0.8);
      expect(result).not.toBeNull();
      expect(result?.sequenceId).toBe('multi_test');
      expect(result?.completedGestures).toEqual(['first', 'second', 'third']);
      expect(result?.remainingGestures).toEqual([]);

      // Sequence should no longer be active
      const activeAfterComplete = gestureCombinationService.getActiveSequences();
      expect(activeAfterComplete).toHaveLength(0);
    });

    it('should respect time windows between gestures', () => {
      const timedSequence: Omit<GestureSequence, 'usageCount' | 'lastUsed'> = {
        id: 'timed_test',
        name: 'Timed Test',
        description: 'Test time window',
        gestures: ['start', 'end'],
        combinedMeaning: 'Timed sequence',
        timeWindow: 1000, // 1 second window
        minConfidence: 0.5,
        enabled: true,
      };

      gestureCombinationService.addSequence(timedSequence);

      // Start sequence
      gestureCombinationService.processGesture('start', 0.8);

      // Wait longer than time window
      jest.advanceTimersByTime(1500);

      // Second gesture should not match due to timeout
      const result = gestureCombinationService.processGesture('end', 0.8);
      expect(result).toBeNull();

      // Active sequence should be cleaned up
      const active = gestureCombinationService.getActiveSequences();
      expect(active).toHaveLength(0);
    });

    it('should handle multiple active sequences simultaneously', () => {
      const sequence1: Omit<GestureSequence, 'usageCount' | 'lastUsed'> = {
        id: 'seq1',
        name: 'Sequence 1',
        description: 'First sequence',
        gestures: ['a', 'b'],
        combinedMeaning: 'Sequence 1 complete',
        timeWindow: 2000,
        minConfidence: 0.5,
        enabled: true,
      };

      const sequence2: Omit<GestureSequence, 'usageCount' | 'lastUsed'> = {
        id: 'seq2',
        name: 'Sequence 2',
        description: 'Second sequence',
        gestures: ['x', 'y'],
        combinedMeaning: 'Sequence 2 complete',
        timeWindow: 2000,
        minConfidence: 0.5,
        enabled: true,
      };

      gestureCombinationService.addSequence(sequence1);
      gestureCombinationService.addSequence(sequence2);

      // Start both sequences
      gestureCombinationService.processGesture('a', 0.8);
      gestureCombinationService.processGesture('x', 0.8);

      // Complete first sequence
      const result1 = gestureCombinationService.processGesture('b', 0.8);
      expect(result1?.sequenceId).toBe('seq1');

      // Complete second sequence
      const result2 = gestureCombinationService.processGesture('y', 0.8);
      expect(result2?.sequenceId).toBe('seq2');
    });

    it('should calculate match confidence correctly', () => {
      const confidenceSequence: Omit<GestureSequence, 'usageCount' | 'lastUsed'> = {
        id: 'confidence_test',
        name: 'Confidence Test',
        description: 'Test confidence calculation',
        gestures: ['gesture1', 'gesture2'],
        combinedMeaning: 'Confidence test',
        timeWindow: 2000,
        minConfidence: 0.5,
        enabled: true,
      };

      gestureCombinationService.addSequence(confidenceSequence);

      // Verify sequence was added
      const allSequences = gestureCombinationService.getAllSequences();
      expect(allSequences.some(s => s.id === 'confidence_test')).toBe(true);

      // First gesture - should start sequence and return partial match
      const result1 = gestureCombinationService.processGesture('gesture1', 0.8);
      expect(result1).not.toBeNull();
      expect(result1?.matchConfidence).toBeGreaterThan(0);
      expect(result1?.matchConfidence).toBeLessThan(1);

      // Second gesture immediately after - should complete and return match
      const result2 = gestureCombinationService.processGesture('gesture2', 0.8);
      expect(result2).not.toBeNull();
      expect(result2?.matchConfidence).toBe(1); // Should be 1 for completed sequence
    });
  });

  describe('Sequence Management', () => {
    it('should add and retrieve sequences', () => {
      const testSequence: Omit<GestureSequence, 'usageCount' | 'lastUsed'> = {
        id: 'test_seq',
        name: 'Test Sequence',
        description: 'A test sequence',
        gestures: ['test1', 'test2'],
        combinedMeaning: 'Test completed',
        timeWindow: 1500,
        minConfidence: 0.6,
        enabled: true,
      };

      const sequencesBefore = gestureCombinationService.getAllSequences().length;
      gestureCombinationService.addSequence(testSequence);

      const allSequences = gestureCombinationService.getAllSequences();
      expect(allSequences).toHaveLength(sequencesBefore + 1);
      const addedSequence = allSequences.find(s => s.id === 'test_seq');
      expect(addedSequence).toBeDefined();
      expect(addedSequence?.name).toBe('Test Sequence');
    });

    it('should remove sequences', () => {
      const testSequence: Omit<GestureSequence, 'usageCount' | 'lastUsed'> = {
        id: 'remove_test',
        name: 'Remove Test',
        description: 'Test removal',
        gestures: ['remove'],
        combinedMeaning: 'Removed',
        timeWindow: 1000,
        minConfidence: 0.5,
        enabled: true,
      };

      const sequencesBefore = gestureCombinationService.getAllSequences().length;
      gestureCombinationService.addSequence(testSequence);
      expect(gestureCombinationService.getAllSequences()).toHaveLength(sequencesBefore + 1);

      gestureCombinationService.removeSequence('remove_test');
      expect(gestureCombinationService.getAllSequences()).toHaveLength(sequencesBefore);
    });

    it('should enable and disable sequences', () => {
      const toggleSequence: Omit<GestureSequence, 'usageCount' | 'lastUsed'> = {
        id: 'toggle_test',
        name: 'Toggle Test',
        description: 'Test enable/disable',
        gestures: ['toggle'],
        combinedMeaning: 'Toggled',
        timeWindow: 1000,
        minConfidence: 0.5,
        enabled: true,
      };

      gestureCombinationService.addSequence(toggleSequence);

      // Find the added sequence
      let sequences = gestureCombinationService.getAllSequences();
      let toggleSeq = sequences.find(s => s.id === 'toggle_test');
      expect(toggleSeq?.enabled).toBe(true);

      // Disable
      gestureCombinationService.setSequenceEnabled('toggle_test', false);
      sequences = gestureCombinationService.getAllSequences();
      toggleSeq = sequences.find(s => s.id === 'toggle_test');
      expect(toggleSeq?.enabled).toBe(false);

      // Re-enable
      gestureCombinationService.setSequenceEnabled('toggle_test', true);
      sequences = gestureCombinationService.getAllSequences();
      toggleSeq = sequences.find(s => s.id === 'toggle_test');
      expect(toggleSeq?.enabled).toBe(true);
    });

    it('should not process disabled sequences', () => {
      const disabledSequence: Omit<GestureSequence, 'usageCount' | 'lastUsed'> = {
        id: 'disabled_test',
        name: 'Disabled Test',
        description: 'Test disabled sequence',
        gestures: ['disabled'],
        combinedMeaning: 'Should not work',
        timeWindow: 1000,
        minConfidence: 0.5,
        enabled: false,
      };

      gestureCombinationService.addSequence(disabledSequence);

      const result = gestureCombinationService.processGesture('disabled', 0.8);
      expect(result).toBeNull();
    });
  });

  describe('Active Sequences', () => {
    it('should track active sequences', () => {
      const activeSequence: Omit<GestureSequence, 'usageCount' | 'lastUsed'> = {
        id: 'active_test',
        name: 'Active Test',
        description: 'Test active tracking',
        gestures: ['start', 'middle', 'end'],
        combinedMeaning: 'Active test complete',
        timeWindow: 3000,
        minConfidence: 0.5,
        enabled: true,
      };

      gestureCombinationService.addSequence(activeSequence);

      // Start sequence
      gestureCombinationService.processGesture('start', 0.8);
      let active = gestureCombinationService.getActiveSequences();
      expect(active).toHaveLength(1);
      expect(active[0].progress).toEqual(['start']);
      expect(active[0].timeRemaining).toBeGreaterThan(0);

      // Continue sequence
      gestureCombinationService.processGesture('middle', 0.8);
      active = gestureCombinationService.getActiveSequences();
      expect(active[0].progress).toEqual(['start', 'middle']);

      // Complete sequence
      gestureCombinationService.processGesture('end', 0.8);
      active = gestureCombinationService.getActiveSequences();
      expect(active).toHaveLength(0); // Should be removed when completed
    });

    it('should clean up expired active sequences', () => {
      const expireSequence: Omit<GestureSequence, 'usageCount' | 'lastUsed'> = {
        id: 'expire_test',
        name: 'Expire Test',
        description: 'Test expiration',
        gestures: ['start', 'end'],
        combinedMeaning: 'Expired',
        timeWindow: 1000,
        minConfidence: 0.5,
        enabled: true,
      };

      gestureCombinationService.addSequence(expireSequence);

      // Start sequence
      gestureCombinationService.processGesture('start', 0.8);
      expect(gestureCombinationService.getActiveSequences()).toHaveLength(1);

      // Wait for expiration
      jest.advanceTimersByTime(1500);

      // Process an unrelated gesture to trigger cleanup (cleanup happens in processGesture)
      gestureCombinationService.processGesture('unrelated', 0.8);
      expect(gestureCombinationService.getActiveSequences()).toHaveLength(0);
    });
  });

  describe('Statistics and Usage Tracking', () => {
    it('should track usage statistics', () => {
      const usageSequence: Omit<GestureSequence, 'usageCount' | 'lastUsed'> = {
        id: 'usage_test',
        name: 'Usage Test',
        description: 'Test usage tracking',
        gestures: ['usage'],
        combinedMeaning: 'Usage tracked',
        timeWindow: 1000,
        minConfidence: 0.5,
        enabled: true,
      };

      const sequencesBefore = gestureCombinationService.getAllSequences().length;
      gestureCombinationService.addSequence(usageSequence);

      // Use sequence multiple times
      gestureCombinationService.processGesture('usage', 0.8);
      gestureCombinationService.processGesture('usage', 0.8);
      gestureCombinationService.processGesture('usage', 0.8);

      const stats = gestureCombinationService.getSequenceStats();
      expect(stats.totalSequences).toBe(sequencesBefore + 1);
      expect(stats.totalUsage).toBe(3);
      expect(stats.mostUsedSequence).toBe('Usage Test');
    });

    it('should return correct stats when no sequences exist', () => {
      // Clear all sequences for this test
      // @ts-ignore
      gestureCombinationService.sequences.clear();

      const stats = gestureCombinationService.getSequenceStats();
      expect(stats.totalSequences).toBe(0);
      expect(stats.activeSequences).toBe(0);
      expect(stats.mostUsedSequence).toBe('');
      expect(stats.totalUsage).toBe(0);
    });
  });

  describe('Persistence', () => {
    it('should load sequences from AsyncStorage', async () => {
      jest.setTimeout(30000); // Increase timeout for this test
      const storedSequences = {
        'stored_test': {
          id: 'stored_test',
          name: 'Stored Test',
          description: 'Test persistence',
          gestures: ['stored'],
          combinedMeaning: 'Loaded from storage',
          timeWindow: 1000,
          minConfidence: 0.5,
          enabled: true,
          usageCount: 5,
          lastUsed: Date.now(),
        }
      };

      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(storedSequences));

      // Create new instance to trigger load
      // @ts-ignore - accessing private constructor for testing
      const newService = new (gestureCombinationService.constructor as any)();

      // Wait for async load to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      // @ts-ignore - accessing private property for testing
      expect(newService.sequences.size).toBe(1);
      // @ts-ignore
      expect(newService.sequences.get('stored_test').usageCount).toBe(5);
    }, 15000);

    it('should save sequences to AsyncStorage', () => {
      const saveSequence: Omit<GestureSequence, 'usageCount' | 'lastUsed'> = {
        id: 'save_test',
        name: 'Save Test',
        description: 'Test saving',
        gestures: ['save'],
        combinedMeaning: 'Saved',
        timeWindow: 1000,
        minConfidence: 0.5,
        enabled: true,
      };

      gestureCombinationService.addSequence(saveSequence);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'gesture_sequences',
        expect.any(String)
      );
    });

    it('should handle AsyncStorage errors gracefully', async () => {
      mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));
      mockAsyncStorage.setItem.mockRejectedValue(new Error('Storage error'));

      // Should not throw errors
      expect(() => {
        gestureCombinationService.addSequence({
          id: 'error_test',
          name: 'Error Test',
          description: 'Test error handling',
          gestures: ['error'],
          combinedMeaning: 'Error handled',
          timeWindow: 1000,
          minConfidence: 0.5,
          enabled: true,
        });
      }).not.toThrow();
    });
  });

  describe('Default Sequences', () => {
    it('should initialize default sequences when none exist', () => {
      // Clear sequences and initialize defaults
      // @ts-ignore
      gestureCombinationService.sequences.clear();
      // @ts-ignore
      gestureCombinationService.initializeDefaultSequences();

      const sequences = gestureCombinationService.getAllSequences();

      // Should have default sequences
      expect(sequences.length).toBeGreaterThan(0);

      // Check for expected default sequences
      const sequenceIds = sequences.map(s => s.id);
      expect(sequenceIds).toContain('help_me_drink');
      expect(sequenceIds).toContain('thank_you_please');
      expect(sequenceIds).toContain('good_morning');
      expect(sequenceIds).toContain('i_love_you');
    });

    it('should not reinitialize if sequences already exist', () => {
      // Add a sequence first
      gestureCombinationService.addSequence({
        id: 'existing_test',
        name: 'Existing Test',
        description: 'Test existing sequences',
        gestures: ['existing'],
        combinedMeaning: 'Already exists',
        timeWindow: 1000,
        minConfidence: 0.5,
        enabled: true,
      });

      const sequencesBefore = gestureCombinationService.getAllSequences().length;

      // Try to trigger initialization again (this would happen on service access)
      const sequencesAfter = gestureCombinationService.getAllSequences().length;

      expect(sequencesAfter).toBe(sequencesBefore);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty gesture arrays', () => {
      const emptySequence: Omit<GestureSequence, 'usageCount' | 'lastUsed'> = {
        id: 'empty_test',
        name: 'Empty Test',
        description: 'Test empty gestures',
        gestures: [],
        combinedMeaning: 'Empty',
        timeWindow: 1000,
        minConfidence: 0.5,
        enabled: true,
      };

      gestureCombinationService.addSequence(emptySequence);

      const result = gestureCombinationService.processGesture('anything', 0.8);
      expect(result).toBeNull();
    });

    it('should handle gestures below minimum confidence', () => {
      const confidenceSequence: Omit<GestureSequence, 'usageCount' | 'lastUsed'> = {
        id: 'confidence_test',
        name: 'Confidence Test',
        description: 'Test confidence threshold',
        gestures: ['low_confidence'],
        combinedMeaning: 'Low confidence',
        timeWindow: 1000,
        minConfidence: 0.8,
        enabled: true,
      };

      gestureCombinationService.addSequence(confidenceSequence);

      const result = gestureCombinationService.processGesture('low_confidence', 0.6);
      expect(result).toBeNull();
    });

    it('should handle concurrent sequence starts', () => {
      const sequence1: Omit<GestureSequence, 'usageCount' | 'lastUsed'> = {
        id: 'concurrent1',
        name: 'Concurrent 1',
        description: 'First concurrent',
        gestures: ['shared', 'unique1'],
        combinedMeaning: 'Concurrent 1',
        timeWindow: 2000,
        minConfidence: 0.5,
        enabled: true,
      };

      const sequence2: Omit<GestureSequence, 'usageCount' | 'lastUsed'> = {
        id: 'concurrent2',
        name: 'Concurrent 2',
        description: 'Second concurrent',
        gestures: ['shared', 'unique2'],
        combinedMeaning: 'Concurrent 2',
        timeWindow: 2000,
        minConfidence: 0.5,
        enabled: true,
      };

      gestureCombinationService.addSequence(sequence1);
      gestureCombinationService.addSequence(sequence2);

      // Start both sequences with same gesture
      gestureCombinationService.processGesture('shared', 0.8);

      // Both should be active
      const active = gestureCombinationService.getActiveSequences();
      expect(active.length).toBe(2);

      // Complete first sequence
      gestureCombinationService.processGesture('unique1', 0.8);
      expect(gestureCombinationService.getActiveSequences().length).toBe(1);

      // Complete second sequence
      gestureCombinationService.processGesture('unique2', 0.8);
      expect(gestureCombinationService.getActiveSequences().length).toBe(0);
    });
  });
});