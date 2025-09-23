/**
 * Enhanced detection accuracy system
 * Improves conflict resolution between detection methods and enhances rule-based detection
 */

import { OptimizedTremorCompensator } from './OptimizedTremorCompensator';
import { GestureSizeNormalizer } from '../gestureProcessing';
import { PartialGestureDetector } from '../gestureProcessing';

export interface DetectionResult {
  gesture: string;
  confidence: number;
  method: 'mediapipe' | 'mlp' | 'rule_based' | 'partial' | 'fallback';
  landmarks?: number[][][];
  metadata?: any;
}

export interface ConflictResolutionResult {
  finalGesture: string;
  finalConfidence: number;
  methodUsed: DetectionResult['method'] | 'none';
  alternatives: DetectionResult[];
  confidence: number;
  reasoning: string;
}

export interface AccuracyStats {
  totalGestures: number;
  /**
   * @deprecated Use `averageCandidateConfidence` instead. This property will be removed in a future version.
   */
  averageConfidence: number;
  averageCandidateConfidence: number;
  averageFinalConfidence: number;
  methodDistribution: Record<string, number>;
  historicalConfidence: Record<string, number>;
}

export class DetectionAccuracyEnhancer {
  private confidenceHistory: Map<string, number[]> = new Map();
  private methodUsage: Map<DetectionResult['method'], number> = new Map();
  private totalConfidenceSum = 0;
  private totalFinalConfidenceSum = 0;
  private totalGestureObservations = 0;
  private totalResolvedGestures = 0;
  private readonly HISTORY_SIZE = 5;
  private readonly CONFIDENCE_THRESHOLD_HIGH = 0.8;
  private readonly CONFIDENCE_THRESHOLD_MEDIUM = 0.6;
  private readonly CONFIDENCE_THRESHOLD_LOW = 0.4;
  private readonly HISTORICAL_CONFIDENCE_THRESHOLD = 0.7;
  private readonly BOOSTED_CONFIDENCE_CAP = 0.95;
  private readonly HISTORICAL_BONUS_FACTOR = 0.9;
  private readonly CONFIDENCE_TIE_THRESHOLD = 0.05;
  private readonly METHOD_PRIORITY: Record<DetectionResult['method'], number> = {
    mediapipe: 4,
    mlp: 3,
    rule_based: 2,
    partial: 1,
    fallback: 0,
  };
  private readonly defaultTremorCompensator: OptimizedTremorCompensator = {
    smoothLandmarks: (data: number[][][]) => data,
  } as OptimizedTremorCompensator;
  private readonly defaultSizeNormalizer: GestureSizeNormalizer = {
    normalizeHandSize: (data: number[][][]) => data,
  } as GestureSizeNormalizer;
  private readonly defaultPartialDetector = new PartialGestureDetector();

  /**
   * Resolve conflicts between multiple detection methods
   */
  resolveConflicts(detectionResults: DetectionResult[]): ConflictResolutionResult {
    if (detectionResults.length === 0) {
      return this.createEmptyResult();
    }

    detectionResults.forEach(result => this.recordDetectionResult(result));

    if (detectionResults.length === 1) {
      return this.applyConflictResolution(detectionResults);
    }

    // Group results by gesture
    const gestureGroups = this.groupByGesture(detectionResults);

    // Find the best result for each gesture
    const bestResults = this.findBestResultsPerGesture(gestureGroups);

    // Apply conflict resolution logic
    const resolution = this.applyConflictResolution(bestResults);

    return resolution;
  }

