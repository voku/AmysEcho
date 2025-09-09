/**
 * Two-Hand Gesture Service - Amy First
 *
 * Advanced service for recognizing and processing two-hand gestures with best practices:
 * - Intelligent gesture mapping and validation
 * - Confidence scoring optimized for multi-hand scenarios
 * - Accessibility support for visual and haptic feedback
 * - Performance monitoring and optimization
 * - Emergency gesture priority handling
 */

import { TWO_HAND_GESTURES, TwoHandGestureDefinition } from '../constants/twoHandGestures';
import { logger } from '../utils/logger';
import { performanceMonitor } from './performanceMonitor';

export interface DetectedTwoHandGesture {
  gesture: TwoHandGestureDefinition;
  confidence: number;
  leftHandGesture: string;
  rightHandGesture: string;
  handedness: string[];
  landmarks: number[][][];
  processingTime: number;
  validationScore: number;
  accessibilityHints: string[];
}

export interface TwoHandValidationResult {
  isValid: boolean;
  confidence: number;
  issues: string[];
  suggestions: string[];
  accessibilityScore: number;
}

export class TwoHandGestureService {
  private static instance: TwoHandGestureService;
  private gestureCache = new Map<string, DetectedTwoHandGesture>();
  private readonly CONFIDENCE_THRESHOLD = 0.6; // Higher threshold for two-hand gestures
  private readonly MIN_INDIVIDUAL_CONFIDENCE = 0.4; // Minimum confidence for each hand
  private readonly MAX_PROCESSING_TIME = 100; // Max processing time in ms

  private constructor() {
    // Initialize performance monitoring
    performanceMonitor.recordMetric('two_hand_service_initialized', 1);
  }

  static getInstance(): TwoHandGestureService {
    if (!TwoHandGestureService.instance) {
      TwoHandGestureService.instance = new TwoHandGestureService();
    }
    return TwoHandGestureService.instance;
  }

  /**
   * Process detected two-hand gesture with comprehensive validation
   */
  async processTwoHandGesture(
    leftGesture: string,
    rightGesture: string,
    leftConfidence: number,
    rightConfidence: number,
    handedness: string[],
    landmarks: number[][][]
  ): Promise<DetectedTwoHandGesture | null> {
    const startTime = performance.now();

    try {
      // Validate input parameters
      const validation = this.validateTwoHandInput(
        leftGesture, rightGesture, leftConfidence, rightConfidence, handedness, landmarks
      );

      if (!validation.isValid) {
        logger.warn('Two-hand gesture validation failed', {
          issues: validation.issues,
          leftGesture, rightGesture,
          leftConfidence, rightConfidence
        });
        return null;
      }

      // Find matching predefined gesture
      const matchedGesture = this.findMatchingGesture(leftGesture, rightGesture);

      if (!matchedGesture) {
        logger.debug('No matching two-hand gesture found', {
          leftGesture, rightGesture,
          availableGestures: TWO_HAND_GESTURES.length
        });
        return null;
      }

      // Calculate comprehensive confidence score
      const confidence = this.calculateTwoHandConfidence(
        leftConfidence, rightConfidence, matchedGesture, validation
      );

      if (confidence < this.CONFIDENCE_THRESHOLD) {
        logger.debug('Two-hand gesture confidence too low', {
          confidence,
          threshold: this.CONFIDENCE_THRESHOLD,
          gesture: matchedGesture.id
        });
        return null;
      }

      // Generate accessibility hints
      const accessibilityHints = this.generateAccessibilityHints(matchedGesture, confidence);

      // Create detected gesture object
      const detectedGesture: DetectedTwoHandGesture = {
        gesture: matchedGesture,
        confidence,
        leftHandGesture: leftGesture,
        rightHandGesture: rightGesture,
        handedness,
        landmarks,
        processingTime: performance.now() - startTime,
        validationScore: validation.accessibilityScore,
        accessibilityHints
      };

      // Cache successful detection
      const cacheKey = this.generateCacheKey(leftGesture, rightGesture, handedness);
      this.gestureCache.set(cacheKey, detectedGesture);

      // Record performance metrics
      performanceMonitor.recordMetric('two_hand_gesture_processed', 1);
      performanceMonitor.recordMetric('two_hand_processing_time', detectedGesture.processingTime);

      logger.info('Two-hand gesture successfully processed', {
        gestureId: matchedGesture.id,
        confidence,
        processingTime: detectedGesture.processingTime
      });

      return detectedGesture;

    } catch (error) {
      logger.error('Error processing two-hand gesture', error, {
        leftGesture, rightGesture,
        processingTime: performance.now() - startTime
      });
      return null;
    }
  }

