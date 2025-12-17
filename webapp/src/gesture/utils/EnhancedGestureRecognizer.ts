/**
 * Enhanced Gesture Recognizer - Amy First
 *
 * Research Foundation:
 * - Integrates SpatialAttentionProcessor, MultiScaleTemporalFeatureExtractor, and LandmarkEmbedding
 * - "Spatial-temporal attention with graph and general neural networks" (Springer 2024)
 * - "SLRNet: A Real-Time LSTM-Based Sign Language Recognition System" (arXiv 2025)
 * - Comprehensive multimodal sign language detection with attention mechanisms
 *
 * Amy Impact:
 * - Self-discovering multimodal sign language detection system
 * - Adapts to Amy's unique signing style through learned attention patterns
 * - Enhanced two-hand gesture recognition with cross-hand attention
 * - Better distinction of timing-dependent gestures
 */

import { MemoryOptimizer } from './MemoryOptimizer';
import { SpatialAttentionProcessor, AttentionWeights } from './SpatialAttentionProcessor';
import { MultiScaleTemporalFeatureExtractor, VelocityFrame } from './MultiScaleTemporalFeatureExtractor';
import { LandmarkEmbedding, EmbeddedLandmarks } from './LandmarkEmbedding';

/**
 * Configuration for enhanced gesture recognizer
 */
export interface RecognizerConfig {
  /** Enable spatial attention processing */
  useSpatialAttention: boolean;
  /** Enable temporal feature extraction */
  useTemporalFeatures: boolean;
  /** Enable landmark embedding */
  useEmbedding: boolean;
  /** Number of attention heads */
  numAttentionHeads: number;
  /** Embedding dimension */
  embeddingDimension: number;
}

/**
 * Result from processing landmarks
 */
export interface ProcessedLandmarks {
  /** Attention-weighted enhanced landmarks */
  enhancedLandmarks: number[][];
  /** Attention weights for each landmark */
  attentionWeights: number[];
  /** Embedded features */
  embeddings: number[][];
}

/**
 * Result from processing a landmark sequence
 */
export interface SequenceResult extends ProcessedLandmarks {
  /** Multi-scale temporal features */
  temporalFeatures: number[][];
  /** Velocity features per frame */
  velocityFeatures: VelocityFrame[];
}

/**
 * Result from processing two hands
 */
export interface TwoHandResult {
  /** Left hand processing result */
  leftHandResult: ProcessedLandmarks;
  /** Right hand processing result */
  rightHandResult: ProcessedLandmarks;
  /** Cross-hand relationship features */
  crossHandFeatures: {
    symmetryScore: number;
    interactionScore: number;
    combinedAttention: number[];
  };
}

/**
 * Multimodal input for recognition
 */
export interface MultimodalInput {
  /** Hand landmarks (one or two hands) */
  handLandmarks: number[][][];
  /** Pose landmarks (optional) */
  poseLandmarks: number[][];
  /** Face landmarks (optional) */
  faceLandmarks: number[][];
}

/**
 * Result from multimodal processing
 */
export interface MultimodalResult {
  /** Which modalities were used */
  modalitiesUsed: {
    hand: boolean;
    pose: boolean;
    face: boolean;
  };
  /** Combined features from all modalities */
  combinedFeatures: number[];
  /** Non-manual marker features */
  nonManualFeatures?: {
    lipPointingDistance?: number;
    eyebrowPosition?: number;
    mouthOpenness?: number;
  };
}

/**
 * Result from learned pattern processing
 */
export interface AdaptedResult extends ProcessedLandmarks {
  /** Whether learned patterns were applied */
  isAdapted: boolean;
  /** Confidence in the adaptation */
  adaptationConfidence: number;
}

/**
 * Enhanced recognition result
 */
export interface EnhancedRecognitionResult {
  /** Timestamp of recognition */
  timestamp: number;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Overall confidence score */
  confidence: number;
  /** Enhanced landmark features */
  features: ProcessedLandmarks;
  /** Attention statistics */
  attentionStats: {
    entropy: number;
    peakJoint: number;
  };
}

/**
 * Recognizer statistics
 */