  /**
   * Enhance rule-based gesture detection with machine learning insights
   */
  enhanceRuleBasedDetection(
    landmarks: number[][][],
    tremorCompensator: OptimizedTremorCompensator | undefined,
    sizeNormalizer: GestureSizeNormalizer | undefined,
    partialDetector: PartialGestureDetector | undefined
  ): DetectionResult[] {
    if (!landmarks || landmarks.length === 0) {
      return [];
    }

    const safeTremor = tremorCompensator ?? this.defaultTremorCompensator;
    const safeNormalizer = sizeNormalizer ?? this.defaultSizeNormalizer;
    const safePartialDetector = partialDetector ?? this.defaultPartialDetector;

    // Apply preprocessing before validating landmark density so mocks are exercised
    const processedLandmarks = this.preprocessLandmarks(landmarks, safeTremor, safeNormalizer);

    if (!processedLandmarks || processedLandmarks.length === 0) {
      return [];
    }

    const hand = processedLandmarks[0];
    const hasSufficientLandmarks = Array.isArray(hand) && hand.length >= 21;
    const basicGestures = hasSufficientLandmarks ? this.detectBasicGesturesEnhanced(hand) : [];

    // Add partial gesture analysis
    const partialResults = this.analyzePartialGestures(processedLandmarks, safePartialDetector);

    // Combine and rank results
    const combinedResults = [...basicGestures, ...partialResults];
    if (combinedResults.length === 0) {
      return [];
    }

    const rankedResults = this.rankDetectionResults(combinedResults);

    const topResults = rankedResults.slice(0, 3);

    return topResults; // Return top 3 results
  }

  /**
   * Preprocess landmarks for better detection
   */
  private preprocessLandmarks(
    landmarks: number[][][],
    tremorCompensator: OptimizedTremorCompensator,
    sizeNormalizer: GestureSizeNormalizer
  ): number[][][] {
    let processed = landmarks;

    // Apply tremor compensation
    const smoothed = tremorCompensator.smoothLandmarks(processed);
    processed = Array.isArray(smoothed) ? smoothed : processed;

    // Apply size normalization
    const normalized = sizeNormalizer.normalizeHandSize(processed);
    processed = Array.isArray(normalized) ? normalized : processed;

    return processed;
  }

  /**
   * Enhanced basic gesture detection with improved heuristics
   */
  private detectBasicGesturesEnhanced(hand: number[][]): DetectionResult[] {
    const results: DetectionResult[] = [];

    // Multi-factor gesture detection
    const fingerStates = this.analyzeFingerStates(hand);
    const palmOrientation = this.analyzePalmOrientation(hand);
    const handShape = this.analyzeHandShape(hand, fingerStates);

    // Thumbs up detection
    const thumbsUpConfidence = this.calculateThumbsUpConfidence(fingerStates, palmOrientation);
    if (thumbsUpConfidence > 0.3) {
      results.push({
        gesture: 'thumbs_up',
        confidence: thumbsUpConfidence,
        method: 'rule_based',
        metadata: { fingerStates, palmOrientation }
      });
    }

    // Open palm detection
    const openPalmConfidence = this.calculateOpenPalmConfidence(fingerStates, handShape);
    if (openPalmConfidence > 0.3) {
      results.push({
        gesture: 'open_palm',
        confidence: openPalmConfidence,
        method: 'rule_based',
        metadata: { fingerStates, handShape }
      });
    }

    // Fist detection
    const fistConfidence = this.calculateFistConfidence(fingerStates, handShape);
    if (fistConfidence > 0.3) {
      results.push({
        gesture: 'fist',
        confidence: fistConfidence,
        method: 'rule_based',
        metadata: { fingerStates, handShape }
      });
    }

    // Point detection
    const pointConfidence = this.calculatePointConfidence(fingerStates);
    if (pointConfidence > 0.3) {
      results.push({
        gesture: 'point',
        confidence: pointConfidence,
        method: 'rule_based',
        metadata: { fingerStates }
      });
    }

    return results;
  }