  /**
   * Validate two-hand gesture input parameters
   */
  private validateTwoHandInput(
    leftGesture: string,
    rightGesture: string,
    leftConfidence: number,
    rightConfidence: number,
    handedness: string[],
    landmarks: number[][][]
  ): TwoHandValidationResult {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let accessibilityScore = 1.0;

    // Validate gesture strings
    if (!leftGesture || !rightGesture) {
      issues.push('Missing gesture data for one or both hands');
      accessibilityScore *= 0.5;
    }

    // Validate confidence levels
    if (leftConfidence < this.MIN_INDIVIDUAL_CONFIDENCE) {
      issues.push(`Left hand confidence too low: ${leftConfidence}`);
      suggestions.push('Try clearer left hand gesture');
      accessibilityScore *= 0.8;
    }

    if (rightConfidence < this.MIN_INDIVIDUAL_CONFIDENCE) {
      issues.push(`Right hand confidence too low: ${rightConfidence}`);
      suggestions.push('Try clearer right hand gesture');
      accessibilityScore *= 0.8;
    }

    // Validate handedness
    if (!handedness || handedness.length < 2) {
      issues.push('Insufficient handedness data');
      accessibilityScore *= 0.7;
    }

    // Validate landmarks
    if (!landmarks || landmarks.length < 2) {
      issues.push('Insufficient landmark data for two-hand gesture');
      accessibilityScore *= 0.6;
    }

    // Check for gesture symmetry/complementarity
    if (leftGesture === rightGesture) {
      // Same gesture on both hands - check if it's appropriate
      const matchingGestures = TWO_HAND_GESTURES.filter(g =>
        g.leftGesture === leftGesture && g.rightGesture === rightGesture
      );

      if (matchingGestures.length === 0) {
        issues.push('Identical gestures on both hands may not be intended for two-hand recognition');
        suggestions.push('Try different gestures on each hand or use single-hand recognition');
        accessibilityScore *= 0.9;
      }
    }

    return {
      isValid: issues.length === 0,
      confidence: Math.min(leftConfidence, rightConfidence),
      issues,
      suggestions,
      accessibilityScore
    };
  }

  /**
   * Find matching predefined two-hand gesture
   */
  private findMatchingGesture(leftGesture: string, rightGesture: string): TwoHandGestureDefinition | null {
    // First try exact match
    let match = TWO_HAND_GESTURES.find(g =>
      g.leftGesture === leftGesture && g.rightGesture === rightGesture
    );

    if (match) return match;

    // Try reverse order (in case handedness detection was swapped)
    match = TWO_HAND_GESTURES.find(g =>
      g.leftGesture === rightGesture && g.rightGesture === leftGesture
    );

    if (match) {
      logger.debug('Found gesture with reversed handedness', {
        original: `${leftGesture}+${rightGesture}`,
        matched: `${match.leftGesture}+${match.rightGesture}`,
        gestureId: match.id
      });
      return match;
    }

    // Try fuzzy matching for similar gestures
    return this.findFuzzyMatch(leftGesture, rightGesture);
  }

  /**
   * Find fuzzy match for similar gestures
   */
  private findFuzzyMatch(leftGesture: string, rightGesture: string): TwoHandGestureDefinition | null {
    const gestureSimilarity = (a: string, b: string): number => {
      // Simple similarity based on common substrings
      const commonChars = [...new Set(a.split('').filter(char => b.includes(char)))].length;
      return commonChars / Math.max(a.length, b.length);
    };

    let bestMatch: TwoHandGestureDefinition | null = null;
    let bestSimilarity = 0;

    for (const gesture of TWO_HAND_GESTURES) {
      const leftSimilarity = gestureSimilarity(leftGesture, gesture.leftGesture);
      const rightSimilarity = gestureSimilarity(rightGesture, gesture.rightGesture);
      const avgSimilarity = (leftSimilarity + rightSimilarity) / 2;

      if (avgSimilarity > bestSimilarity && avgSimilarity > 0.6) { // 60% similarity threshold
        bestMatch = gesture;
        bestSimilarity = avgSimilarity;
      }
    }

    if (bestMatch) {
      logger.debug('Found fuzzy match for two-hand gesture', {
        detected: `${leftGesture}+${rightGesture}`,
        matched: `${bestMatch.leftGesture}+${bestMatch.rightGesture}`,
        similarity: bestSimilarity,
        gestureId: bestMatch.id
      });
    }

    return bestMatch;
  }

