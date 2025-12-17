/**
 * Spatial Attention Processor - Amy First
 *
 * Research Foundation:
 * - "Sequential Spatio-Temporal Attention Networks (SSTAN)" (2024)
 *   Multi-head spatial attention for capturing intra-frame joint relationships
 * - "Sign Pose-based Transformer for Word-level Sign Language Recognition" (WACV 2022)
 *   Spatial attention on pose landmarks for sign recognition
 * - "Spatial-temporal attention with graph and general neural networks" (Springer 2024)
 *   Combines skeleton-based and attention mechanisms for SLR
 *
 * Amy Impact:
 * - Better recognition by focusing on the most important hand landmarks
 * - Adapts to Amy's unique signing style through learned attention patterns
 * - Enhanced two-hand gesture recognition through cross-hand attention
 */

import { MemoryOptimizer } from './MemoryOptimizer';

// Named constants for attention algorithm parameters
/** Minimum samples required before using learned pattern for adaptation */
const MIN_SAMPLES_FOR_ADAPTATION = 3;
/** Number of samples for full adaptation strength (pattern.sampleCount / this value) */
const FULL_ADAPTATION_SAMPLE_COUNT = 10;
/** Proximity threshold for hand interaction detection (10% of normalized space) */
const HAND_INTERACTION_PROXIMITY_THRESHOLD = 0.1;
/** Multiplier for converting average difference to symmetry score */
const SYMMETRY_DIFFERENCE_MULTIPLIER = 3;

/**
 * Configuration for spatial attention processor
 */
export interface SpatialAttentionConfig {
  /** Number of attention heads (default: 1) */
  numHeads: number;
  /** Key dimension for attention computation */
  keyDimension: number;
  /** Value dimension for attention output */
  valueDimension: number;
  /** Temperature for softmax (higher = more uniform attention) */
  temperature?: number;
  /** Learning rate for pattern adaptation */
  learningRate?: number;
}

/**
 * Computed attention weights for landmarks
 */
export interface AttentionWeights {
  /** Per-joint attention weights (normalized to sum to 1) */
  jointWeights: number[];
  /** Inter-joint attention scores for relationship modeling */
  interJointAttention: number[];
  /** Multi-head outputs (only populated when numHeads > 1) */
  headOutputs: number[][];
  /** Attention entropy (0 = concentrated, log2(N) = uniform) */
  entropy: number;
}

/**
 * Attention weights with adaptation information
 */
export interface AdaptedAttentionWeights extends AttentionWeights {
  /** Whether attention was adapted based on learned patterns */
  isAdapted: boolean;
  /** Confidence in the adaptation (0-1) */
  adaptationConfidence: number;
}

/**
 * Cross-hand attention for two-handed gestures
 */
export interface CrossHandAttention {
  /** Symmetry score between hands (0 = different, 1 = identical) */
  symmetryScore: number;
  /** Points where hands might be interacting */
  interactionPoints: Array<{ leftIdx: number; rightIdx: number; distance: number }>;
  /** Combined attention weights for both hands */
  combinedWeights: number[];
}

/**
 * Temporal attention weights
 */
export interface TemporalAttentionWeights {
  /** Movement-based attention (higher for moving landmarks) */
  movementAttention: number[];
  /** Time since last significant movement per landmark */
  movementRecency: number[];
}

/**
 * Learned gesture pattern for attention adaptation
 */
export interface GestureAttentionPattern {
  /** Importance of each joint for this gesture */
  jointImportance: number[];
  /** Number of samples used to learn this pattern */
  sampleCount: number;
  /** Last update timestamp */
  lastUpdate: number;
}

/**
 * Attention statistics for diagnostics
 */
export interface AttentionStats {
  /** Number of attention computations performed */
  computationCount: number;
  /** Average entropy across computations */
  averageEntropy: number;
  /** Most frequently attended joint */
  peakAttentionJoint: number;
}