  /**
   * Analyze individual finger states
   */
  private analyzeFingerStates(hand: number[][]): {
    thumb: 'extended' | 'curled' | 'unknown';
    index: 'extended' | 'curled' | 'unknown';
    middle: 'extended' | 'curled' | 'unknown';
    ring: 'extended' | 'curled' | 'unknown';
    pinky: 'extended' | 'curled' | 'unknown';
  } {
    type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
    type FingerState = 'extended' | 'curled' | 'unknown';

    const fingerIndexPairs: Record<FingerName, Array<{ tip: number; joint: number }>> = {
      thumb: [
        { tip: 3, joint: 2 },
        { tip: 4, joint: 3 },
      ],
      index: [
        { tip: 7, joint: 5 },
        { tip: 8, joint: 6 },
      ],
      middle: [
        { tip: 11, joint: 9 },
        { tip: 12, joint: 10 },
      ],
      ring: [
        { tip: 15, joint: 13 },
        { tip: 16, joint: 14 },
      ],
      pinky: [
        { tip: 19, joint: 17 },
        { tip: 20, joint: 18 },
      ],
    };

    const tolerance = 0.005;

    const states: Record<FingerName, FingerState> = {
      thumb: 'unknown',
      index: 'unknown',
      middle: 'unknown',
      ring: 'unknown',
      pinky: 'unknown',
    };

    (Object.keys(fingerIndexPairs) as FingerName[]).forEach(finger => {
      const pairs = fingerIndexPairs[finger];
      const availablePair = pairs.find(({ tip, joint }) => hand[tip] && hand[joint]);

      if (!availablePair) {
        return;
      }

      const tip = hand[availablePair.tip];
      const joint = hand[availablePair.joint];

      if (!tip || !joint || tip.length < 2 || joint.length < 2) {
        return;
      }

      const delta = tip[1] - joint[1];

      if (delta < -tolerance) {
        states[finger] = 'extended';
      } else if (delta > tolerance) {
        states[finger] = 'curled';
      }
    });

    return states;
  }

  /**
   * Analyze palm orientation
   */
  private analyzePalmOrientation(hand: number[][]): 'upright' | 'tilted' | 'unknown' {
    // Simplified palm orientation analysis
    const wrist = hand[0];
    const middleBase = hand[9];

    if (!wrist || !middleBase) return 'unknown';

    const angle = Math.atan2(middleBase[1] - wrist[1], middleBase[0] - wrist[0]);
    const angleDegrees = (angle * 180) / Math.PI;

    // Consider palm upright if angle is within reasonable range
    if (Math.abs(angleDegrees) < 45) {
      return 'upright';
    }

    return 'tilted';
  }

  /**
   * Analyze overall hand shape
   */
  private analyzeHandShape(
    hand: number[][],
    fingerStates?: ReturnType<DetectionAccuracyEnhancer['analyzeFingerStates']>
  ): 'open' | 'closed' | 'partial' | 'unknown' {
    const states = fingerStates ?? this.analyzeFingerStates(hand);
    const extendedCount = Object.values(states).filter(state => state === 'extended').length;

    if (extendedCount >= 4) return 'open';
    if (extendedCount <= 1) return 'closed';
    if (extendedCount >= 2 && extendedCount <= 3) return 'partial';

    return 'unknown';
  }

  /**
   * Calculate confidence scores for different gestures
   */
  private calculateThumbsUpConfidence(
    fingerStates: ReturnType<DetectionAccuracyEnhancer['analyzeFingerStates']>,
    palmOrientation: ReturnType<DetectionAccuracyEnhancer['analyzePalmOrientation']>
  ): number {
    type FingerStates = ReturnType<DetectionAccuracyEnhancer['analyzeFingerStates']>;
    type OtherFingers = Exclude<keyof FingerStates, 'thumb'>;

    let confidence = 0;

    // Thumb should be extended
    if (fingerStates.thumb === 'extended') confidence += 0.4;

    // Other fingers should be curled
    const otherFingers: OtherFingers[] = ['index', 'middle', 'ring', 'pinky'];
    const curledCount = otherFingers.filter(finger => fingerStates[finger] === 'curled').length;
    confidence += (curledCount / 4) * 0.4;

    // Palm orientation bonus
    if (palmOrientation === 'upright') confidence += 0.2;

    return Math.min(confidence, 1.0);
  }

  private calculateOpenPalmConfidence(
    fingerStates: ReturnType<DetectionAccuracyEnhancer['analyzeFingerStates']>,
    handShape: ReturnType<DetectionAccuracyEnhancer['analyzeHandShape']>
  ): number {
    if (handShape === 'open') return 0.9;

    const extendedCount = Object.values(fingerStates).filter(state => state === 'extended').length;
    return extendedCount / 5;
  }

  private calculateFistConfidence(
    fingerStates: ReturnType<DetectionAccuracyEnhancer['analyzeFingerStates']>,
    handShape: ReturnType<DetectionAccuracyEnhancer['analyzeHandShape']>
  ): number {
    if (handShape === 'closed') return 0.9;

    const curledCount = Object.values(fingerStates).filter(state => state === 'curled').length;
    return curledCount / 5;
  }