  /**
   * Calculate comprehensive confidence score for two-hand gestures
   */
  private calculateTwoHandConfidence(
    leftConfidence: number,
    rightConfidence: number,
    gesture: TwoHandGestureDefinition,
    validation: TwoHandValidationResult
  ): number {
    // Base confidence is geometric mean (conservative approach)
    const baseConfidence = Math.sqrt(leftConfidence * rightConfidence);

    // Apply difficulty multiplier
    const difficultyMultiplier = gesture.difficulty === 'easy' ? 1.0 :
                                gesture.difficulty === 'medium' ? 0.9 : 0.8;

    // Apply validation score multiplier
    const validationMultiplier = validation.accessibilityScore;

    // Apply gesture-specific adjustments
    const gestureMultiplier = this.getGestureConfidenceMultiplier(gesture);

    const finalConfidence = baseConfidence * difficultyMultiplier * validationMultiplier * gestureMultiplier;

    logger.debug('Two-hand confidence calculation', {
      leftConfidence, rightConfidence, baseConfidence,
      difficultyMultiplier, validationMultiplier, gestureMultiplier,
      finalConfidence, gestureId: gesture.id
    });

    return Math.min(finalConfidence, 1.0);
  }

  /**
   * Get gesture-specific confidence multiplier
   */
  private getGestureConfidenceMultiplier(gesture: TwoHandGestureDefinition): number {
    // Emergency gestures get higher confidence
    if (gesture.category === 'emergency') return 1.1;

    // Communication gestures get standard confidence
    if (gesture.category === 'communication') return 1.0;

    // Emotional gestures get slight boost for expression
    if (gesture.category === 'emotional') return 1.05;

    // Playful gestures get slight reduction (less critical)
    if (gesture.category === 'playful') return 0.95;

    return 1.0;
  }

  /**
   * Generate accessibility hints for two-hand gestures
   */
  private generateAccessibilityHints(gesture: TwoHandGestureDefinition, confidence: number): string[] {
    const hints: string[] = [];

    // Add gesture-specific hints
    hints.push(`Beide Hände: ${gesture.name}`);

    // Add confidence-based hints
    if (confidence > 0.8) {
      hints.push('Sehr sicher erkannt');
    } else if (confidence > 0.7) {
      hints.push('Gut erkannt');
    } else {
      hints.push('Versuche es nochmal für bessere Erkennung');
    }

    // Add difficulty-based hints
    if (gesture.difficulty === 'hard') {
      hints.push('Schwierige Geste - übe regelmäßig');
    }

    // Add category-specific hints
    switch (gesture.category) {
      case 'emergency':
        hints.push('Notfall-Geste erkannt - Hilfe wird geleistet');
        break;
      case 'communication':
        hints.push('Kommunikations-Geste erfolgreich');
        break;
      case 'emotional':
        hints.push('Gefühlsausdruck erkannt');
        break;
      case 'playful':
        hints.push('Spielerische Geste erkannt');
        break;
    }

    return hints;
  }

  /**
   * Generate cache key for gesture caching
   */
  private generateCacheKey(leftGesture: string, rightGesture: string, handedness: string[]): string {
    return `${leftGesture}_${rightGesture}_${handedness.join('_')}`;
  }

  /**
   * Get cached gesture if available
   */
  getCachedGesture(leftGesture: string, rightGesture: string, handedness: string[]): DetectedTwoHandGesture | null {
    const cacheKey = this.generateCacheKey(leftGesture, rightGesture, handedness);
    return this.gestureCache.get(cacheKey) || null;
  }

  /**
   * Clear gesture cache
   */
  clearCache(): void {
    this.gestureCache.clear();
    logger.info('Two-hand gesture cache cleared');
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): {
    cacheSize: number;
    averageProcessingTime: number;
    totalProcessed: number;
  } {
    const cacheSize = this.gestureCache.size;
    const processingTimes = Array.from(this.gestureCache.values()).map(g => g.processingTime);
    const averageProcessingTime = processingTimes.length > 0
      ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
      : 0;

    return {
      cacheSize,
      averageProcessingTime,
      totalProcessed: this.gestureCache.size
    };
  }

  /**
   * Get all available two-hand gestures
   */
  getAvailableGestures(): TwoHandGestureDefinition[] {
    return [...TWO_HAND_GESTURES];
  }

  /**
   * Get gestures by category
   */
  getGesturesByCategory(category: TwoHandGestureDefinition['category']): TwoHandGestureDefinition[] {
    return TWO_HAND_GESTURES.filter(g => g.category === category);
  }

  /**
   * Get gestures by difficulty
   */
  getGesturesByDifficulty(difficulty: TwoHandGestureDefinition['difficulty']): TwoHandGestureDefinition[] {
    return TWO_HAND_GESTURES.filter(g => g.difficulty === difficulty);
  }
}

// Export singleton instance
export const twoHandGestureService = TwoHandGestureService.getInstance();