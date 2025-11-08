/**
 * Gesture Meaning Service - Amy First
 *
 * Advanced service for recognising and processing coordinated gesture meanings with best practices:
 * - Intelligent gesture mapping and validation
 * - Confidence scoring optimized for multi-hand scenarios
 * - Accessibility support for visual and haptic feedback
 * - Performance monitoring and optimization
 * - Emergency gesture priority handling
 */

import {
  GESTURE_MEANINGS,
  CoordinatedGestureMeaningDefinition,
} from '../constants/gestureMeanings';
import { logger } from '../utils/logger';
import { performanceMonitor } from './performanceMonitor';

const COORDINATED_MEANINGS = GESTURE_MEANINGS.filter((meaning): meaning is CoordinatedGestureMeaningDefinition => meaning.composition === 'coordinated');

export interface DetectedGestureMeaning {
  gesture: CoordinatedGestureMeaningDefinition;
  confidence: number;
  leftHandGesture: string;
  rightHandGesture: string;
  handedness: string[];
  landmarks: number[][][];
  processingTime: number;
  validationScore: number;
  accessibilityHints: string[];
}

export interface GestureMeaningValidationResult {
  isValid: boolean;
  confidence: number;
  issues: string[];
  suggestions: string[];
  accessibilityScore: number;
}

export class GestureMeaningService {
  private static instance: GestureMeaningService;
  private gestureCache = new Map<string, DetectedGestureMeaning>();
  private readonly CONFIDENCE_THRESHOLD = 0.6; // Higher threshold for coordinated gestures
  private readonly MIN_INDIVIDUAL_CONFIDENCE = 0.4; // Minimum confidence for each hand
  private readonly MAX_PROCESSING_TIME = 100; // Max processing time in ms

  private constructor() {
    // Initialize performance monitoring
    performanceMonitor.recordMetric('gesture_meaning_service_initialized', 1);
  }

  static getInstance(): GestureMeaningService {
    if (!GestureMeaningService.instance) {
      GestureMeaningService.instance = new GestureMeaningService();
    }
    return GestureMeaningService.instance;
  }

  /**
   * Process detected coordinated gesture with comprehensive validation
   */
  async processGestureMeaning(
    leftGesture: string,
    rightGesture: string,
    leftConfidence: number,
    rightConfidence: number,
    handedness: string[],
    landmarks: number[][][]
  ): Promise<DetectedGestureMeaning | null> {
    const startTime = performance.now();

    try {
      // Validate input parameters
      const validation = this.validateCoordinatedInput(
        leftGesture, rightGesture, leftConfidence, rightConfidence, handedness, landmarks
      );

      if (!validation.isValid) {
        logger.warn('Coordinated gesture validation failed', {
          issues: validation.issues,
          leftGesture, rightGesture,
          leftConfidence, rightConfidence
        });
        return null;
      }

      // Find matching predefined gesture
      const matchedGesture = this.findMatchingGesture(leftGesture, rightGesture);

      if (!matchedGesture) {
        logger.debug('No matching coordinated gesture found', {
          leftGesture, rightGesture,
          availableGestures: COORDINATED_MEANINGS.length
        });
        return null;
      }

      // Calculate comprehensive confidence score
      const confidence = this.calculateCoordinatedConfidence(
        leftConfidence, rightConfidence, matchedGesture, validation
      );

      if (confidence < this.CONFIDENCE_THRESHOLD) {
        logger.debug('Coordinated gesture confidence too low', {
          confidence,
          threshold: this.CONFIDENCE_THRESHOLD,
          gesture: matchedGesture.id
        });
        return null;
      }

      // Generate accessibility hints
      const accessibilityHints = this.generateAccessibilityHints(matchedGesture, confidence);

      const processingTime = performance.now() - startTime;

      if (processingTime > this.MAX_PROCESSING_TIME) {
        logger.warn('Coordinated gesture processing exceeded budget', {
          processingTime,
          threshold: this.MAX_PROCESSING_TIME,
          gestureId: matchedGesture.id,
        });
      }

      // Create detected gesture object
      const detectedGesture: DetectedGestureMeaning = {
        gesture: matchedGesture,
        confidence,
        leftHandGesture: leftGesture,
        rightHandGesture: rightGesture,
        handedness,
        landmarks,
        processingTime,
        validationScore: validation.accessibilityScore,
        accessibilityHints
      };

      // Cache successful detection
      const cacheKey = this.generateCacheKey(leftGesture, rightGesture, handedness);
      this.gestureCache.set(cacheKey, detectedGesture);

      // Record performance metrics
      performanceMonitor.recordMetric('gesture_meaning_gesture_processed', 1);
      performanceMonitor.recordMetric('gesture_meaning_processing_time', detectedGesture.processingTime);

      logger.info('Coordinated gesture successfully processed', {
        gestureId: matchedGesture.id,
        confidence,
        processingTime: detectedGesture.processingTime
      });

      return detectedGesture;

    } catch (error) {
      logger.error('Error processing coordinated gesture', error, {
        leftGesture, rightGesture,
        processingTime: performance.now() - startTime
      });
      return null;
    }
  }

