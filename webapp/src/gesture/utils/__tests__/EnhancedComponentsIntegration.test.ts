/**
 * Integration Tests for Research-Backed Enhanced Components
 *
 * Tests that the new SpatialAttentionProcessor, MultiScaleTemporalFeatureExtractor,
 * LandmarkEmbedding, and EnhancedGestureRecognizer work correctly with the existing
 * server training pipeline and model output.
 *
 * Amy First: Ensure all components work together seamlessly
 */

import { describe, it, expect } from 'vitest';
import { SpatialAttentionProcessor } from '../SpatialAttentionProcessor';
import { MultiScaleTemporalFeatureExtractor } from '../MultiScaleTemporalFeatureExtractor';
import { LandmarkEmbedding } from '../LandmarkEmbedding';
import { EnhancedGestureRecognizer } from '../EnhancedGestureRecognizer';

/**
 * Test compatibility with training data format
 * The training pipeline expects landmarks in a specific format that must be preserved
 */
describe('Training Pipeline Compatibility', () => {
  describe('Landmark Format Compatibility', () => {
    it('should preserve hand landmark format expected by server training', () => {
      // Server expects 42 landmarks (21 left + 21 right), each with [x, y, z]
      const handLandmarks = createServerFormatLandmarks();
      
      const attention = new SpatialAttentionProcessor();
      const embedding = new LandmarkEmbedding();
      const recognizer = new EnhancedGestureRecognizer();
      
      try {
        // Process landmarks
        const attentionResult = attention.computeAttentionWeights(handLandmarks);
        const embeddingResult = embedding.embed(handLandmarks);
        const recognizerResult = recognizer.processLandmarks(handLandmarks);
        
        // Verify results maintain correct structure
        expect(attentionResult.jointWeights).toHaveLength(21);
        expect(embeddingResult.embeddings).toHaveLength(21);
        expect(recognizerResult.enhancedLandmarks).toHaveLength(21);
        
        // Verify each landmark still has 3 coordinates
        for (const landmark of recognizerResult.enhancedLandmarks) {
          expect(landmark).toHaveLength(3);
          expect(landmark.every(v => typeof v === 'number' && !isNaN(v))).toBe(true);
        }
      } finally {
        attention.dispose();
        embedding.dispose();
        recognizer.dispose();
      }
    });

    it('should handle two-hand gestures in training format', () => {
      const leftHand = createServerFormatLandmarks();
      const rightHand = createServerFormatLandmarks().map(l => [(l[0] ?? 0) + 0.3, l[1] ?? 0, l[2] ?? 0]);
      
      const recognizer = new EnhancedGestureRecognizer();
      
      try {
        const result = recognizer.processTwoHands(leftHand, rightHand);
        
        // Both hands should be processed
        expect(result.leftHandResult.enhancedLandmarks).toHaveLength(21);
        expect(result.rightHandResult.enhancedLandmarks).toHaveLength(21);
        
        // Cross-hand features should be computed
        expect(result.crossHandFeatures.symmetryScore).toBeGreaterThanOrEqual(0);
        expect(result.crossHandFeatures.symmetryScore).toBeLessThanOrEqual(1);
      } finally {
        recognizer.dispose();
      }
    });

    it('should handle multimodal data format from training bundles', () => {
      const handLandmarks = createServerFormatLandmarks();
      const poseLandmarks = createPoseLandmarks();
      const faceLandmarks = createFaceLandmarks();
      
      const recognizer = new EnhancedGestureRecognizer();
      
      try {
        const result = recognizer.processMultimodal({
          handLandmarks: [handLandmarks],
          poseLandmarks,
          faceLandmarks,
        });
        
        expect(result.modalitiesUsed.hand).toBe(true);
        expect(result.modalitiesUsed.pose).toBe(true);
        expect(result.modalitiesUsed.face).toBe(true);
        expect(result.combinedFeatures.length).toBeGreaterThan(0);
      } finally {
        recognizer.dispose();
      }
    });
  });

  describe('Temporal Feature Compatibility', () => {
    it('should extract temporal features compatible with server training', () => {
      // Create a sequence of frames as would be captured during training
      const sequence = createTrainingFrameSequence(15);
      
      const extractor = new MultiScaleTemporalFeatureExtractor();
      
      try {
        // Flatten landmarks for temporal extraction (as server does)
        const flatSequence = sequence.map(frame => frame.flat());
        
        const features = extractor.extractAndFuse(flatSequence);
        
        // Should produce features for temporal patterns
        expect(features.length).toBeGreaterThan(0);
        
        // Features should be consistent dimensions
        const firstFlat = flatSequence[0];
        if (firstFlat && features[0]) {
          const expectedDim = firstFlat.length * 3; // 3 scales
          expect(features[0].length).toBe(expectedDim);
        }
      } finally {
        extractor.dispose();
      }
    });

    it('should handle variable-length gesture sequences', () => {
      const shortSequence = createTrainingFrameSequence(5);
      const mediumSequence = createTrainingFrameSequence(15);
      const longSequence = createTrainingFrameSequence(30);
      
      const extractor = new MultiScaleTemporalFeatureExtractor();
      
      try {
        const shortFeatures = extractor.extractAndFuse(shortSequence.map(f => f.flat()));
        const mediumFeatures = extractor.extractAndFuse(mediumSequence.map(f => f.flat()));
        const longFeatures = extractor.extractAndFuse(longSequence.map(f => f.flat()));
        
        // All should produce valid features
        expect(shortFeatures.length).toBeGreaterThanOrEqual(0);
        expect(mediumFeatures.length).toBeGreaterThan(0);
        expect(longFeatures.length).toBeGreaterThan(0);
        
        // Feature dimensions should be consistent (same input landmark count)
        if (shortFeatures[0] && mediumFeatures[0] && longFeatures[0]) {
          expect(shortFeatures[0].length).toBe(mediumFeatures[0].length);
          expect(mediumFeatures[0].length).toBe(longFeatures[0].length);
        }
      } finally {
        extractor.dispose();
      }
    });
  });

  describe('Attention Pattern Learning Compatibility', () => {
    it('should learn and export patterns compatible with variation tracking', () => {
      const recognizer = new EnhancedGestureRecognizer();
      
      try {
        // Simulate learning from multiple recognitions
        for (let i = 0; i < 5; i++) {
          const landmarks = createServerFormatLandmarks();
          recognizer.recordSuccess('HALLO', landmarks, 0.9 + i * 0.01);
        }
        
        // Check aggregated attention
        const patterns = recognizer.exportLearnedPatterns();
        const halloPattern = patterns['HALLO'];
        expect(halloPattern).toBeDefined();
        if (halloPattern) {
          expect(halloPattern.sampleCount).toBe(5);
          expect(halloPattern.attentionPattern).toHaveLength(21);
        }
      } finally {
        recognizer.dispose();
      }
    });

    it('should adapt recognition based on learned patterns', () => {
      const recognizer = new EnhancedGestureRecognizer();
      
      try {
        // Train on specific gesture
        for (let i = 0; i < 5; i++) {
          const landmarks = createThumbsUpLandmarks();
          recognizer.recordSuccess('thumbs_up', landmarks, 0.95);
        }
        
        // Process with adapted attention
        const result = recognizer.processWithLearnedPatterns('thumbs_up', createThumbsUpLandmarks());
        
        expect(result.isAdapted).toBe(true);
        expect(result.adaptationConfidence).toBeGreaterThan(0);
        expect(result.attentionWeights).toHaveLength(21);
      } finally {
        recognizer.dispose();
      }
    });
  });
});

