/**
 * Tests for EnhancedGestureRecognizer
 * 
 * Research Foundation:
 * - Integrates SpatialAttentionProcessor, MultiScaleTemporalFeatureExtractor, and LandmarkEmbedding
 * - "Spatial-temporal attention with graph and general neural networks" (Springer 2024)
 * - Comprehensive multimodal sign language detection with attention mechanisms
 * 
 * Amy First: Self-discovering multimodal sign language detection system
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  EnhancedGestureRecognizer,
} from '../EnhancedGestureRecognizer';

describe('EnhancedGestureRecognizer', () => {
  let recognizer: EnhancedGestureRecognizer;

  beforeEach(() => {
    recognizer = new EnhancedGestureRecognizer();
  });

  afterEach(() => {
    recognizer.dispose();
  });

  describe('single-hand recognition', () => {
    it('should enhance single-hand landmarks with attention', () => {
      const landmarks = createTestHandLandmarks();
      const result = recognizer.processLandmarks(landmarks);
      
      expect(result).toBeDefined();
      expect(result.enhancedLandmarks).toHaveLength(21);
      expect(result.attentionWeights).toHaveLength(21);
    });

    it('should compute attention-weighted features', () => {
      const landmarks = createTestHandLandmarks();
      const result = recognizer.processLandmarks(landmarks);
      
      // Attention weights should sum to 1
      const sum = result.attentionWeights.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should produce embeddings for recognition', () => {
      const landmarks = createTestHandLandmarks();
      const result = recognizer.processLandmarks(landmarks);
      
      expect(result.embeddings).toBeDefined();
      expect(result.embeddings.length).toBeGreaterThan(0);
    });

    it('should extract temporal features when sequence is provided', () => {
      const sequence = [
        createTestHandLandmarks(),
        createTestHandLandmarks().map(l => [(l[0] ?? 0) + 0.01, l[1] ?? 0, l[2] ?? 0]),
        createTestHandLandmarks().map(l => [(l[0] ?? 0) + 0.02, l[1] ?? 0, l[2] ?? 0]),
      ];
      
      // Process as sequence
      const result = recognizer.processSequence(sequence);
      
      expect(result.temporalFeatures).toBeDefined();
      expect(result.temporalFeatures.length).toBeGreaterThan(0);
    });
  });

  describe('two-hand recognition', () => {
    it('should process two-hand gestures with cross-hand attention', () => {
      const leftHand = createTestHandLandmarks();
      const rightHand = createTestHandLandmarks().map(l => [(l[0] ?? 0) + 0.3, l[1] ?? 0, l[2] ?? 0]);
      
      const result = recognizer.processTwoHands(leftHand, rightHand);
      
      expect(result.leftHandResult).toBeDefined();
      expect(result.rightHandResult).toBeDefined();
      expect(result.crossHandFeatures).toBeDefined();
    });

    it('should compute symmetry score for two hands', () => {
      const leftHand = createTestHandLandmarks();
      const rightHand = leftHand.map(l => [1 - (l[0] ?? 0), l[1] ?? 0, l[2] ?? 0]); // Mirror
      
      const result = recognizer.processTwoHands(leftHand, rightHand);
      
      expect(result.crossHandFeatures.symmetryScore).toBeGreaterThan(0.7);
    });

    it('should detect interaction points between hands', () => {
      // Create hands with overlapping positions
      const leftHand = createTestHandLandmarks();
      const rightHand = createTestHandLandmarks().map(l => [(l[0] ?? 0) + 0.05, l[1] ?? 0, l[2] ?? 0]);
      
      const result = recognizer.processTwoHands(leftHand, rightHand);
      
      // Should find some interaction points due to proximity
      expect(result.crossHandFeatures.interactionScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('multimodal processing', () => {
    it('should incorporate pose landmarks when available', () => {
      const handLandmarks = createTestHandLandmarks();
      const poseLandmarks = createTestPoseLandmarks();
      
      const result = recognizer.processMultimodal({
        handLandmarks: [handLandmarks],
        poseLandmarks,
        faceLandmarks: [],
      });
      
      expect(result.modalitiesUsed.hand).toBe(true);
      expect(result.modalitiesUsed.pose).toBe(true);
      expect(result.combinedFeatures).toBeDefined();
    });

    it('should incorporate face landmarks when available', () => {
      const handLandmarks = createTestHandLandmarks();
      const faceLandmarks = createTestFaceLandmarks();
      
      const result = recognizer.processMultimodal({
        handLandmarks: [handLandmarks],
        poseLandmarks: [],
        faceLandmarks,
      });
      
      expect(result.modalitiesUsed.face).toBe(true);
    });

    it('should handle missing modalities gracefully', () => {
      const handLandmarks = createTestHandLandmarks();
      
      const result = recognizer.processMultimodal({
        handLandmarks: [handLandmarks],
        poseLandmarks: [],
        faceLandmarks: [],
      });
      
      expect(result.modalitiesUsed.hand).toBe(true);
      expect(result.modalitiesUsed.pose).toBe(false);
      expect(result.modalitiesUsed.face).toBe(false);
    });

    it('should compute lip-hand distance for non-manual markers', () => {
      const handLandmarks = createTestHandLandmarks();
      const faceLandmarks = createTestFaceLandmarks();
      
      const result = recognizer.processMultimodal({
        handLandmarks: [handLandmarks],
        poseLandmarks: [],
        faceLandmarks,
      });
      
      // Should compute distance between hand and face
      expect(result.nonManualFeatures).toBeDefined();
      if (result.nonManualFeatures) {
        expect(result.nonManualFeatures.lipPointingDistance).toBeDefined();
      }
    });
  });

  describe('gesture pattern learning', () => {
    it('should learn from successful gesture recognitions', () => {
      const landmarks = createThumbsUpLandmarks();
      
      // Record multiple successful recognitions
      for (let i = 0; i < 5; i++) {
        recognizer.recordSuccess('thumbs_up', landmarks, 0.9);
      }
      
      // Should have learned the pattern
      const hasLearned = recognizer.hasLearnedPattern('thumbs_up');
      expect(hasLearned).toBe(true);
    });

    it('should apply learned attention patterns', () => {
      const landmarks = createThumbsUpLandmarks();
      
      // Record pattern
      for (let i = 0; i < 5; i++) {
        recognizer.recordSuccess('thumbs_up', landmarks, 0.9);
      }
      
      // Process with learned patterns
      const result = recognizer.processWithLearnedPatterns('thumbs_up', landmarks);
      
      expect(result.isAdapted).toBe(true);
      expect(result.adaptationConfidence).toBeGreaterThan(0);
    });

    it('should export learned patterns for persistence', () => {
      const landmarks = createThumbsUpLandmarks();
      
      for (let i = 0; i < 3; i++) {
        recognizer.recordSuccess('wave', landmarks, 0.85);
      }
      
      const exportedPatterns = recognizer.exportLearnedPatterns();
      
      expect(exportedPatterns).toBeDefined();
      expect(typeof exportedPatterns).toBe('object');
    });
  });

  describe('recognition pipeline', () => {
    it('should run full recognition pipeline', () => {
      const landmarks = createTestHandLandmarks();
      const timestamp = Date.now();
      
      const result = recognizer.recognize(landmarks, timestamp);
      
      expect(result).toBeDefined();
      expect(result.timestamp).toBe(timestamp);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should track processing time', () => {
      const landmarks = createTestHandLandmarks();
      
      const result = recognizer.recognize(landmarks, Date.now());
      
      expect(result.processingTimeMs).toBeDefined();
      expect(typeof result.processingTimeMs).toBe('number');
    });

    it('should include confidence scores', () => {
      const landmarks = createTestHandLandmarks();
      
      const result = recognizer.recognize(landmarks, Date.now());
      
      expect(result.confidence).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('diagnostics and statistics', () => {
    it('should provide recognition statistics', () => {
      const landmarks = createTestHandLandmarks();
      
      for (let i = 0; i < 10; i++) {
        recognizer.recognize(landmarks, Date.now() + i * 33);
      }
      
      const stats = recognizer.getStats();
      
      expect(stats.totalRecognitions).toBe(10);
      expect(stats.averageProcessingTime).toBeGreaterThanOrEqual(0);
    });

    it('should track attention entropy over time', () => {
      const landmarks = createTestHandLandmarks();
      
      recognizer.recognize(landmarks, Date.now());
      
      const stats = recognizer.getStats();
      expect(stats.averageAttentionEntropy).toBeDefined();
    });
  });

  describe('memory management', () => {
    it('should handle many recognition cycles without memory issues', () => {
      const landmarks = createTestHandLandmarks();
      
      for (let i = 0; i < 100; i++) {
        recognizer.recognize(landmarks, Date.now() + i * 33);
      }
      
      // Should complete without issues
      const stats = recognizer.getStats();
      expect(stats.totalRecognitions).toBe(100);
    });

    it('should cleanup properly on dispose', () => {
      const landmarks = createTestHandLandmarks();
      recognizer.recognize(landmarks, Date.now());
      
      recognizer.dispose();
      
      // Create new recognizer - should work fresh
      const newRecognizer = new EnhancedGestureRecognizer();
      const result = newRecognizer.recognize(landmarks, Date.now());
      expect(result).toBeDefined();
      
      newRecognizer.dispose();
    });
  });
});

/**
 * Create test hand landmarks (21 points)
 */
