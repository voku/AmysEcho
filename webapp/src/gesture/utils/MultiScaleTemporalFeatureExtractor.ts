/**
 * Multi-Scale Temporal Feature Extractor - Amy First
 *
 * Research Foundation:
 * - "Multi-scale local-temporal similarity fusion for continuous sign language" (Pattern Recognition 2022)
 * - Combines local (short-term) and global (long-term) temporal patterns
 * - Port of server-side Python implementation for frontend real-time processing
 *
 * Amy Impact:
 * - Better distinction of timing-dependent gestures like "SCHNELL" (fast) vs "LANGSAM" (slow)
 * - Captures both rapid hand movements and slow, careful signing
 * - Improves recognition of dynamic gestures with varying tempos
 */

import { MemoryOptimizer } from './MemoryOptimizer';

/**
 * Configuration for temporal feature extraction
 */
export interface TemporalFeatureConfig {
  /** Temporal window sizes for feature extraction (default: [3, 5, 7]) */
  scales: number[];
  /** Whether to apply feature weighting based on temporal scale */
  useTemporalWeighting?: boolean;
}

/**
 * Multi-scale features with metadata
 */
export interface MultiScaleFeatures {
  /** Fused features from all scales */
  fused: number[][];
  /** Per-scale features before fusion */
  perScale: Map<number, number[][]>;
  /** Temporal metadata */
  temporalScale?: number;
}

/**
 * Velocity features for a single frame
 */
export interface VelocityFrame {
  /** Average velocity across all features */
  averageVelocity: number;
  /** Peak velocity (max) */
  peakVelocity: number;
  /** Per-feature velocities */
  featureVelocities: number[];
  /** Timestamp/frame index */
  frameIndex: number;
}

/**
 * Statistics for diagnostics
 */
export interface TemporalFeatureStats {
  /** Number of extractions performed */
  extractionCount: number;
  /** Average sequence length processed */
  averageSequenceLength: number;
}

// Multi-scale convolution kernel cache for efficiency
const kernelCache: Map<number, number[]> = new Map();

function getKernel(scale: number): number[] {
  if (!kernelCache.has(scale)) {
    kernelCache.set(scale, new Array(scale).fill(1 / scale));
  }
  return kernelCache.get(scale)!;
}

// Default configuration matching server-side Python implementation
const DEFAULT_CONFIG: TemporalFeatureConfig = {
  scales: [3, 5, 7],
  useTemporalWeighting: true,
};

/**
 * Multi-Scale Temporal Feature Extractor
 * 
 * Extracts temporal features at multiple scales to capture both rapid and gradual
 * gesture movements. Uses temporal convolution at different scales:
 * - Local features (scale 3): Rapid hand movements, quick gestures
 * - Medium features (scale 5): Standard gesture tempo
 * - Global features (scale 7): Slow, careful signing
 */
export class MultiScaleTemporalFeatureExtractor {
  private config: TemporalFeatureConfig;
  private memoryOptimizer: MemoryOptimizer;
  
  // Statistics tracking
  private extractionCount = 0;
  private totalSequenceLength = 0;

  constructor(config?: Partial<TemporalFeatureConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memoryOptimizer = MemoryOptimizer.getInstance();
    
    // Register for memory cleanup
    this.memoryOptimizer.registerCleanupCallback('multiScaleTemporalExtractor', () => this.cleanup());
  }

  /**
   * Extract local (short-term) temporal features using convolution
   * 
   * @param sequence Input sequence of shape [time_steps, features]
   * @param scale Temporal window size for local patterns
   * @returns Local temporal features of shape [time_steps - scale + 1, features]
   */
  extractLocalFeatures(sequence: number[][], scale: number): number[][] {
    if (sequence.length < scale) {
      // For very short sequences, return as-is
      return sequence.map(frame => [...frame]);
    }

    const numFeatures = sequence[0]?.length ?? 0;
    if (numFeatures === 0) return [];

    // Create box filter kernel (simple averaging) - cached for efficiency
    const kernel = getKernel(scale);
    
    const localFeatures: number[][] = [];
    
    // Apply 1D convolution to each feature dimension
    const resultLength = sequence.length - scale + 1;
    
    for (let t = 0; t < resultLength; t++) {
      const frame: number[] = [];
      
      for (let f = 0; f < numFeatures; f++) {
        // Convolve: weighted sum of kernel and signal
        let sum = 0;
        for (let k = 0; k < scale; k++) {
          sum += (sequence[t + k]?.[f] ?? 0) * kernel[k];
        }
        frame.push(sum);
      }
      
      localFeatures.push(frame);
    }

    return localFeatures;
  }