export interface RecognizerStats {
  /** Total number of recognitions performed */
  totalRecognitions: number;
  /** Average processing time */
  averageProcessingTime: number;
  /** Average attention entropy */
  averageAttentionEntropy: number;
  /** Number of learned patterns */
  learnedPatternCount: number;
}

// Default configuration
const DEFAULT_CONFIG: RecognizerConfig = {
  useSpatialAttention: true,
  useTemporalFeatures: true,
  useEmbedding: true,
  numAttentionHeads: 4,
  embeddingDimension: 32,
};

// Threshold for normalizing interaction score (number of touching pairs for max score)
const MAX_TOUCHING_PAIRS_FOR_FULL_SCORE = 5;

/**
 * Enhanced Gesture Recognizer
 * 
 * Integrates spatial attention, temporal features, and landmark embedding
 * for comprehensive sign language recognition.
 */
export class EnhancedGestureRecognizer {
  private config: RecognizerConfig;
  private memoryOptimizer: MemoryOptimizer;
  
  // Core components
  private spatialAttention: SpatialAttentionProcessor;
  private temporalExtractor: MultiScaleTemporalFeatureExtractor;
  private landmarkEmbedding: LandmarkEmbedding;
  
  // Statistics tracking
  private recognitionCount = 0;
  private totalProcessingTime = 0;
  private totalEntropy = 0;
  
  // Learned patterns storage
  private learnedPatterns: Map<string, {
    attentionPattern: number[];
    sampleCount: number;
    lastUpdate: number;
  }> = new Map();

  constructor(config?: Partial<RecognizerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memoryOptimizer = MemoryOptimizer.getInstance();
    
    // Initialize components
    this.spatialAttention = new SpatialAttentionProcessor({
      numHeads: this.config.numAttentionHeads,
      keyDimension: 8,
      valueDimension: 8,
    });
    
    this.temporalExtractor = new MultiScaleTemporalFeatureExtractor();
    
    this.landmarkEmbedding = new LandmarkEmbedding({
      embeddingDimension: this.config.embeddingDimension,
      usePositionalEncoding: true,
      useAnatomicalEmbedding: true,
    });
    
    // Register for memory cleanup
    this.memoryOptimizer.registerCleanupCallback('enhancedGestureRecognizer', () => this.cleanup());
  }

  /**
   * Process single-hand landmarks with attention and embedding
   */
  processLandmarks(landmarks: number[][]): ProcessedLandmarks {
    // Compute attention weights
    const attentionResult = this.config.useSpatialAttention
      ? this.spatialAttention.computeAttentionWeights(landmarks)
      : { jointWeights: new Array(landmarks.length).fill(1 / landmarks.length) } as AttentionWeights;
    
    // Apply attention to enhance landmarks
    const enhancedLandmarks = this.config.useSpatialAttention
      ? this.spatialAttention.applyAttention(landmarks)
      : landmarks;
    
    // Compute embeddings
    const embeddingResult = this.config.useEmbedding
      ? this.landmarkEmbedding.embed(enhancedLandmarks)
      : { embeddings: landmarks } as EmbeddedLandmarks;
    
    return {
      enhancedLandmarks,
      attentionWeights: attentionResult.jointWeights,
      embeddings: embeddingResult.embeddings,
    };
  }

  /**
   * Process a sequence of landmarks for temporal features
   */
  processSequence(sequence: number[][][]): SequenceResult {
    if (sequence.length === 0) {
      return {
        enhancedLandmarks: [],
        attentionWeights: [],
        embeddings: [],
        temporalFeatures: [],
        velocityFeatures: [],
      };
    }
    
    // Process first frame for basic features
    const baseResult = this.processLandmarks(sequence[0]);
    
    // Convert sequence to flat features for temporal extraction
    const flatSequence = sequence.map(frame => 
      frame.flatMap(point => point)
    );
    
    // Extract multi-scale temporal features
    const temporalFeatures = this.config.useTemporalFeatures
      ? this.temporalExtractor.extractAndFuse(flatSequence)
      : [];
    
    // Extract velocity features
    const velocityFeatures = this.config.useTemporalFeatures
      ? this.temporalExtractor.extractVelocityFeatures(flatSequence)
      : [];
    
    return {
      ...baseResult,
      temporalFeatures,
      velocityFeatures,
    };
  }