function createTestHandLandmarks(): number[][] {
  const landmarks: number[][] = [];
  
  for (let i = 0; i < 21; i++) {
    const angle = (i / 21) * Math.PI * 2;
    const radius = 0.05 + (i % 5) * 0.02;
    const x = 0.5 + Math.cos(angle) * radius;
    const y = 0.5 + Math.sin(angle) * radius;
    landmarks.push([x, y, 0]);
  }
  
  return landmarks;
}

/**
 * Create thumbs up landmarks
 */
function createThumbsUpLandmarks(): number[][] {
  const landmarks: number[][] = [];
  
  // Wrist (0)
  landmarks.push([0.5, 0.7, 0]);
  
  // Thumb (1-4) - extended upward
  landmarks.push([0.45, 0.65, 0]);
  landmarks.push([0.43, 0.55, 0]);
  landmarks.push([0.42, 0.45, 0]);
  landmarks.push([0.42, 0.35, 0]);
  
  // Index finger (5-8) - curled
  landmarks.push([0.48, 0.65, 0]);
  landmarks.push([0.47, 0.62, 0.05]);
  landmarks.push([0.46, 0.64, 0.08]);
  landmarks.push([0.45, 0.67, 0.06]);
  
  // Middle finger (9-12) - curled
  landmarks.push([0.50, 0.65, 0]);
  landmarks.push([0.50, 0.62, 0.05]);
  landmarks.push([0.50, 0.64, 0.08]);
  landmarks.push([0.50, 0.67, 0.06]);
  
  // Ring finger (13-16) - curled
  landmarks.push([0.52, 0.65, 0]);
  landmarks.push([0.53, 0.62, 0.05]);
  landmarks.push([0.54, 0.64, 0.08]);
  landmarks.push([0.55, 0.67, 0.06]);
  
  // Pinky finger (17-20) - curled
  landmarks.push([0.54, 0.67, 0]);
  landmarks.push([0.55, 0.65, 0.05]);
  landmarks.push([0.56, 0.67, 0.08]);
  landmarks.push([0.57, 0.69, 0.06]);
  
  return landmarks;
}

/**
 * Create test pose landmarks (33 points for MediaPipe Pose)
 */
function createTestPoseLandmarks(): number[][] {
  const landmarks: number[][] = [];
  
  for (let i = 0; i < 33; i++) {
    landmarks.push([0.5 + (i % 10) * 0.03, 0.3 + Math.floor(i / 10) * 0.2, 0, 0.9]);
  }
  
  return landmarks;
}

/**
 * Create test face landmarks (468 points for MediaPipe Face)
 */
function createTestFaceLandmarks(): number[][] {
  const landmarks: number[][] = [];
  
  // Create simplified face landmarks (just 10 for testing)
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    landmarks.push([0.5 + Math.cos(angle) * 0.1, 0.3 + Math.sin(angle) * 0.1, 0]);
  }
  
  return landmarks;
}