// Hand landmark indices
const WRIST = 0;
const THUMB_CMC = 1;
const THUMB_MCP = 2;
const THUMB_IP = 3;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_PIP = 6;
const INDEX_DIP = 7;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_PIP = 10;
const MIDDLE_DIP = 11;
const MIDDLE_TIP = 12;
const RING_MCP = 13;
const RING_PIP = 14;
const RING_DIP = 15;
const RING_TIP = 16;
const PINKY_MCP = 17;
const PINKY_PIP = 18;
const PINKY_DIP = 19;
const PINKY_TIP = 20;

const FINGERTIP_INDICES = [THUMB_TIP, INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP];
const MCP_INDICES = [THUMB_MCP, INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP];
const NUM_HAND_LANDMARKS = 21;

// Default configuration
const DEFAULT_CONFIG: SpatialAttentionConfig = {
  numHeads: 1,
  keyDimension: 8,
  valueDimension: 8,
  temperature: 1.0,
  learningRate: 0.1,
};

/**
 * Spatial Attention Processor for enhanced gesture recognition
 */
export class SpatialAttentionProcessor {
  private config: SpatialAttentionConfig;
  private memoryOptimizer: MemoryOptimizer;
  
  // Learned patterns for gesture-specific attention
  private learnedPatterns: Map<string, GestureAttentionPattern> = new Map();
  
  // Temporal state for movement attention
  private previousLandmarks: number[][] | null = null;
  private previousTimestamp: number = 0;
  private movementHistory: number[][] = [];
  
  // Statistics tracking
  private computationCount = 0;
  private entropySum = 0;
  private jointAttentionCounts: number[] = new Array(NUM_HAND_LANDMARKS).fill(0);

  constructor(config?: Partial<SpatialAttentionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memoryOptimizer = MemoryOptimizer.getInstance();
    
    // Register for memory cleanup
    this.memoryOptimizer.registerCleanupCallback('spatialAttentionProcessor', () => this.cleanup());
  }

  /**
   * Compute attention weights for hand landmarks
   * Based on spatial relationships and learned importance
   */
  computeAttentionWeights(landmarks: number[][]): AttentionWeights {
    if (landmarks.length === 0) {
      return {
        jointWeights: [],
        interJointAttention: [],
        headOutputs: [],
        entropy: 0,
      };
    }

    // Initialize base attention weights
    let jointWeights = this.computeBaseAttention(landmarks);
    
    // Apply spatial relationship weighting
    jointWeights = this.applySpatialRelationships(jointWeights, landmarks);
    
    // Normalize to sum to 1
    jointWeights = this.normalizeWeights(jointWeights);
    
    // Compute inter-joint attention
    const interJointAttention = this.computeInterJointAttention(landmarks);
    
    // Compute multi-head outputs if configured
    const headOutputs = this.computeMultiHeadOutputs(landmarks);
    
    // Calculate entropy
    const entropy = this.calculateEntropy(jointWeights);
    
    // Update statistics
    this.updateStats(jointWeights, entropy);
    
    return {
      jointWeights,
      interJointAttention,
      headOutputs,
      entropy,
    };
  }

  /**
   * Compute base attention weights based on landmark positions and importance
   */
  private computeBaseAttention(landmarks: number[][]): number[] {
    const weights: number[] = new Array(landmarks.length).fill(0);
    const temperature = this.config.temperature ?? 1.0;
    
    for (let i = 0; i < landmarks.length; i++) {
      // Base weight from landmark type importance
      let baseWeight = this.getLandmarkImportance(i);
      
      // Spatial importance based on position variance
      const point = landmarks[i];
      if (point && point.length >= 2) {
        // Distance from center adds slight weight (landmarks at extremes are often important)
        const distFromCenter = Math.sqrt(
          Math.pow((point[0] ?? 0) - 0.5, 2) + 
          Math.pow((point[1] ?? 0) - 0.5, 2)
        );
        baseWeight += distFromCenter * 0.2;
      }
      
      weights[i] = Math.exp(baseWeight / temperature);
    }
    
    return weights;
  }