  private calculatePointConfidence(
    fingerStates: ReturnType<DetectionAccuracyEnhancer['analyzeFingerStates']>
  ): number {
    type FingerStates = ReturnType<DetectionAccuracyEnhancer['analyzeFingerStates']>;
    type OtherFingers = Extract<keyof FingerStates, 'middle' | 'ring' | 'pinky'>;

    let confidence = 0;

    // Index should be extended
    if (fingerStates.index === 'extended') confidence += 0.5;

    // Other fingers should be curled
    const otherFingers: OtherFingers[] = ['middle', 'ring', 'pinky'];
    const curledCount = otherFingers.filter(finger => fingerStates[finger] === 'curled').length;
    confidence += (curledCount / 3) * 0.4;

    // Thumb can be either
    confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  /**
   * Analyze partial gestures
   */
  private analyzePartialGestures(
    landmarks: number[][][],
    partialDetector: PartialGestureDetector
  ): DetectionResult[] {
    const results: DetectionResult[] = [];
    const commonGestures = ['thumbs_up', 'open_palm', 'fist', 'point'];

    commonGestures.forEach(gesture => {
      const partial = partialDetector.analyzePartialCompletion(landmarks, gesture);
      if (partial?.isPartial) {
        results.push({
          gesture,
          confidence: partial.confidence,
          method: 'partial',
          metadata: {
            completion: partial.completion,
            feedback: partial.feedback
          }
        });
      }
    });

    return results;
  }

  /**
   * Rank detection results by confidence and consistency
   */
  private rankDetectionResults(results: DetectionResult[]): DetectionResult[] {
    return results.sort((a, b) => {
      // Primary sort by confidence
      if (Math.abs(a.confidence - b.confidence) > 0.1) {
        return b.confidence - a.confidence;
      }

      // Secondary sort by method priority
      return this.METHOD_PRIORITY[b.method] - this.METHOD_PRIORITY[a.method];
    });
  }

  /**
   * Group detection results by gesture
   */
  private groupByGesture(results: DetectionResult[]): Map<string, DetectionResult[]> {
    const groups = new Map<string, DetectionResult[]>();

    results.forEach(result => {
      if (!groups.has(result.gesture)) {
        groups.set(result.gesture, []);
      }
      groups.get(result.gesture)!.push(result);
    });

    return groups;
  }

  /**
   * Find best result for each gesture
   */
  private findBestResultsPerGesture(gestureGroups: Map<string, DetectionResult[]>): DetectionResult[] {
    const bestResults: DetectionResult[] = [];

    gestureGroups.forEach(results => {
      const sortedByConfidence = [...results].sort((a, b) => b.confidence - a.confidence);
      const top = sortedByConfidence[0];
      const tiedResults = sortedByConfidence.filter(
        candidate => Math.abs(candidate.confidence - top.confidence) < this.CONFIDENCE_TIE_THRESHOLD
      );

      if (tiedResults.length > 1) {
        tiedResults.sort(
          (a, b) => this.METHOD_PRIORITY[b.method] - this.METHOD_PRIORITY[a.method]
        );
        const chosen = tiedResults[0];
        bestResults.push({
          ...chosen,
          metadata: {
            ...(chosen.metadata || {}),
            conflictReason: 'Method priority tiebreaker',
          },
        });
        return;
      }

      bestResults.push(top);
    });

    return bestResults;
  }

  /**
   * Apply conflict resolution logic
   */
  private applyConflictResolution(results: DetectionResult[]): ConflictResolutionResult {
    if (results.length === 0) {
      return this.createEmptyResult();
    }

    const enriched = results.map(result => {
      const historicalConfidence = this.getHistoricalConfidence(result.gesture);
      const boostedConfidence =
        historicalConfidence > this.HISTORICAL_CONFIDENCE_THRESHOLD
          ? Math.max(
              result.confidence,
              Math.min(
                this.BOOSTED_CONFIDENCE_CAP,
                historicalConfidence * this.HISTORICAL_BONUS_FACTOR
              )
            )
          : result.confidence;

      return {
        result,
        boostedConfidence,
        historicalConfidence,
      };
    });

    enriched.sort((a, b) => {
      if (Math.abs(a.boostedConfidence - b.boostedConfidence) > this.CONFIDENCE_TIE_THRESHOLD) {
        return b.boostedConfidence - a.boostedConfidence;
      }

      if (Math.abs(a.result.confidence - b.result.confidence) > this.CONFIDENCE_TIE_THRESHOLD) {
        return b.result.confidence - a.result.confidence;
      }

      return this.METHOD_PRIORITY[b.result.method] - this.METHOD_PRIORITY[a.result.method];
    });

    const best = enriched[0];
    const alternatives = enriched.slice(1).map(entry => entry.result);
    const finalConfidence = best.boostedConfidence;

    let reasoning: string;
    if (best.boostedConfidence > best.result.confidence) {
      reasoning = 'Historical consistency bonus';
    } else if (
      finalConfidence >= this.CONFIDENCE_THRESHOLD_HIGH ||
      (finalConfidence >= this.CONFIDENCE_THRESHOLD_MEDIUM && enriched.length === 1)
    ) {
      reasoning = 'Clear high-confidence result';
    } else {
      reasoning = best.result.metadata?.conflictReason ?? 'Best ranked candidate';
    }

    this.totalFinalConfidenceSum += finalConfidence;
    this.totalResolvedGestures += 1;
    this.updateConfidenceHistory(best.result.gesture, finalConfidence);

    return {
      finalGesture: best.result.gesture,
      finalConfidence,
      methodUsed: best.result.method,
      alternatives,
      confidence: best.result.confidence,
      reasoning,
    };
  }

  /**
   * Record detection statistics for accuracy tracking
   */
  private recordDetectionResult(result: DetectionResult): void {
    this.methodUsage.set(result.method, (this.methodUsage.get(result.method) ?? 0) + 1);
    this.totalConfidenceSum += result.confidence;
    this.totalGestureObservations += 1;
  }

  /**
   * Update confidence history for learning
   */
  private updateConfidenceHistory(gesture: string, confidence: number): void {
    if (!this.confidenceHistory.has(gesture)) {
      this.confidenceHistory.set(gesture, []);
    }

    const history = this.confidenceHistory.get(gesture)!;
    history.push(confidence);

    if (history.length > this.HISTORY_SIZE) {
      history.shift();
    }
  }

  /**
   * Get historical confidence for a gesture
   */
  private getHistoricalConfidence(gesture: string): number {
    const history = this.confidenceHistory.get(gesture);
    if (!history || history.length === 0) return 0;

    const avgConfidence = history.reduce((sum, conf) => sum + conf, 0) / history.length;
    return avgConfidence;
  }

  /**
   * Create empty conflict resolution result
   */
  private createEmptyResult(): ConflictResolutionResult {
    return {
      finalGesture: '',
      finalConfidence: 0,
      methodUsed: 'none',
      alternatives: [],
      confidence: 0,
      reasoning: 'No detection results available'
    };
  }

  /**
   * Get detection accuracy statistics
   */
  getAccuracyStats(): AccuracyStats {
    const methodDistribution: Record<string, number> = {};
    this.methodUsage.forEach((count, method) => {
      methodDistribution[method] = count;
    });

    const historicalConfidence: Record<string, number> = {};

    this.confidenceHistory.forEach((history, gesture) => {
      historicalConfidence[gesture] = history.reduce((sum, conf) => sum + conf, 0) / history.length;
    });

    const averageCandidateConfidence =
      this.totalGestureObservations > 0
        ? this.totalConfidenceSum / this.totalGestureObservations
        : 0;
    const averageFinalConfidence =
      this.totalResolvedGestures > 0
        ? this.totalFinalConfidenceSum / this.totalResolvedGestures
        : 0;

    return {
      totalGestures: this.totalGestureObservations,
      averageConfidence: averageCandidateConfidence,
      averageCandidateConfidence,
      averageFinalConfidence,
      methodDistribution,
      historicalConfidence
    };
  }

  /**
   * Reset accuracy tracking
   */
  reset(): void {
    this.confidenceHistory.clear();
    this.methodUsage.clear();
    this.totalConfidenceSum = 0;
    this.totalFinalConfidenceSum = 0;
    this.totalGestureObservations = 0;
    this.totalResolvedGestures = 0;
  }
}