  /**
   * Process two-hand gestures with cross-hand attention
   */
  processTwoHands(leftHand: number[][], rightHand: number[][]): TwoHandResult {
    // Process each hand individually
    const leftResult = this.processLandmarks(leftHand);
    const rightResult = this.processLandmarks(rightHand);
    
    // Compute cross-hand attention features
    const crossAttention = this.spatialAttention.computeCrossHandAttention(leftHand, rightHand);
    
    // Compute two-hand embeddings
    const twoHandEmbeddings = this.landmarkEmbedding.embedTwoHands(leftHand, rightHand);
    
    // Calculate interaction score based on touching pairs
    const interactionScore = Math.min(
      1, 
      twoHandEmbeddings.interHandFeatures.touchingPairs.length / MAX_TOUCHING_PAIRS_FOR_FULL_SCORE
    );
    
    return {
      leftHandResult: leftResult,
      rightHandResult: rightResult,
      crossHandFeatures: {
        symmetryScore: crossAttention.symmetryScore,
        interactionScore,
        combinedAttention: crossAttention.combinedWeights,
      },
    };
  }

  /**
   * Process multimodal input (hand, pose, face)
   */
  processMultimodal(input: MultimodalInput): MultimodalResult {
    const modalitiesUsed = {
      hand: input.handLandmarks.length > 0 && input.handLandmarks.some(h => h.length > 0),
      pose: input.poseLandmarks.length > 0,
      face: input.faceLandmarks.length > 0,
    };
    
    const features: number[] = [];
    
    // Process hand landmarks
    if (modalitiesUsed.hand) {
      for (const hand of input.handLandmarks) {
        if (hand.length === 0) continue;
        const result = this.processLandmarks(hand);
        // Add attention weights as features
        features.push(...result.attentionWeights);
      }
    }
    
    // Process pose landmarks (simplified - just use positions)
    if (modalitiesUsed.pose) {
      const poseFeatures = input.poseLandmarks.flatMap(p => p.slice(0, 3));
      features.push(...poseFeatures.slice(0, 20)); // Limit to avoid feature explosion
    }
    
    // Process face landmarks
    let nonManualFeatures: MultimodalResult['nonManualFeatures'];
    if (modalitiesUsed.face && modalitiesUsed.hand && input.handLandmarks[0]) {
      // Compute lip-to-hand distance for non-manual markers
      const lipPointingDistance = this.computeLipHandDistance(
        input.faceLandmarks,
        input.handLandmarks[0]
      );
      
      nonManualFeatures = {
        lipPointingDistance,
      };
      
      features.push(lipPointingDistance);
    }
    
    return {
      modalitiesUsed,
      combinedFeatures: features,
      nonManualFeatures,
    };
  }

  /**
   * Compute distance between lip and nearest hand point
   */
  private computeLipHandDistance(faceLandmarks: number[][], handLandmarks: number[][]): number {
    if (faceLandmarks.length === 0 || handLandmarks.length === 0) return 1.0;
    
    // Approximate lip center (use first face landmark as proxy)
    const lipCenter = faceLandmarks[0];
    if (!lipCenter) return 1.0;
    
    // Find closest hand point to lip
    let minDist = Infinity;
    for (const point of handLandmarks) {
      if (!point || point.length < 2) continue;
      
      const dx = (point[0] ?? 0) - (lipCenter[0] ?? 0);
      const dy = (point[1] ?? 0) - (lipCenter[1] ?? 0);
      const dz = (point[2] ?? 0) - (lipCenter[2] ?? 0);
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      minDist = Math.min(minDist, dist);
    }
    
    return minDist === Infinity ? 1.0 : minDist;
  }

  /**
   * Record a successful gesture recognition for learning
   */
  recordSuccess(gesture: string, landmarks: number[][], _confidence: number): void {
    const attentionWeights = this.spatialAttention.computeAttentionWeights(landmarks);
    
    const existing = this.learnedPatterns.get(gesture);
    
    if (existing) {
      // Update with exponential moving average
      const lr = 0.2;
      const newPattern = attentionWeights.jointWeights.map((w, i) => 
        existing.attentionPattern[i] * (1 - lr) + w * lr
      );
      
      existing.attentionPattern = newPattern;
      existing.sampleCount++;
      existing.lastUpdate = Date.now();
    } else {
      // Create new pattern
      this.learnedPatterns.set(gesture, {
        attentionPattern: [...attentionWeights.jointWeights],
        sampleCount: 1,
        lastUpdate: Date.now(),
      });
    }
    
    // Also record in spatial attention processor
    this.spatialAttention.recordGesturePattern(gesture, landmarks);
  }