  /**
   * Get base importance for a landmark based on its anatomical role
   */
  private getLandmarkImportance(index: number): number {
    // Fingertips are most important for gesture discrimination
    if (FINGERTIP_INDICES.includes(index)) {
      return 1.0;
    }
    
    // DIP and PIP joints are moderately important (finger curl indicators)
    if ([INDEX_DIP, INDEX_PIP, MIDDLE_DIP, MIDDLE_PIP, RING_DIP, RING_PIP, PINKY_DIP, PINKY_PIP, THUMB_IP].includes(index)) {
      return 0.7;
    }
    
    // MCP joints (knuckles) are important for finger spread
    if (MCP_INDICES.includes(index)) {
      return 0.6;
    }
    
    // Wrist and thumb base are less discriminative for most gestures
    return 0.4;
  }

  /**
   * Apply spatial relationship weighting based on inter-landmark distances
   */
  private applySpatialRelationships(weights: number[], landmarks: number[][]): number[] {
    const enhanced = [...weights];
    
    // Enhance weights for landmarks that are in unusual positions relative to neighbors
    for (let i = 0; i < landmarks.length; i++) {
      const point = landmarks[i];
      if (!point || point.length < 2) continue;
      
      // Find neighboring landmarks
      const neighbors = this.getNeighborIndices(i);
      if (neighbors.length === 0) continue;
      
      // Calculate average distance to neighbors
      let totalDist = 0;
      let validNeighbors = 0;
      
      for (const neighborIdx of neighbors) {
        const neighbor = landmarks[neighborIdx];
        if (!neighbor || neighbor.length < 2) continue;
        
        const dist = this.euclideanDistance(point, neighbor);
        totalDist += dist;
        validNeighbors++;
      }
      
      if (validNeighbors > 0) {
        const avgDist = totalDist / validNeighbors;
        // Landmarks with larger distances from neighbors may be more distinctive
        // Apply gentle boost for positions that deviate from typical hand structure
        enhanced[i] *= (1 + avgDist * 0.5);
      }
    }
    
    return enhanced;
  }

  /**
   * Get anatomically connected neighbor indices for a landmark
   */
  private getNeighborIndices(index: number): number[] {
    const connections: Record<number, number[]> = {
      [WRIST]: [THUMB_CMC, INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP],
      [THUMB_CMC]: [WRIST, THUMB_MCP],
      [THUMB_MCP]: [THUMB_CMC, THUMB_IP],
      [THUMB_IP]: [THUMB_MCP, THUMB_TIP],
      [THUMB_TIP]: [THUMB_IP],
      [INDEX_MCP]: [WRIST, INDEX_PIP],
      [INDEX_PIP]: [INDEX_MCP, INDEX_DIP],
      [INDEX_DIP]: [INDEX_PIP, INDEX_TIP],
      [INDEX_TIP]: [INDEX_DIP],
      [MIDDLE_MCP]: [WRIST, MIDDLE_PIP],
      [MIDDLE_PIP]: [MIDDLE_MCP, MIDDLE_DIP],
      [MIDDLE_DIP]: [MIDDLE_PIP, MIDDLE_TIP],
      [MIDDLE_TIP]: [MIDDLE_DIP],
      [RING_MCP]: [WRIST, RING_PIP],
      [RING_PIP]: [RING_MCP, RING_DIP],
      [RING_DIP]: [RING_PIP, RING_TIP],
      [RING_TIP]: [RING_DIP],
      [PINKY_MCP]: [WRIST, PINKY_PIP],
      [PINKY_PIP]: [PINKY_MCP, PINKY_DIP],
      [PINKY_DIP]: [PINKY_PIP, PINKY_TIP],
      [PINKY_TIP]: [PINKY_DIP],
    };
    
    return connections[index] ?? [];
  }

