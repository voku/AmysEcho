/**
 * Landmark Embedding - Amy First
 *
 * Research Foundation:
 * - "Hybrid Positional Encoding for Spatiotemporal Feature Separation in SLR" (Springer 2025)
 *   Dual-branch positional encoding for spatial and temporal features
 * - "Sign Pose-based Transformer for Word-level Sign Language Recognition" (WACV 2022)
 *   Pose normalization and embedding for sign recognition
 * - "Cross-lingual few-shot sign language recognition" (Pattern Recognition 2024)
 *   Multi-modal landmark embeddings for transfer learning
 *
 * Amy Impact:
 * - Enhanced feature representation for better gesture discrimination
 * - Captures anatomical relationships (finger curl, spread, etc.)
 * - Enables transfer learning across different signing styles
 */

import { MemoryOptimizer } from './MemoryOptimizer';

/**
 * Configuration for landmark embedding
 */
export interface EmbeddingConfig {
  /** Output embedding dimension (default: 32) */
  embeddingDimension: number;
  /** Whether to add positional encoding */
  usePositionalEncoding?: boolean;
  /** Whether to include anatomical structure in embedding */
  useAnatomicalEmbedding?: boolean;
  /** Whether to compute relative positions from wrist */
  useRelativePositions?: boolean;
  /** Whether to normalize embeddings */
  normalizeEmbeddings?: boolean;
}

/**
 * Positional encoding for landmarks
 */
export interface PositionalEncoding {
  /** Encoded position values */
  encoding: number[];
  /** Position index */
  position: number;
}

/**
 * Anatomical information derived from landmarks
 */
export interface AnatomicalInfo {
  /** Landmarks grouped by finger */
  fingerGroups: {
    thumb: number[];
    index: number[];
    middle: number[];
    ring: number[];
    pinky: number[];
    wrist: number[];
  };
  /** Finger curl values (0 = extended, 1 = fully curled) */
  fingerCurls: {
    thumb: number;
    index: number;
    middle: number;
    ring: number;
    pinky: number;
  };
  /** Finger spread angles */
  fingerSpreads: number[];
}

/**
 * Embedded landmarks with metadata
 */
export interface EmbeddedLandmarks {
  /** Per-landmark embeddings */
  embeddings: number[][];
  /** Positional encodings if enabled */
  positionalEncodings: number[][];
  /** Whether positional encoding was applied */
  hasPositionalEncoding: boolean;
  /** Anatomical information if enabled */
  anatomicalInfo?: AnatomicalInfo;
  /** Relative positions from wrist if enabled */
  relativePositions?: number[][];
}

/**
 * Two-hand embedded landmarks
 */
export interface TwoHandEmbeddings {
  /** Left hand embeddings */
  leftEmbeddings: EmbeddedLandmarks;
  /** Right hand embeddings */
  rightEmbeddings: EmbeddedLandmarks;
  /** Inter-hand relationship features */
  interHandFeatures: {
    averageDistance: number;
    minDistance: number;
    symmetryScore: number;
    touchingPairs: Array<{ left: number; right: number }>;
  };
}

/**
 * Temporal sequence embeddings
 */
export interface SequenceEmbeddings {
  /** Per-frame embeddings */
  frames: EmbeddedLandmarks[];
  /** Temporal positional encodings */
  temporalEncodings: number[][];
}

/**
 * Embedding statistics
 */
export interface EmbeddingStats {
  /** Number of embeddings computed */
  embedCount: number;
  /** Average embedding time in ms */
  averageEmbeddingTime: number;
}

// Hand landmark indices
const WRIST = 0;
const THUMB_INDICES = [1, 2, 3, 4];
const INDEX_INDICES = [5, 6, 7, 8];
const MIDDLE_INDICES = [9, 10, 11, 12];
const RING_INDICES = [13, 14, 15, 16];
const PINKY_INDICES = [17, 18, 19, 20];
const _FINGERTIP_INDICES = [4, 8, 12, 16, 20];
const _NUM_HAND_LANDMARKS = 21;

// Default configuration
const DEFAULT_CONFIG: EmbeddingConfig = {
  embeddingDimension: 32,
  usePositionalEncoding: true,
  useAnatomicalEmbedding: false,
  useRelativePositions: false,
  normalizeEmbeddings: true,
};

/**
 * Landmark Embedding for enhanced feature representation
 */
export class LandmarkEmbedding {
  private config: EmbeddingConfig;
  private memoryOptimizer: MemoryOptimizer;
  
  // Statistics tracking
  private embedCount = 0;
  private totalEmbedTime = 0;
  
  // Cached positional encodings for efficiency
  private posEncodingCache: Map<string, number[]> = new Map();