  /**
   * Extract features at all scales and fuse them
   * 
   * @param sequence Input sequence of shape [time_steps, features]
   * @param temporalScale Optional temporal scale from augmentation (0.8, 1.0, 1.2)
   * @returns Fused multi-scale features
   */
  extractAndFuse(sequence: number[][], temporalScale?: number): number[][] {
    if (sequence.length === 0) {
      return [];
    }

    const numFeatures = sequence[0]?.length ?? 0;
    if (numFeatures === 0) {
      return [];
    }

    // Track statistics
    this.extractionCount++;
    this.totalSequenceLength += sequence.length;

    const multiScaleFeatures: number[][][] = [];

    // Always extract features at all scales
    for (const scale of this.config.scales) {
      let features: number[][];
      
      if (sequence.length >= scale) {
        features = this.extractLocalFeatures(sequence, scale);
      } else {
        // For sequences shorter than scale, use the sequence as-is
        // This ensures consistent feature handling for short sequences
        features = sequence.map(frame => [...frame]);
      }
      
      multiScaleFeatures.push(features);
    }

    if (multiScaleFeatures.length === 0) {
      return sequence.map(frame => [...frame]);
    }

    // Find minimum length across all scales
    const minLength = Math.min(...multiScaleFeatures.map(f => f.length));
    
    if (minLength === 0) {
      return [];
    }

    // Trim all features to same length and concatenate
    const fused: number[][] = [];
    
    for (let t = 0; t < minLength; t++) {
      const fusedFrame: number[] = [];
      
      for (const scaleFeatures of multiScaleFeatures) {
        const frame = scaleFeatures[t];
        if (frame) {
          fusedFrame.push(...frame);
        }
      }
      
      fused.push(fusedFrame);
    }

    // Apply temporal scale weighting if provided and enabled
    // Adjusts feature importance based on detected gesture tempo
    if (temporalScale !== undefined && this.config.useTemporalWeighting) {
      const numScales = this.config.scales.length;
      const featuresPerScale = fused[0] ? Math.floor(fused[0].length / numScales) : 0;
      
      if (featuresPerScale > 0) {
        for (let t = 0; t < fused.length; t++) {
          const frame = fused[t];
          if (!frame) continue;
          
          // Weight each scale's features based on temporal scale
          // Higher temporalScale = emphasize larger windows (slower gestures)
          // Lower temporalScale = emphasize smaller windows (faster gestures)
          for (let scaleIdx = 0; scaleIdx < numScales; scaleIdx++) {
            const startIdx = scaleIdx * featuresPerScale;
            const endIdx = Math.min(startIdx + featuresPerScale, frame.length);
            
            // Compute weight: scales that match temporalScale get boosted
            // Guard against division by zero when temporalScale is 0
            const scaleValue = this.config.scales[scaleIdx] ?? 1;
            const scaleMatch = temporalScale 
              ? 1 - Math.abs(scaleValue - temporalScale) / temporalScale 
              : 1;
            const weight = 0.5 + 0.5 * Math.max(0, scaleMatch); // Range [0.5, 1.0]
            
            for (let i = startIdx; i < endIdx; i++) {
              frame[i] *= weight;
            }
          }
        }
      }
    }

    return fused;
  }

  /**
   * Extract velocity features from landmark sequence
   * Useful for dynamic gesture recognition
   * 
   * @param sequence Input sequence of landmarks [time_steps, features]
   * @returns Velocity features for each frame transition
   */
  extractVelocityFeatures(sequence: number[][]): VelocityFrame[] {
    if (sequence.length < 2) {
      return [];
    }

    const velocityFrames: VelocityFrame[] = [];
    const numFeatures = sequence[0]?.length ?? 0;

    for (let t = 1; t < sequence.length; t++) {
      const current = sequence[t];
      const previous = sequence[t - 1];
      
      if (!current || !previous) continue;

      const featureVelocities: number[] = [];
      let totalVelocity = 0;
      let peakVelocity = 0;

      for (let f = 0; f < numFeatures; f++) {
        const delta = Math.abs((current[f] ?? 0) - (previous[f] ?? 0));
        featureVelocities.push(delta);
        totalVelocity += delta;
        peakVelocity = Math.max(peakVelocity, delta);
      }

      velocityFrames.push({
        averageVelocity: numFeatures > 0 ? totalVelocity / numFeatures : 0,
        peakVelocity,
        featureVelocities,
        frameIndex: t,
      });
    }

    return velocityFrames;
  }

  /**
   * Calculate the output feature dimension after fusion
   * 
   * @param inputFeatures Number of input features per timestep
   * @returns Total number of features after multi-scale fusion
   */
  getFeatureDimension(inputFeatures: number): number {
    return inputFeatures * this.config.scales.length;
  }

  /**
   * Get extraction statistics
   */
  getStats(): TemporalFeatureStats {
    return {
      extractionCount: this.extractionCount,
      averageSequenceLength: this.extractionCount > 0 
        ? this.totalSequenceLength / this.extractionCount 
        : 0,
    };
  }

  /**
   * Cleanup for memory optimization
   */
  private cleanup(): void {
    // Reset statistics under memory pressure
    if (this.extractionCount > 10000) {
      this.extractionCount = 0;
      this.totalSequenceLength = 0;
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.memoryOptimizer.unregisterCleanupCallback('multiScaleTemporalExtractor');
    this.extractionCount = 0;
    this.totalSequenceLength = 0;
  }
}
