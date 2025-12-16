/**
 * TemporalAugmenter - Temporal speed variation for gesture training
 * 
 * Research basis:
 * - "Multi-scale local-temporal similarity fusion for continuous sign language" (Pattern Recognition 2022)
 * - "Sign Language Recognition of Autistic Children using Wearable Sensors" (IEEE 2024)
 * 
 * Amy First: Recognizes both slow/careful and fast/excited signing
 * 
 * Implementation: Adds temporal scale metadata to gestures for server-side training.
 * The actual temporal modulation happens during model training when processing sequences.
 */

import type { GestureLandmarks } from '../gesture/core/types';

/**
 * Extended GestureLandmarks with temporal metadata
 */
export interface TemporalGestureLandmarks extends GestureLandmarks {
  /** Temporal scale factor (0.8 = slow, 1.0 = normal, 1.2 = fast) */
  temporalScale?: number;
}

/**
 * Gesture sample for training with temporal augmentation
 */
export interface AugmentedGestureSample {
  symbol: string;
  landmarks: TemporalGestureLandmarks;
  success: boolean;
  metadata?: {
    temporalAugmentation: boolean;
    originalSpeed?: number;
  };
}

/**
 * Service for generating temporal speed variations of gestures
 * 
 * @example
 * ```typescript
 * const augmenter = new TemporalAugmenter();
 * const variations = augmenter.generateSpeedVariations(landmarks);
 * // Returns 3 variations: slow (0.8x), normal (1.0x), fast (1.2x)
 * ```
 */
export class TemporalAugmenter {
  /** Default speed variation factors based on research findings */
  private readonly SPEED_FACTORS = [0.8, 1.0, 1.2] as const;

  /**
   * Modulate gesture speed by applying a temporal scale factor
   * 
   * @param landmarks - Original gesture landmarks
   * @param speedFactor - Temporal scale (0.8 = slower, 1.2 = faster)
   * @returns Landmarks with temporal scale metadata
   */
  modulateSpeed(
    landmarks: GestureLandmarks,
    speedFactor: number
  ): TemporalGestureLandmarks {
    // Spatial landmarks remain unchanged
    // Temporal scale is used by the model during sequence processing
    return {
      ...landmarks,
      temporalScale: speedFactor,
    };
  }

  /**
   * Generate multiple speed variations for a single gesture
   * 
   * Creates slow (0.8x), normal (1.0x), and fast (1.2x) variations
   * to train the model on Amy's different signing speeds.
   * 
   * @param landmarks - Original gesture landmarks
   * @returns Array of temporal variations
   */
  generateSpeedVariations(landmarks: GestureLandmarks): TemporalGestureLandmarks[] {
    return this.SPEED_FACTORS.map(factor => this.modulateSpeed(landmarks, factor));
  }

  /**
   * Augment training samples with temporal variations
   * 
   * For each gesture sample, generates multiple speed variations
   * while preserving the symbol and success status.
   * 
   * @param samples - Original training samples
   * @returns Augmented samples with temporal variations
   */
  augmentTrainingSamples(
    samples: Array<{ symbol: string; landmarks: GestureLandmarks; success: boolean }>
  ): AugmentedGestureSample[] {
    const augmented: AugmentedGestureSample[] = [];

    for (const sample of samples) {
      const variations = this.generateSpeedVariations(sample.landmarks);

      for (const variation of variations) {
        augmented.push({
          symbol: sample.symbol,
          landmarks: variation,
          success: sample.success,
          metadata: {
            temporalAugmentation: true,
            originalSpeed: variation.temporalScale === 1.0 ? 1.0 : undefined,
          },
        });
      }
    }

    return augmented;
  }

  /**
   * Get recommended speed factors for custom augmentation
   * 
   * @returns Array of recommended temporal scale factors
   */
  getSpeedFactors(): readonly number[] {
    return this.SPEED_FACTORS;
  }
}