  /**
   * Check if a pattern has been learned
   */
  hasLearnedPattern(gesture: string): boolean {
    const pattern = this.learnedPatterns.get(gesture);
    return pattern !== undefined && pattern.sampleCount >= 3;
  }

  /**
   * Process landmarks with learned attention patterns
   */
  processWithLearnedPatterns(gesture: string, landmarks: number[][]): AdaptedResult {
    const baseResult = this.processLandmarks(landmarks);
    const adaptedAttention = this.spatialAttention.computeAdaptedAttention(gesture, landmarks);
    
    return {
      ...baseResult,
      attentionWeights: adaptedAttention.jointWeights,
      isAdapted: adaptedAttention.isAdapted,
      adaptationConfidence: adaptedAttention.adaptationConfidence,
    };
  }

  /**
   * Export learned patterns for persistence
   */
  exportLearnedPatterns(): Record<string, { attentionPattern: number[]; sampleCount: number }> {
    const exported: Record<string, { attentionPattern: number[]; sampleCount: number }> = {};
    
    for (const [gesture, pattern] of this.learnedPatterns) {
      exported[gesture] = {
        attentionPattern: [...pattern.attentionPattern],
        sampleCount: pattern.sampleCount,
      };
    }
    
    return exported;
  }

  /**
   * Run full recognition pipeline
   */
  recognize(landmarks: number[][], timestamp: number): EnhancedRecognitionResult {
    const startTime = performance.now();
    
    // Process landmarks
    const features = this.processLandmarks(landmarks);
    
    // Get attention statistics
    const attentionStats = this.spatialAttention.getAttentionStats();
    const entropy = this.computeEntropyFromWeights(features.attentionWeights);
    
    // Calculate confidence based on attention concentration
    // Higher entropy = less concentrated = lower confidence
    const maxEntropy = Math.log2(landmarks.length);
    const confidence = maxEntropy > 0 ? Math.max(0, 1 - entropy / maxEntropy) : 1;
    
    // Track processing time
    const processingTimeMs = performance.now() - startTime;
    
    // Update statistics
    this.recognitionCount++;
    this.totalProcessingTime += processingTimeMs;
    this.totalEntropy += entropy;
    
    return {
      timestamp,
      processingTimeMs,
      confidence,
      features,
      attentionStats: {
        entropy,
        peakJoint: attentionStats.peakAttentionJoint,
      },
    };
  }

  /**
   * Compute entropy from attention weights
   */
  private computeEntropyFromWeights(weights: number[]): number {
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
   * Get recognizer statistics
   */
  getStats(): RecognizerStats {
    return {
      totalRecognitions: this.recognitionCount,
      averageProcessingTime: this.recognitionCount > 0 
        ? this.totalProcessingTime / this.recognitionCount 
        : 0,
      averageAttentionEntropy: this.recognitionCount > 0 
        ? this.totalEntropy / this.recognitionCount 
        : 0,
      learnedPatternCount: this.learnedPatterns.size,
    };
  }

  /**
   * Cleanup for memory optimization
   */
  private cleanup(): void {
    // Clear old learned patterns
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    
    for (const [gesture, pattern] of this.learnedPatterns.entries()) {
      if (now - pattern.lastUpdate > maxAge) {
        this.learnedPatterns.delete(gesture);
      }
    }
    
    // Reset statistics under extreme counts
    if (this.recognitionCount > 100000) {
      this.recognitionCount = 0;
      this.totalProcessingTime = 0;
      this.totalEntropy = 0;
    }
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.memoryOptimizer.unregisterCleanupCallback('enhancedGestureRecognizer');
    this.spatialAttention.dispose();
    this.temporalExtractor.dispose();
    this.landmarkEmbedding.dispose();
    this.learnedPatterns.clear();
    this.recognitionCount = 0;
    this.totalProcessingTime = 0;
    this.totalEntropy = 0;
  }
}