  /**
   * Compute inter-joint attention scores
   * Captures relationships between different landmarks
   */
  private computeInterJointAttention(landmarks: number[][]): number[] {
    const n = landmarks.length;
    if (n < 2) return [];
    
    // Compute pairwise attention scores for key landmark pairs
    const scores: number[] = [];
    
    // Focus on fingertip-to-fingertip relationships (important for many signs)
    for (let i = 0; i < FINGERTIP_INDICES.length; i++) {
      for (let j = i + 1; j < FINGERTIP_INDICES.length; j++) {
        const idx1 = FINGERTIP_INDICES[i];
        const idx2 = FINGERTIP_INDICES[j];
        const p1 = landmarks[idx1];
        const p2 = landmarks[idx2];
        
        if (p1 && p2 && p1.length >= 2 && p2.length >= 2) {
          const dist = this.euclideanDistance(p1, p2);
          // Closer fingertips indicate potential gesture features (pinching, touching)
          const score = Math.exp(-dist * 5);
          scores.push(score);
        }
      }
    }
    
    // Fingertip-to-wrist relationships (finger extension/flexion)
    for (const tipIdx of FINGERTIP_INDICES) {
      const tip = landmarks[tipIdx];
      const wrist = landmarks[WRIST];
      
      if (tip && wrist && tip.length >= 2 && wrist.length >= 2) {
        const dist = this.euclideanDistance(tip, wrist);
        // Normalized by typical hand length
        scores.push(Math.min(1, dist * 2));
      }
    }
    
    return scores;
  }

  /**
   * Compute multi-head attention outputs
   */
  private computeMultiHeadOutputs(landmarks: number[][]): number[][] {
    if (this.config.numHeads <= 1) return [];
    
    const outputs: number[][] = [];
    const n = landmarks.length;
    
    for (let head = 0; head < this.config.numHeads; head++) {
      // Each head focuses on different aspects
      const headWeights = new Array(n).fill(0);
      
      // Use different temperature for each head to create diversity
      const headTemp = (this.config.temperature ?? 1.0) * (1 + head * 0.3);
      
      for (let i = 0; i < n; i++) {
        const importance = this.getLandmarkImportance(i);
        // Add head-specific bias
        const headBias = Math.sin((head + 1) * (i + 1) * 0.5) * 0.2;
        headWeights[i] = Math.exp((importance + headBias) / headTemp);
      }
      
      outputs.push(this.normalizeWeights(headWeights));
    }
    
    return outputs;
  }