  constructor(config?: Partial<EmbeddingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memoryOptimizer = MemoryOptimizer.getInstance();
    
    this.memoryOptimizer.registerCleanupCallback('landmarkEmbedding', () => this.cleanup());
  }

  /**
   * Embed hand landmarks into higher-dimensional space
   */
  embed(landmarks: number[][]): EmbeddedLandmarks {
    const startTime = performance.now();
    
    if (landmarks.length === 0) {
      return {
        embeddings: [],
        positionalEncodings: [],
        hasPositionalEncoding: false,
      };
    }

    // Compute relative positions from wrist if enabled
    let relativePositions: number[][] | undefined;
    if (this.config.useRelativePositions) {
      relativePositions = this.computeRelativePositions(landmarks);
    }

    // Compute base embeddings
    const embeddings = this.computeBaseEmbeddings(
      this.config.useRelativePositions && relativePositions ? relativePositions : landmarks
    );

    // Add positional encoding if enabled
    let positionalEncodings: number[][] = [];
    if (this.config.usePositionalEncoding) {
      positionalEncodings = landmarks.map((_, i) => 
        this.computePositionalEncoding(i, this.config.embeddingDimension)
      );
      
      // Add positional encoding to embeddings
      for (let i = 0; i < embeddings.length; i++) {
        for (let j = 0; j < embeddings[i].length; j++) {
          embeddings[i][j] += positionalEncodings[i]?.[j] ?? 0;
        }
      }
    }

    // Compute anatomical information if enabled
    let anatomicalInfo: AnatomicalInfo | undefined;
    if (this.config.useAnatomicalEmbedding) {
      anatomicalInfo = this.computeAnatomicalInfo(landmarks);
    }

    // Normalize embeddings if enabled
    if (this.config.normalizeEmbeddings) {
      for (let i = 0; i < embeddings.length; i++) {
        embeddings[i] = this.normalizeVector(embeddings[i]);
      }
    }

    // Track statistics
    this.embedCount++;
    this.totalEmbedTime += performance.now() - startTime;

    return {
      embeddings,
      positionalEncodings,
      hasPositionalEncoding: this.config.usePositionalEncoding ?? false,
      anatomicalInfo,
      relativePositions,
    };
  }

  /**
   * Compute base embeddings from landmark coordinates
   * Uses linear projection to embedding dimension
   */
  private computeBaseEmbeddings(landmarks: number[][]): number[][] {
    const dim = this.config.embeddingDimension;
    const embeddings: number[][] = [];

    for (const point of landmarks) {
      if (!point || point.length === 0) {
        embeddings.push(new Array(dim).fill(0));
        continue;
      }

      const embedding: number[] = [];
      const x = point[0] ?? 0;
      const y = point[1] ?? 0;
      const z = point[2] ?? 0;

      // Create embedding through non-linear projection
      for (let i = 0; i < dim; i++) {
        // Use different frequencies for each dimension
        const freq = (i + 1) / dim;
        let value = 0;

        // Mix x, y, z with different weights for each dimension
        const phase = (i * Math.PI) / dim;
        value += Math.sin(x * Math.PI * freq * 2 + phase) * 0.4;
        value += Math.cos(y * Math.PI * freq * 2 + phase) * 0.4;
        value += Math.sin(z * Math.PI * freq * 4 + phase) * 0.2;

        // Add direct coordinate contribution
        value += (x - 0.5) * Math.cos(i * 0.5) * 0.3;
        value += (y - 0.5) * Math.sin(i * 0.5) * 0.3;
        value += z * Math.cos(i * 0.3) * 0.1;

        embedding.push(value);
      }

      embeddings.push(embedding);
    }

    return embeddings;
  }

  /**
   * Compute sinusoidal positional encoding
   * Based on "Attention Is All You Need" (Vaswani et al.)
   */
  computePositionalEncoding(position: number, dimension: number): number[] {
    const cacheKey = `${position}_${dimension}`;
    
    if (this.posEncodingCache.has(cacheKey)) {
      return [...this.posEncodingCache.get(cacheKey)!];
    }

    const encoding: number[] = [];
    
    for (let i = 0; i < dimension; i++) {
      const freq = 1 / Math.pow(10000, (2 * Math.floor(i / 2)) / dimension);
      
      if (i % 2 === 0) {
        encoding.push(Math.sin(position * freq));
      } else {
        encoding.push(Math.cos(position * freq));
      }
    }

    // Cache for reuse
    if (this.posEncodingCache.size < 100) {
      this.posEncodingCache.set(cacheKey, [...encoding]);
    }

    return encoding;
  }