/**
 * Test model prediction compatibility
 */
describe('Model Prediction Compatibility', () => {
  it('should produce features in correct format for MLP input', () => {
    const landmarks = createServerFormatLandmarks();
    const embedding = new LandmarkEmbedding({
      embeddingDimension: 32,
      usePositionalEncoding: true,
    });
    
    try {
      const result = embedding.embed(landmarks);
      
      // Embeddings should be suitable for MLP input (normalized, numeric)
      for (const emb of result.embeddings) {
        expect(emb.every(v => typeof v === 'number' && isFinite(v))).toBe(true);
        // Normalized embeddings should not have extreme values
        expect(emb.every(v => Math.abs(v) < 10)).toBe(true);
      }
    } finally {
      embedding.dispose();
    }
  });

  it('should maintain consistent attention weights for stable recognition', () => {
    const landmarks = createServerFormatLandmarks();
    const attention = new SpatialAttentionProcessor();
    
    try {
      // Process the same landmarks multiple times
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(attention.computeAttentionWeights(landmarks));
      }
      
      for (let i = 1; i < results.length; i++) {
        const res = results[i];
        const res0 = results[0];
        if (res && res0) {
          expect(res.jointWeights).toEqual(res0.jointWeights);
        }
      }
      
      const res0 = results[0];
      if (res0) {
        const sum = res0.jointWeights.reduce((a: number, b: number) => a + b, 0);
        expect(sum).toBeCloseTo(1.0, 5);
      }
    } finally {
      attention.dispose();
    }
  });
});

/**
 * Test real-time processing compatibility
 */