  /**
   * Normalize weights to sum to 1
   */
  private normalizeWeights(weights: number[]): number[] {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum === 0) return weights.map(() => 1 / weights.length);
    return weights.map(w => w / sum);
  }

  /**
   * Calculate Shannon entropy of attention distribution
   */
  private calculateEntropy(weights: number[]): number {
    if (weights.length === 0) return 0;
    
    let entropy = 0;
    for (const w of weights) {
      if (w > 0) {
        entropy -= w * Math.log2(w);
      }
    }
    return entropy;
  }

  /**
   * Update statistics for diagnostics
   */
  private updateStats(weights: number[], entropy: number): void {
    this.computationCount++;
    this.entropySum += entropy;
    
    // Track peak attention joint
    let maxWeight = 0;
    let maxIdx = 0;
    for (let i = 0; i < weights.length; i++) {
      if (weights[i] > maxWeight) {
        maxWeight = weights[i];
        maxIdx = i;
      }
    }
    this.jointAttentionCounts[maxIdx]++;
  }

  /**
   * Apply attention weights to landmark features
   * Returns weighted/enhanced landmarks
   */
  applyAttention(landmarks: number[][]): number[][] {
    const weights = this.computeAttentionWeights(landmarks);
    const weighted: number[][] = [];
    
    // Scale weights to have mean of 1 for better preservation
    const meanWeight = weights.jointWeights.reduce((a, b) => a + b, 0) / weights.jointWeights.length;
    const scaleFactors = weights.jointWeights.map(w => w / (meanWeight || 1));
    
    for (let i = 0; i < landmarks.length; i++) {
      const point = landmarks[i];
      if (!point || point.length < 2) {
        weighted.push([0, 0, 0]);
        continue;
      }
      
      const scale = scaleFactors[i] ?? 1;
      // Apply attention as scaling toward/away from center
      const cx = 0.5;
      const cy = 0.5;
      
      const x = point[0] ?? 0;
      const y = point[1] ?? 0;
      const z = point[2] ?? 0;
      
      // Scale distance from center based on attention
      const newX = cx + (x - cx) * scale;
      const newY = cy + (y - cy) * scale;
      
      weighted.push([newX, newY, z]);
    }
    
    return weighted;
  }

  /**
   * Get aggregated attention across all heads
   */
  getAggregatedAttention(landmarks: number[][]): number[] {
    const weights = this.computeAttentionWeights(landmarks);
    
    if (weights.headOutputs.length === 0) {
      return weights.jointWeights;
    }
    
    // Average across all heads
    const n = landmarks.length;
    const aggregated = new Array(n).fill(0);
    
    for (const headOutput of weights.headOutputs) {
      for (let i = 0; i < n; i++) {
        aggregated[i] += headOutput[i] ?? 0;
      }
    }
    
    return this.normalizeWeights(aggregated);
  }

  /**
   * Record gesture pattern for learning adaptive attention
   */
  recordGesturePattern(gesture: string, landmarks: number[][]): void {
    if (landmarks.length === 0) return;
    
    const existing = this.learnedPatterns.get(gesture);
    const weights = this.computeAttentionWeights(landmarks);
    
    if (existing) {
      // Update existing pattern with exponential moving average
      const lr = this.config.learningRate ?? 0.1;
      const newImportance = weights.jointWeights.map((w, i) => {
        const oldValue = existing.jointImportance[i] ?? 0;
        return oldValue * (1 - lr) + w * lr;
      });
      
      existing.jointImportance = newImportance;
      existing.sampleCount++;
      existing.lastUpdate = Date.now();
    } else {
      // Create new pattern
      this.learnedPatterns.set(gesture, {
        jointImportance: [...weights.jointWeights],
        sampleCount: 1,
        lastUpdate: Date.now(),
      });
    }
  }

  /**
   * Get learned pattern for a gesture
   */
  getLearnedPattern(gesture: string): GestureAttentionPattern | undefined {
    return this.learnedPatterns.get(gesture);
  }

  /**
   * Compute attention adapted based on learned patterns
   */
  computeAdaptedAttention(gesture: string, landmarks: number[][]): AdaptedAttentionWeights {
    const baseWeights = this.computeAttentionWeights(landmarks);
    const pattern = this.learnedPatterns.get(gesture);
    
    if (!pattern || pattern.sampleCount < MIN_SAMPLES_FOR_ADAPTATION) {
      return {
        ...baseWeights,
        isAdapted: false,
        adaptationConfidence: 0,
      };
    }
    
    // Blend base attention with learned pattern
    const adaptationStrength = Math.min(1, pattern.sampleCount / FULL_ADAPTATION_SAMPLE_COUNT);
    const adaptedWeights = baseWeights.jointWeights.map((w, i) => {
      const learned = pattern.jointImportance[i] ?? w;
      return w * (1 - adaptationStrength) + learned * adaptationStrength;
    });
    
    return {
      jointWeights: this.normalizeWeights(adaptedWeights),
      interJointAttention: baseWeights.interJointAttention,
      headOutputs: baseWeights.headOutputs,
      entropy: this.calculateEntropy(adaptedWeights),
      isAdapted: true,
      adaptationConfidence: adaptationStrength,
    };
  }

  /**
   * Compute cross-hand attention for two-handed gestures
   */
  computeCrossHandAttention(leftHand: number[][], rightHand: number[][]): CrossHandAttention {
    // Calculate symmetry between hands
    const symmetryScore = this.calculateHandSymmetry(leftHand, rightHand);
    
    // Find potential interaction points (close landmarks)
    const interactionPoints = this.findInteractionPoints(leftHand, rightHand);
    
    // Compute combined attention weights
    const leftWeights = this.computeAttentionWeights(leftHand);
    const rightWeights = this.computeAttentionWeights(rightHand);
    
    // Combine weights with interaction boosting
    const combinedWeights = this.combineHandWeights(
      leftWeights.jointWeights,
      rightWeights.jointWeights,
      interactionPoints
    );
    
    return {
      symmetryScore,
      interactionPoints,
      combinedWeights,
    };
  }

  /**
   * Calculate symmetry between two hands
   */
  private calculateHandSymmetry(leftHand: number[][], rightHand: number[][]): number {
    if (leftHand.length === 0 || rightHand.length === 0) return 0;
    
    // Compare corresponding landmarks after mirroring
    let totalDiff = 0;
    let count = 0;
    
    for (let i = 0; i < Math.min(leftHand.length, rightHand.length); i++) {
      const left = leftHand[i];
      const right = rightHand[i];
      
      if (!left || !right || left.length < 2 || right.length < 2) continue;
      
      // Mirror right hand X coordinate for comparison
      const leftX = left[0] ?? 0;
      const leftY = left[1] ?? 0;
      const rightX = 1 - (right[0] ?? 0); // Mirror
      const rightY = right[1] ?? 0;
      
      const diff = Math.sqrt(
        Math.pow(leftX - rightX, 2) + Math.pow(leftY - rightY, 2)
      );
      totalDiff += diff;
      count++;
    }
    
    if (count === 0) return 0;
    
    const avgDiff = totalDiff / count;
    // Convert difference to symmetry score (0 diff = 1 symmetry)
    return Math.max(0, 1 - avgDiff * SYMMETRY_DIFFERENCE_MULTIPLIER);
  }

  /**
   * Find interaction points between hands (close landmarks)
   */
  private findInteractionPoints(
    leftHand: number[][],
    rightHand: number[][]
  ): Array<{ leftIdx: number; rightIdx: number; distance: number }> {
    const interactions: Array<{ leftIdx: number; rightIdx: number; distance: number }> = [];
    
    for (let i = 0; i < leftHand.length; i++) {
      const left = leftHand[i];
      if (!left || left.length < 2) continue;
      
      for (let j = 0; j < rightHand.length; j++) {
        const right = rightHand[j];
        if (!right || right.length < 2) continue;
        
        const distance = this.euclideanDistance(left, right);
        
        if (distance < HAND_INTERACTION_PROXIMITY_THRESHOLD) {
          interactions.push({ leftIdx: i, rightIdx: j, distance });
        }
      }
    }
    
    // Sort by distance and return closest interactions
    return interactions.sort((a, b) => a.distance - b.distance).slice(0, 10);
  }

  /**
   * Combine weights from both hands
   */
  private combineHandWeights(
    leftWeights: number[],
    rightWeights: number[],
    interactions: Array<{ leftIdx: number; rightIdx: number; distance: number }>
  ): number[] {
    // Simple combination: average of both hands' weights
    const combined = leftWeights.map((w, i) => (w + (rightWeights[i] ?? 0)) / 2);
    
    // Boost weights for interacting landmarks
    for (const interaction of interactions) {
      const boost = 1 + (1 - interaction.distance * 10); // More boost for closer points
      if (combined[interaction.leftIdx] !== undefined) {
        combined[interaction.leftIdx] *= boost;
      }
    }
    
    return this.normalizeWeights(combined);
  }

  /**
   * Update temporal attention based on landmark movement
   */
  updateTemporalAttention(landmarks: number[][], timestamp: number): void {
    if (this.previousLandmarks && this.previousTimestamp > 0) {
      const dt = Math.max(0.001, (timestamp - this.previousTimestamp) / 1000);
      const movements: number[] = [];
      
      for (let i = 0; i < landmarks.length; i++) {
        const curr = landmarks[i];
        const prev = this.previousLandmarks[i];
        
        if (curr && prev && curr.length >= 2 && prev.length >= 2) {
          const dx = (curr[0] ?? 0) - (prev[0] ?? 0);
          const dy = (curr[1] ?? 0) - (prev[1] ?? 0);
          const velocity = Math.sqrt(dx * dx + dy * dy) / dt;
          movements.push(velocity);
        } else {
          movements.push(0);
        }
      }
      
      this.movementHistory.push(movements);
      
      // Limit history size
      if (this.movementHistory.length > 30) {
        this.movementHistory.shift();
      }
    }
    
    this.previousLandmarks = landmarks.map(l => [...l]);
    this.previousTimestamp = timestamp;
  }

  /**
   * Get temporal attention weights based on movement
   */
  getTemporalAttentionWeights(): TemporalAttentionWeights {
    if (this.movementHistory.length === 0) {
      return {
        movementAttention: new Array(NUM_HAND_LANDMARKS).fill(0),
        movementRecency: new Array(NUM_HAND_LANDMARKS).fill(Infinity),
      };
    }
    
    // Average movement across history
    const avgMovement = new Array(NUM_HAND_LANDMARKS).fill(0);
    for (const frame of this.movementHistory) {
      for (let i = 0; i < frame.length; i++) {
        avgMovement[i] += frame[i] ?? 0;
      }
    }
    
    const historyLen = this.movementHistory.length;
    for (let i = 0; i < avgMovement.length; i++) {
      avgMovement[i] /= historyLen;
    }
    
    // Normalize to 0-1 range
    const maxMovement = Math.max(...avgMovement, 0.0001);
    const movementAttention = avgMovement.map(m => m / maxMovement);
    
    // Calculate recency of last significant movement
    const movementRecency = new Array(NUM_HAND_LANDMARKS).fill(Infinity);
    for (let i = 0; i < NUM_HAND_LANDMARKS; i++) {
      for (let t = this.movementHistory.length - 1; t >= 0; t--) {
        if ((this.movementHistory[t]?.[i] ?? 0) > 0.01) {
          movementRecency[i] = this.movementHistory.length - 1 - t;
          break;
        }
      }
    }
    
    return {
      movementAttention,
      movementRecency,
    };
  }

  /**
   * Get attention statistics for diagnostics
   */
  getAttentionStats(): AttentionStats {
    // Find most frequently attended joint
    let peakJoint = 0;
    let peakCount = 0;
    for (let i = 0; i < this.jointAttentionCounts.length; i++) {
      if (this.jointAttentionCounts[i] > peakCount) {
        peakCount = this.jointAttentionCounts[i];
        peakJoint = i;
      }
    }
    
    return {
      computationCount: this.computationCount,
      averageEntropy: this.computationCount > 0 ? this.entropySum / this.computationCount : 0,
      peakAttentionJoint: peakJoint,
    };
  }

  /**
   * Euclidean distance between two points
   */
  private euclideanDistance(p1: number[], p2: number[]): number {
    const dx = (p1[0] ?? 0) - (p2[0] ?? 0);
    const dy = (p1[1] ?? 0) - (p2[1] ?? 0);
    const dz = (p1[2] ?? 0) - (p2[2] ?? 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Clean up resources under memory pressure
   */
  private cleanup(): void {
    // Clear old movement history
    if (this.movementHistory.length > 10) {
      this.movementHistory = this.movementHistory.slice(-10);
    }
    
    // Clear old learned patterns that haven't been used recently
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    for (const [gesture, pattern] of this.learnedPatterns.entries()) {
      if (now - pattern.lastUpdate > maxAge) {
        this.learnedPatterns.delete(gesture);
      }
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.memoryOptimizer.unregisterCleanupCallback('spatialAttentionProcessor');
    this.learnedPatterns.clear();
    this.movementHistory = [];
    this.previousLandmarks = null;
    this.computationCount = 0;
    this.entropySum = 0;
    this.jointAttentionCounts = new Array(NUM_HAND_LANDMARKS).fill(0);
  }
}