  /**
   * Validate coordinated gesture input parameters
   */
  private validateCoordinatedInput(
    leftGesture: string,
    rightGesture: string,
    leftConfidence: number,
    rightConfidence: number,
    handedness: string[],
    landmarks: number[][][]
  ): GestureMeaningValidationResult {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let accessibilityScore = 1.0;

    // Validate gesture strings
    if (!leftGesture || !rightGesture) {
      issues.push('Gestendaten für eine oder beide Hände fehlen');
      accessibilityScore *= 0.5;
    }

    // Validate confidence levels
    if (leftConfidence < this.MIN_INDIVIDUAL_CONFIDENCE) {
      issues.push(`Sicherheit der linken Hand zu niedrig: ${leftConfidence}`);
      suggestions.push('Zeig die linke Hand noch deutlicher');
      accessibilityScore *= 0.8;
    }

    if (rightConfidence < this.MIN_INDIVIDUAL_CONFIDENCE) {
      issues.push(`Sicherheit der rechten Hand zu niedrig: ${rightConfidence}`);
      suggestions.push('Zeig die rechte Hand noch deutlicher');
      accessibilityScore *= 0.8;
    }

    // Validate handedness
    if (!handedness || handedness.length < 2) {
      issues.push('Unzureichende Händigkeit-Daten');
      accessibilityScore *= 0.7;
    }

    // Validate landmarks
    if (!landmarks || landmarks.length < 2) {
      issues.push('Zu wenige Landmarken für die koordinierte Geste');
      accessibilityScore *= 0.6;
    }

    // Check for gesture symmetry/complementarity
    if (leftGesture === rightGesture) {
      // Same gesture on both hands - check if it's appropriate
      const matchingGestures = COORDINATED_MEANINGS.filter(g =>
        g.leftGesture === leftGesture && g.rightGesture === rightGesture
      );

      if (matchingGestures.length === 0) {
        issues.push('Identische Gesten auf beiden Händen sind möglicherweise nicht für koordinierte Gesten vorgesehen');
        suggestions.push('Nutze unterschiedliche Gesten pro Hand oder wechsle zur Einhand-Erkennung');
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
   * Find matching predefined coordinated gesture
   */
  private findMatchingGesture(leftGesture: string, rightGesture: string): CoordinatedGestureMeaningDefinition | null {
    // First try exact match
    let match = COORDINATED_MEANINGS.find(g =>
      g.leftGesture === leftGesture && g.rightGesture === rightGesture
    );

    if (match) return match;

    // Try reverse order (in case handedness detection was swapped)
    match = COORDINATED_MEANINGS.find(g =>
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
  private findFuzzyMatch(leftGesture: string, rightGesture: string): CoordinatedGestureMeaningDefinition | null {
    const gestureSimilarity = (a: string, b: string): number => {
      // Simple similarity based on common substrings
      const commonChars = [...new Set(a.split('').filter(char => b.includes(char)))].length;
      return commonChars / Math.max(a.length, b.length);
    };

    let bestMatch: CoordinatedGestureMeaningDefinition | null = null;
    let bestSimilarity = 0;

    for (const gesture of COORDINATED_MEANINGS) {
      const leftSimilarity = gestureSimilarity(leftGesture, gesture.leftGesture);
      const rightSimilarity = gestureSimilarity(rightGesture, gesture.rightGesture);
      const avgSimilarity = (leftSimilarity + rightSimilarity) / 2;

      if (avgSimilarity > bestSimilarity && avgSimilarity > 0.6) { // 60% similarity threshold
        bestMatch = gesture;
        bestSimilarity = avgSimilarity;
      }
    }

    if (bestMatch) {
      logger.debug('Found fuzzy match for coordinated gesture', {
        detected: `${leftGesture}+${rightGesture}`,
        matched: `${bestMatch.leftGesture}+${bestMatch.rightGesture}`,
        similarity: bestSimilarity,
        gestureId: bestMatch.id
      });
    }

    return bestMatch;
  }

  /**
   * Calculate comprehensive confidence score for coordinated gestures
   */
  private calculateCoordinatedConfidence(
    leftConfidence: number,
    rightConfidence: number,
    gesture: CoordinatedGestureMeaningDefinition,
    validation: GestureMeaningValidationResult
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

    logger.debug('Gesture meaning confidence calculation', {
      leftConfidence, rightConfidence, baseConfidence,
      difficultyMultiplier, validationMultiplier, gestureMultiplier,
      finalConfidence, gestureId: gesture.id
    });

    return Math.min(finalConfidence, 1.0);
  }

  /**
   * Get gesture-specific confidence multiplier
   */
  private getGestureConfidenceMultiplier(gesture: CoordinatedGestureMeaningDefinition): number {
    // Communication gestures get standard confidence
    if (gesture.category === 'communication') return 1.0;

    // Emotional gestures get slight boost for expression
    if (gesture.category === 'emotional') return 1.05;

    // Playful gestures get slight reduction (less critical)
    if (gesture.category === 'playful') return 0.95;

    return 1.0;
  }

  /**
   * Generate accessibility hints for coordinated gestures
   */
  private generateAccessibilityHints(gesture: CoordinatedGestureMeaningDefinition, confidence: number): string[] {
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
  getCachedGesture(leftGesture: string, rightGesture: string, handedness: string[]): DetectedGestureMeaning | null {
    const cacheKey = this.generateCacheKey(leftGesture, rightGesture, handedness);
    return this.gestureCache.get(cacheKey) || null;
  }

  /**
   * Clear gesture cache
   */
  clearCache(): void {
    this.gestureCache.clear();
    logger.info('Coordinated gesture cache cleared');
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
   * Get all available coordinated gestures
   */
  getAvailableGestures(): CoordinatedGestureMeaningDefinition[] {
    return [...COORDINATED_MEANINGS];
  }

  /**
   * Get gestures by category
   */
  getGesturesByCategory(category: CoordinatedGestureMeaningDefinition['category']): CoordinatedGestureMeaningDefinition[] {
    return COORDINATED_MEANINGS.filter(g => g.category === category);
  }

  /**
   * Get gestures by difficulty
   */
  getGesturesByDifficulty(difficulty: CoordinatedGestureMeaningDefinition['difficulty']): CoordinatedGestureMeaningDefinition[] {
    return COORDINATED_MEANINGS.filter(g => g.difficulty === difficulty);
  }
}

// Export singleton instance
export const gestureMeaningService = GestureMeaningService.getInstance();