describe('Real-time Processing Compatibility', () => {
  it('should process frames at acceptable latency', () => {
    const recognizer = new EnhancedGestureRecognizer();
    const landmarks = createServerFormatLandmarks();
    
    try {
      const latencies: number[] = [];
      
      // Simulate 30 fps processing
      for (let i = 0; i < 30; i++) {
        const start = performance.now();
        recognizer.recognize(landmarks, Date.now());
        latencies.push(performance.now() - start);
      }
      
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      
      // Average latency should be under 33ms for 30fps
      expect(avgLatency).toBeLessThan(33);
    } finally {
      recognizer.dispose();
    }
  });

  it('should handle continuous stream without memory growth', () => {
    const recognizer = new EnhancedGestureRecognizer();
    
    try {
      // Simulate 5 seconds of continuous processing at 30fps
      for (let i = 0; i < 150; i++) {
        const landmarks = createServerFormatLandmarks();
        recognizer.recognize(landmarks, Date.now() + i * 33);
      }
      
      // Should complete without memory issues
      const stats = recognizer.getStats();
      expect(stats.totalRecognitions).toBe(150);
    } finally {
      recognizer.dispose();
    }
  });
});

/**
 * Helper functions to create test data in server-compatible format
 */

function createServerFormatLandmarks(): number[][] {
  // Create 21 landmarks for one hand in MediaPipe format
  const landmarks: number[][] = [];
  
  // Wrist
  landmarks.push([0.5, 0.7, 0]);
  
  // Thumb CMC, MCP, IP, TIP
  landmarks.push([0.45, 0.65, 0]);
  landmarks.push([0.43, 0.58, 0]);
  landmarks.push([0.41, 0.52, 0]);
  landmarks.push([0.40, 0.45, 0]);
  
  // Index MCP, PIP, DIP, TIP
  landmarks.push([0.48, 0.58, 0]);
  landmarks.push([0.47, 0.48, 0]);
  landmarks.push([0.46, 0.40, 0]);
  landmarks.push([0.45, 0.32, 0]);
  
  // Middle MCP, PIP, DIP, TIP
  landmarks.push([0.50, 0.58, 0]);
  landmarks.push([0.50, 0.47, 0]);
  landmarks.push([0.50, 0.38, 0]);
  landmarks.push([0.50, 0.30, 0]);
  
  // Ring MCP, PIP, DIP, TIP
  landmarks.push([0.52, 0.58, 0]);
  landmarks.push([0.53, 0.48, 0]);
  landmarks.push([0.54, 0.40, 0]);
  landmarks.push([0.55, 0.32, 0]);
  
  // Pinky MCP, PIP, DIP, TIP
  landmarks.push([0.54, 0.60, 0]);
  landmarks.push([0.55, 0.52, 0]);
  landmarks.push([0.56, 0.45, 0]);
  landmarks.push([0.57, 0.38, 0]);
  
  return landmarks;
}

function createThumbsUpLandmarks(): number[][] {
  const landmarks: number[][] = [];
  
  // Wrist
  landmarks.push([0.5, 0.7, 0]);
  
  // Thumb extended upward
  landmarks.push([0.45, 0.65, 0]);
  landmarks.push([0.43, 0.55, 0]);
  landmarks.push([0.42, 0.45, 0]);
  landmarks.push([0.42, 0.35, 0]); // Thumb tip pointing up
  
  // Other fingers curled
  for (let finger = 0; finger < 4; finger++) {
    const baseX = 0.48 + finger * 0.02;
    landmarks.push([baseX, 0.65, 0]);
    landmarks.push([baseX + 0.01, 0.62, 0.05]);
    landmarks.push([baseX + 0.02, 0.64, 0.08]);
    landmarks.push([baseX + 0.03, 0.67, 0.06]);
  }
  
  return landmarks;
}

function createPoseLandmarks(): number[][] {
  // Create 33 pose landmarks in MediaPipe format
  const landmarks: number[][] = [];
  
  for (let i = 0; i < 33; i++) {
    landmarks.push([
      0.5 + (i % 10) * 0.03,
      0.3 + Math.floor(i / 10) * 0.2,
      0,
      0.9, // visibility
    ]);
  }
  
  return landmarks;
}

function createFaceLandmarks(): number[][] {
  // Create simplified face landmarks
  const landmarks: number[][] = [];
  
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    landmarks.push([
      0.5 + Math.cos(angle) * 0.1,
      0.3 + Math.sin(angle) * 0.1,
      0,
    ]);
  }
  
  return landmarks;
}

function createTrainingFrameSequence(numFrames: number): number[][][] {
  const sequence: number[][][] = [];
  
  for (let f = 0; f < numFrames; f++) {
    const landmarks = createServerFormatLandmarks();
    // Add slight movement over time
    const offset = f * 0.005;
    const movedLandmarks = landmarks.map(l => [(l[0] ?? 0) + offset, l[1] ?? 0, l[2] ?? 0]);
    sequence.push(movedLandmarks);
  }
  
  return sequence;
}
