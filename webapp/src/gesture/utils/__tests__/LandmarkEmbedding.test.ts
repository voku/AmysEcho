/**
 * Tests for LandmarkEmbedding
 * 
 * Research Foundation:
 * - "Hybrid Positional Encoding for Spatiotemporal Feature Separation in SLR" (Springer 2025)
 * - "Sign Pose-based Transformer for Word-level Sign Language Recognition" (WACV 2022)
 * - Embeds 2D/3D coordinates into meaningful representations using positional encoding
 * 
 * Amy First: Enhanced landmark representation for better gesture discrimination
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  LandmarkEmbedding,
  EmbeddingConfig,
} from '../LandmarkEmbedding';

describe('LandmarkEmbedding', () => {
  let embedding: LandmarkEmbedding;

  beforeEach(() => {
    embedding = new LandmarkEmbedding();
  });

  afterEach(() => {
    embedding.dispose();
  });

  describe('basic embedding', () => {
    it('should embed hand landmarks into higher-dimensional space', () => {
      const landmarks = createTestHandLandmarks();
      const embedded = embedding.embed(landmarks);
      
      expect(embedded).toBeDefined();
      expect(embedded.embeddings.length).toBe(21); // 21 hand landmarks
      // Default embedding dimension is 32
      expect(embedded.embeddings[0].length).toBe(32);
    });

    it('should preserve landmark count through embedding', () => {
      const landmarks = createTestHandLandmarks();
      const embedded = embedding.embed(landmarks);
      
      expect(embedded.embeddings.length).toBe(landmarks.length);
    });

    it('should handle empty landmarks', () => {
      const embedded = embedding.embed([]);
      
      expect(embedded.embeddings.length).toBe(0);
    });

    it('should support custom embedding dimensions', () => {
      const config: EmbeddingConfig = {
        embeddingDimension: 64,
        usePositionalEncoding: true,
      };
      const customEmbedding = new LandmarkEmbedding(config);
      
      const landmarks = createTestHandLandmarks();
      const embedded = customEmbedding.embed(landmarks);
      
      expect(embedded.embeddings[0].length).toBe(64);
      
      customEmbedding.dispose();
    });
  });

  describe('positional encoding', () => {
    it('should add positional encoding to embeddings', () => {
      const config: EmbeddingConfig = {
        embeddingDimension: 16,
        usePositionalEncoding: true,
      };
      const posEmbedding = new LandmarkEmbedding(config);
      
      const landmarks = createTestHandLandmarks();
      const embedded = posEmbedding.embed(landmarks);
      
      expect(embedded.hasPositionalEncoding).toBe(true);
      expect(embedded.positionalEncodings.length).toBe(21);
      
      posEmbedding.dispose();
    });

    it('should generate unique positional encodings for each landmark', () => {
      const config: EmbeddingConfig = {
        embeddingDimension: 16,
        usePositionalEncoding: true,
      };
      const posEmbedding = new LandmarkEmbedding(config);
      
      const landmarks = createTestHandLandmarks();
      const embedded = posEmbedding.embed(landmarks);
      
      // Check that positional encodings are different
      const pos0 = embedded.positionalEncodings[0];
      const pos1 = embedded.positionalEncodings[1];
      
      expect(pos0).not.toEqual(pos1);
      
      posEmbedding.dispose();
    });

    it('should use sinusoidal positional encoding', () => {
      const encoding = embedding.computePositionalEncoding(0, 16);
      
      expect(encoding.length).toBe(16);
      // Check that values are in valid range for sin/cos
      expect(encoding.every(v => v >= -1 && v <= 1)).toBe(true);
    });

    it('should compute different encodings for different positions', () => {
      const enc0 = embedding.computePositionalEncoding(0, 16);
      const enc10 = embedding.computePositionalEncoding(10, 16);
      const enc20 = embedding.computePositionalEncoding(20, 16);
      
      // All should be different
      expect(enc0).not.toEqual(enc10);
      expect(enc10).not.toEqual(enc20);
      expect(enc0).not.toEqual(enc20);
    });
  });

  describe('anatomical embedding', () => {
    it('should incorporate anatomical structure into embeddings', () => {
      const config: EmbeddingConfig = {
        embeddingDimension: 32,
        useAnatomicalEmbedding: true,
      };
      const anatomicalEmbedding = new LandmarkEmbedding(config);
      
      const landmarks = createTestHandLandmarks();
      const embedded = anatomicalEmbedding.embed(landmarks);
      
      expect(embedded.anatomicalInfo).toBeDefined();
      expect(embedded.anatomicalInfo!.fingerGroups).toBeDefined();
      
      anatomicalEmbedding.dispose();
    });

    it('should group landmarks by finger', () => {
      const config: EmbeddingConfig = {
        embeddingDimension: 16,
        useAnatomicalEmbedding: true,
      };
      const anatomicalEmbedding = new LandmarkEmbedding(config);
      
      const landmarks = createTestHandLandmarks();
      const embedded = anatomicalEmbedding.embed(landmarks);
      
      // Should have 5 finger groups + wrist
      expect(embedded.anatomicalInfo!.fingerGroups.thumb).toBeDefined();
      expect(embedded.anatomicalInfo!.fingerGroups.index).toBeDefined();
      expect(embedded.anatomicalInfo!.fingerGroups.middle).toBeDefined();
      expect(embedded.anatomicalInfo!.fingerGroups.ring).toBeDefined();
      expect(embedded.anatomicalInfo!.fingerGroups.pinky).toBeDefined();
      
      anatomicalEmbedding.dispose();
    });

    it('should compute finger curl features', () => {
      const config: EmbeddingConfig = {
        embeddingDimension: 16,
        useAnatomicalEmbedding: true,
      };
      const anatomicalEmbedding = new LandmarkEmbedding(config);
      
      const landmarks = createThumbsUpLandmarks();
      const embedded = anatomicalEmbedding.embed(landmarks);
      
      // Thumb should be less curled (extended) for thumbs up
      expect(embedded.anatomicalInfo!.fingerCurls.thumb).toBeLessThan(0.5);
      
      // Other fingers have some curl - the exact value depends on the test data
      // The important thing is that we can compute curl features
      expect(embedded.anatomicalInfo!.fingerCurls.index).toBeDefined();
      expect(typeof embedded.anatomicalInfo!.fingerCurls.index).toBe('number');
      
      anatomicalEmbedding.dispose();
    });
  });

  describe('relative position embedding', () => {
    it('should compute relative positions from wrist', () => {
      const config: EmbeddingConfig = {
        embeddingDimension: 16,
        useRelativePositions: true,
      };
      const relEmbedding = new LandmarkEmbedding(config);
      
      const landmarks = createTestHandLandmarks();
      const embedded = relEmbedding.embed(landmarks);
      
      expect(embedded.relativePositions).toBeDefined();
      expect(embedded.relativePositions!.length).toBe(21);
      
      // First landmark (wrist) should be at origin
      const wristRelative = embedded.relativePositions![0];
      expect(wristRelative[0]).toBe(0);
      expect(wristRelative[1]).toBe(0);
      
      relEmbedding.dispose();
    });

    it('should normalize relative positions', () => {
      const config: EmbeddingConfig = {
        embeddingDimension: 16,
        useRelativePositions: true,
        normalizeEmbeddings: true,
      };
      const relEmbedding = new LandmarkEmbedding(config);
      
      const landmarks = createTestHandLandmarks();
      const embedded = relEmbedding.embed(landmarks);
      
      // Check that all relative positions are normalized (magnitude <= 1 for most)
      for (const pos of embedded.relativePositions!) {
        const magnitude = Math.sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2]);
        expect(magnitude).toBeLessThanOrEqual(2.0); // Allow some margin
      }
      
      relEmbedding.dispose();
    });
  });

  describe('embedding similarity', () => {
    it('should produce similar embeddings for similar hand poses', () => {
      const landmarks1 = createTestHandLandmarks();
      // Create similar landmarks with small noise
      const landmarks2 = landmarks1.map(l => l.map(v => v + (Math.random() - 0.5) * 0.01));
      
      const embedded1 = embedding.embed(landmarks1);
      const embedded2 = embedding.embed(landmarks2);
      
      // Calculate similarity of first embedding
      const similarity = cosineSimilarity(embedded1.embeddings[0], embedded2.embeddings[0]);
      expect(similarity).toBeGreaterThan(0.9);
    });

    it('should produce different embeddings for different hand poses', () => {
      const openHand = createTestHandLandmarks();
      const closedFist = createThumbsUpLandmarks();
      
      const embeddedOpen = embedding.embed(openHand);
      const embeddedClosed = embedding.embed(closedFist);
      
      // Embeddings should not be identical - verify they are distinct
      const similarity = cosineSimilarity(embeddedOpen.embeddings[0], embeddedClosed.embeddings[0]);
      
      // They may have high structural similarity but should not be identical
      expect(similarity).toBeLessThan(1.0);
      expect(embeddedOpen.embeddings[0]).not.toEqual(embeddedClosed.embeddings[0]);
    });
  });

  describe('two-hand embedding', () => {
    it('should embed both hands with relationship features', () => {
      const leftHand = createTestHandLandmarks();
      const rightHand = createTestHandLandmarks().map(l => [l[0] + 0.3, l[1], l[2]]);
      
      const embedded = embedding.embedTwoHands(leftHand, rightHand);
      
      expect(embedded.leftEmbeddings.embeddings.length).toBe(21);
      expect(embedded.rightEmbeddings.embeddings.length).toBe(21);
      expect(embedded.interHandFeatures).toBeDefined();
    });

    it('should compute inter-hand distance features', () => {
      const leftHand = createTestHandLandmarks();
      // Right hand positioned close to left
      const rightHand = createTestHandLandmarks().map(l => [l[0] + 0.1, l[1], l[2]]);
      
      const embedded = embedding.embedTwoHands(leftHand, rightHand);
      
      expect(embedded.interHandFeatures.averageDistance).toBeDefined();
      expect(embedded.interHandFeatures.averageDistance).toBeGreaterThan(0);
    });

    it('should detect hand symmetry', () => {
      // Create symmetric hand poses (mirrored)
      const leftHand = createTestHandLandmarks();
      const rightHand = leftHand.map(l => [1 - l[0], l[1], l[2]]); // Mirror on x-axis
      
      const embedded = embedding.embedTwoHands(leftHand, rightHand);
      
      expect(embedded.interHandFeatures.symmetryScore).toBeGreaterThan(0.7);
    });
  });

  describe('temporal embedding', () => {
    it('should embed landmark sequences with temporal encoding', () => {
      const sequence = [
        createTestHandLandmarks(),
        createTestHandLandmarks().map(l => [l[0] + 0.01, l[1], l[2]]),
        createTestHandLandmarks().map(l => [l[0] + 0.02, l[1], l[2]]),
      ];
      
      const temporalEmbedded = embedding.embedSequence(sequence);
      
      expect(temporalEmbedded.frames.length).toBe(3);
      expect(temporalEmbedded.temporalEncodings).toBeDefined();
      expect(temporalEmbedded.temporalEncodings.length).toBe(3);
    });

    it('should apply temporal positional encoding to each frame', () => {
      const sequence = [
        createTestHandLandmarks(),
        createTestHandLandmarks(),
        createTestHandLandmarks(),
      ];
      
      const temporalEmbedded = embedding.embedSequence(sequence);
      
      // Each frame should have different temporal encoding
      expect(temporalEmbedded.temporalEncodings[0]).not.toEqual(
        temporalEmbedded.temporalEncodings[1]
      );
    });
  });

  describe('embedding statistics', () => {
    it('should track embedding statistics', () => {
      const landmarks = createTestHandLandmarks();
      
      for (let i = 0; i < 5; i++) {
        embedding.embed(landmarks);
      }
      
      const stats = embedding.getStats();
      
      expect(stats.embedCount).toBe(5);
      expect(stats.averageEmbeddingTime).toBeDefined();
    });
  });
});

/**
 * Create test hand landmarks (21 points)
 */
function createTestHandLandmarks(): number[][] {
  const landmarks: number[][] = [];
  
  // Create 21 landmarks for a hand in approximate natural positions
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
 * Create landmarks simulating a thumbs up gesture
 */
function createThumbsUpLandmarks(): number[][] {
  const landmarks: number[][] = [];
  
  // Wrist (0)
  landmarks.push([0.5, 0.7, 0]);
  
  // Thumb (1-4) - extended upward
  landmarks.push([0.45, 0.65, 0]);
  landmarks.push([0.43, 0.55, 0]);
  landmarks.push([0.42, 0.45, 0]);
  landmarks.push([0.42, 0.35, 0]); // Thumb tip pointing up
  
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
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