  /**
   * Compute relative positions from wrist
   */
  private computeRelativePositions(landmarks: number[][]): number[][] {
    if (landmarks.length === 0) return [];

    const wrist = landmarks[WRIST];
    if (!wrist) return landmarks;

    const wx = wrist[0] ?? 0;
    const wy = wrist[1] ?? 0;
    const wz = wrist[2] ?? 0;

    // Calculate hand scale for normalization
    const maxDist = this.computeMaxDistance(landmarks, [wx, wy, wz]);
    const scale = maxDist > 0 ? maxDist : 1;

    return landmarks.map((point, idx) => {
      if (idx === WRIST) {
        return [0, 0, 0];
      }
      
      const x = ((point[0] ?? 0) - wx) / scale;
      const y = ((point[1] ?? 0) - wy) / scale;
      const z = ((point[2] ?? 0) - wz) / scale;
      
      return [x, y, z];
    });
  }

  /**
   * Compute maximum distance from a reference point
   */
  private computeMaxDistance(landmarks: number[][], reference: number[]): number {
    let maxDist = 0;

    for (const point of landmarks) {
      if (!point || point.length < 2) continue;
      
      const dx = (point[0] ?? 0) - reference[0];
      const dy = (point[1] ?? 0) - reference[1];
      const dz = (point[2] ?? 0) - reference[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      maxDist = Math.max(maxDist, dist);
    }

    return maxDist;
  }

  /**
   * Compute anatomical information from landmarks
   */
  private computeAnatomicalInfo(landmarks: number[][]): AnatomicalInfo {
    // Group landmarks by finger
    const fingerGroups = {
      wrist: [WRIST],
      thumb: THUMB_INDICES,
      index: INDEX_INDICES,
      middle: MIDDLE_INDICES,
      ring: RING_INDICES,
      pinky: PINKY_INDICES,
    };

    // Compute finger curls
    const fingerCurls = {
      thumb: this.computeFingerCurl(landmarks, THUMB_INDICES),
      index: this.computeFingerCurl(landmarks, INDEX_INDICES),
      middle: this.computeFingerCurl(landmarks, MIDDLE_INDICES),
      ring: this.computeFingerCurl(landmarks, RING_INDICES),
      pinky: this.computeFingerCurl(landmarks, PINKY_INDICES),
    };

    // Compute finger spreads
    const fingerSpreads = this.computeFingerSpreads(landmarks);

    return {
      fingerGroups,
      fingerCurls,
      fingerSpreads,
    };
  }

  /**
   * Compute finger curl value (0 = extended, 1 = fully curled)
   */
  private computeFingerCurl(landmarks: number[][], fingerIndices: number[]): number {
    if (fingerIndices.length < 2) return 0;

    const wrist = landmarks[WRIST];
    const base = landmarks[fingerIndices[0]]; // MCP joint
    const tip = landmarks[fingerIndices[fingerIndices.length - 1]]; // Fingertip

    if (!wrist || !base || !tip) return 0;

    // Distance from wrist to base
    const wristToBase = this.distance(wrist, base);
    // Distance from wrist to tip
    const wristToTip = this.distance(wrist, tip);
    // Extended finger: tip is far from wrist
    // Curled finger: tip is close to wrist (closer than base)

    if (wristToBase === 0) return 0;

    // Normalize: when tip is at base, curl = 1; when tip is far, curl = 0
    const curl = 1 - Math.min(1, wristToTip / (wristToBase * 2));
    return Math.max(0, Math.min(1, curl));
  }

  /**
   * Compute finger spread angles
   * Uses full 3D vectors for accurate angle calculation with depth
   */
  private computeFingerSpreads(landmarks: number[][]): number[] {
    const spreads: number[] = [];
    const mcpIndices = [5, 9, 13, 17]; // Index, Middle, Ring, Pinky MCPs

    for (let i = 0; i < mcpIndices.length - 1; i++) {
      const mcp1 = landmarks[mcpIndices[i]];
      const mcp2 = landmarks[mcpIndices[i + 1]];
      const wrist = landmarks[WRIST];

      if (!mcp1 || !mcp2 || !wrist) {
        spreads.push(0);
        continue;
      }

      // Vector from wrist to each MCP (using all 3 dimensions for 3D accuracy)
      const v1 = [
        (mcp1[0] ?? 0) - (wrist[0] ?? 0),
        (mcp1[1] ?? 0) - (wrist[1] ?? 0),
        (mcp1[2] ?? 0) - (wrist[2] ?? 0),
      ];
      const v2 = [
        (mcp2[0] ?? 0) - (wrist[0] ?? 0),
        (mcp2[1] ?? 0) - (wrist[1] ?? 0),
        (mcp2[2] ?? 0) - (wrist[2] ?? 0),
      ];

      // Angle between 3D vectors
      const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
      const mag1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2]);
      const mag2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1] + v2[2] * v2[2]);

      if (mag1 > 0 && mag2 > 0) {
        const angle = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))));
        spreads.push(angle);
      } else {
        spreads.push(0);
      }
    }

    return spreads;
  }

  /**
   * Euclidean distance between two points
   */
  private distance(a: number[], b: number[]): number {
    const dx = (a[0] ?? 0) - (b[0] ?? 0);
    const dy = (a[1] ?? 0) - (b[1] ?? 0);
    const dz = (a[2] ?? 0) - (b[2] ?? 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Normalize a vector to unit length
   */
  private normalizeVector(v: number[]): number[] {
    const magnitude = Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) return v;
    return v.map(val => val / magnitude);
  }

  /**
   * Embed two hands with inter-hand relationship features
   */
  embedTwoHands(leftHand: number[][], rightHand: number[][]): TwoHandEmbeddings {
    const leftEmbeddings = this.embed(leftHand);
    const rightEmbeddings = this.embed(rightHand);

    // Compute inter-hand features
    const interHandFeatures = this.computeInterHandFeatures(leftHand, rightHand);

    return {
      leftEmbeddings,
      rightEmbeddings,
      interHandFeatures,
    };
  }

  /**
   * Compute inter-hand relationship features
   */
  private computeInterHandFeatures(leftHand: number[][], rightHand: number[][]) {
    let totalDist = 0;
    let minDist = Infinity;
    const touchingPairs: Array<{ left: number; right: number }> = [];
    const touchThreshold = 0.1;

    // Compute pairwise distances
    for (let i = 0; i < leftHand.length; i++) {
      for (let j = 0; j < rightHand.length; j++) {
        const left = leftHand[i];
        const right = rightHand[j];
        
        if (!left || !right) continue;
        
        const dist = this.distance(left, right);
        totalDist += dist;
        minDist = Math.min(minDist, dist);

        if (dist < touchThreshold) {
          touchingPairs.push({ left: i, right: j });
        }
      }
    }

    const pairCount = leftHand.length * rightHand.length;
    const averageDistance = pairCount > 0 ? totalDist / pairCount : 0;

    // Compute symmetry score
    const symmetryScore = this.computeHandSymmetry(leftHand, rightHand);

    return {
      averageDistance,
      minDistance: minDist === Infinity ? 0 : minDist,
      symmetryScore,
      touchingPairs,
    };
  }

  /**
   * Compute symmetry between hands (0 = different, 1 = identical mirrored)
   */
  private computeHandSymmetry(leftHand: number[][], rightHand: number[][]): number {
    if (leftHand.length === 0 || rightHand.length === 0) return 0;

    let totalDiff = 0;
    let count = 0;

    for (let i = 0; i < Math.min(leftHand.length, rightHand.length); i++) {
      const left = leftHand[i];
      const right = rightHand[i];

      if (!left || !right || left.length < 2 || right.length < 2) continue;

      // Mirror right hand X coordinate
      const mirroredRight = [1 - (right[0] ?? 0), right[1] ?? 0, right[2] ?? 0];
      
      const dx = (left[0] ?? 0) - mirroredRight[0];
      const dy = (left[1] ?? 0) - mirroredRight[1];
      const dz = (left[2] ?? 0) - mirroredRight[2];
      
      totalDiff += Math.sqrt(dx * dx + dy * dy + dz * dz);
      count++;
    }

    if (count === 0) return 0;

    const avgDiff = totalDiff / count;
    // Convert difference to symmetry score
    return Math.max(0, 1 - avgDiff * 3);
  }

  /**
   * Embed a sequence of landmarks with temporal encoding
   */
  embedSequence(sequence: number[][][]): SequenceEmbeddings {
    const frames: EmbeddedLandmarks[] = [];
    const temporalEncodings: number[][] = [];

    for (let t = 0; t < sequence.length; t++) {
      const frame = sequence[t];
      const embedded = this.embed(frame);
      frames.push(embedded);

      // Compute temporal positional encoding
      const temporalEncoding = this.computePositionalEncoding(t, this.config.embeddingDimension);
      temporalEncodings.push(temporalEncoding);
    }

    return {
      frames,
      temporalEncodings,
    };
  }

  /**
   * Get embedding statistics
   */
  getStats(): EmbeddingStats {
    return {
      embedCount: this.embedCount,
      averageEmbeddingTime: this.embedCount > 0 ? this.totalEmbedTime / this.embedCount : 0,
    };
  }

  /**
   * Cleanup for memory optimization
   */
  private cleanup(): void {
    // Clear cache under memory pressure
    if (this.posEncodingCache.size > 50) {
      this.posEncodingCache.clear();
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.memoryOptimizer.unregisterCleanupCallback('landmarkEmbedding');
    this.posEncodingCache.clear();
    this.embedCount = 0;
    this.totalEmbedTime = 0;
  }
}
