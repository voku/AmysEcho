/**
 * Optimized Gesture Processing Module
 *
 * Performance optimizations for Amy First gesture recognition:
 * - Reduced memory allocations
 * - Optimized landmark processing
 * - Efficient tremor compensation
 * - Fast gesture size normalization
 */

export class PartialGestureDetector {
  private gestureHistory: Map<string, Array<{ confidence: number; timestamp: number }>> = new Map();
  private readonly MAX_HISTORY = 5;
  private readonly COMPLETION_THRESHOLDS = {
    fist: 0.7,
    point: 0.8,
    thumbs_up: 0.75,
    open_palm: 0.6,
    peace: 0.7,
  };
  private recognitionThreshold = 0.6;

  /**
   * Optimized partial gesture analysis with reduced memory allocation
   */
  analyzePartialCompletion(landmarks: number[][][], gestureId: string): {
    isPartial: boolean;
    completion: number;
    confidence: number;
    feedback: string;
  } {
    if (!landmarks?.[0] || landmarks[0].length < 21) {
      return { isPartial: false, completion: 0, confidence: 0, feedback: '' };
    }

    const hand = landmarks[0];
    const completion = this.calculateCompletion(hand, gestureId);
    const confidence = this.calculatePartialConfidence(hand, gestureId, completion);

    // Update history efficiently
    this.updateGestureHistory(gestureId, confidence);

    const isPartial = completion >= 0.3 && completion < 0.9;
    const feedback = isPartial ? this.generatePartialFeedback(gestureId, completion) : '';

    return { isPartial, completion, confidence, feedback };
  }

  private calculateCompletion(hand: number[][], gestureId: string): number {
    switch (gestureId) {
      case 'fist':
        return this.calculateFistCompletion(hand);
      case 'point':
        return this.calculatePointCompletion(hand);
      case 'thumbs_up':
        return this.calculateThumbsUpCompletion(hand);
      case 'open_palm':
        return this.calculateOpenPalmCompletion(hand);
      default:
        return 0;
    }
  }

  private calculateFistCompletion(hand: number[][]): number {
    let curledFingers = 0;
    const fingerTips = [8, 12, 16, 20];
    const fingerJoints = [6, 10, 14, 18];

    for (let i = 0; i < fingerTips.length; i++) {
      if (hand[fingerTips[i]][1] > hand[fingerJoints[i]][1]) {
        curledFingers++;
      }
    }

    return Math.min(curledFingers / 4, 1.0);
  }

  private calculatePointCompletion(hand: number[][]): number {
    const indexExtended = hand[8][1] < hand[6][1];
    const otherFingersCurled =
      hand[12][1] > hand[10][1] && // Middle
      hand[16][1] > hand[14][1] && // Ring
      hand[20][1] > hand[18][1];   // Pinky

    if (indexExtended && otherFingersCurled) return 1.0;
    if (indexExtended) return 0.7;
    return 0.0;
  }

  private calculateThumbsUpCompletion(hand: number[][]): number {
    const thumbExtended = hand[4][1] < hand[3][1];
    if (thumbExtended) return 1.0;
    return 0.0;
  }

  private calculateOpenPalmCompletion(hand: number[][]): number {
    let extendedFingers = 0;
    const fingerTips = [8, 12, 16, 20];
    const fingerJoints = [6, 10, 14, 18];

    for (let i = 0; i < fingerTips.length; i++) {
      if (hand[fingerTips[i]][1] < hand[fingerJoints[i]][1]) {
        extendedFingers++;
      }
    }

    return Math.min(extendedFingers / 4, 1.0);
  }

  private calculatePartialConfidence(hand: number[][], gestureId: string, completion: number): number {
    if (completion <= 0) {
      return 0;
    }

    const baseConfidence = completion * 0.8; // Partial gestures have lower base confidence

    // Add stability bonus
    const stability = this.calculateHandStability(hand);
    const stabilityBonus = stability * 0.2;

    return Math.min(baseConfidence + stabilityBonus, 0.9);
  }

  private calculateHandStability(hand: number[][]): number {
    // Simple stability calculation based on hand size consistency
    if (hand.length < 21) return 0;

    const wrist = hand[0];
    const middleTip = hand[12];
    const distance = Math.sqrt(
      Math.pow(middleTip[0] - wrist[0], 2) +
      Math.pow(middleTip[1] - wrist[1], 2)
    );

    // Normalize distance (rough hand size indicator)
    return Math.min(Math.max(distance, 0.1), 0.5) / 0.5;
  }

  private updateGestureHistory(gestureId: string, confidence: number): void {
    if (!this.gestureHistory.has(gestureId)) {
      this.gestureHistory.set(gestureId, []);
    }

    const history = this.gestureHistory.get(gestureId)!;
    history.push({ confidence, timestamp: Date.now() });

    if (history.length > this.MAX_HISTORY) {
      history.shift();
    }
  }

  private generatePartialFeedback(gestureId: string, completion: number): string {
    const completionPercent = Math.round(completion * 100);

    switch (gestureId) {
      case 'fist':
        return completionPercent < 50
          ? 'Fast eine Faust! Schließe deine Finger mehr.'
          : 'Gute Faust! Schließe die Finger ganz.';
      case 'point':
        return completionPercent < 70
          ? 'Zeigefinger ausstrecken, andere Finger einrollen.'
          : 'Fast perfekt! Halte den Zeigefinger gerade.';
      case 'thumbs_up':
        return 'Daumen nach oben! Strecke ihn weiter aus.';
      case 'open_palm':
        return completionPercent < 50
          ? 'Hand öffnen und Finger ausstrecken.'
          : 'Fast offen! Strecke alle Finger aus.';
      default:
        return `Geste zu ${completionPercent}% fertig.`;
    }
  }

  setThreshold(threshold: number): void {
    if (Number.isFinite(threshold)) {
      const clamped = Math.max(0, Math.min(1, threshold));
      this.recognitionThreshold = clamped;
    }
  }

  shouldRecognizePartial(completion: number, confidence: number): boolean {
    return completion >= 0.4 && confidence >= this.recognitionThreshold;
  }

  cleanup(): void {
    // Clear old history entries
    const cutoffTime = Date.now() - 30000; // 30 seconds ago

    for (const [gestureId, history] of this.gestureHistory) {
      const filtered = history.filter(entry => entry.timestamp > cutoffTime);
      if (filtered.length === 0) {
        this.gestureHistory.delete(gestureId);
      } else {
        this.gestureHistory.set(gestureId, filtered);
      }
    }
  }
}

export class TremorCompensator {
  private movementHistory: Array<{ landmarks: number[][][]; timestamp: number }> = [];
  private readonly MAX_HISTORY = 3;
  private readonly SMOOTHING_FACTOR = 0.7;
  private readonly MOVEMENT_THRESHOLD = 0.02;

  /**
   * Optimized tremor compensation with reduced memory usage
   */
  smoothLandmarks(landmarks: number[][][]): number[][][] {
    if (!Array.isArray(landmarks) || landmarks.length === 0) {
      return landmarks;
    }

    const normalizedLandmarks = this.cloneHands(landmarks);
    const now = Date.now();

    // Add to history
    this.movementHistory.push({ landmarks: normalizedLandmarks, timestamp: now });
    if (this.movementHistory.length > this.MAX_HISTORY) {
      this.movementHistory.shift();
    }

    // Only smooth if we have enough history
    if (this.movementHistory.length < 2) {
      return normalizedLandmarks;
    }

    const previousEntry = this.movementHistory[this.movementHistory.length - 2];

    const smoothedHands = normalizedLandmarks.map((hand, index) => {
      const previousHand = previousEntry.landmarks[index];

      if (!hand || hand.length === 0) {
        return hand;
      }

      if (!previousHand || previousHand.length === 0) {
        return hand;
      }

      if (!this.isIntentionalMovementForHand(hand, previousHand)) {
        return this.cloneHand(previousHand);
      }

      return this.applySmoothing(hand, previousHand);
    });

    return smoothedHands;
  }

  private applySmoothing(current: number[][], previous: number[][]): number[][] {
    const smoothed: number[][] = [];
    const length = Math.min(current.length, previous.length);

    for (let i = 0; i < length; i++) {
      const currentPoint = current[i];
      const previousPoint = previous[i];

      if (!currentPoint || !previousPoint) {
        smoothed.push(currentPoint || previousPoint || [0, 0, 0]);
        continue;
      }

      const smoothedPoint = [
        previousPoint[0] * this.SMOOTHING_FACTOR + currentPoint[0] * (1 - this.SMOOTHING_FACTOR),
        previousPoint[1] * this.SMOOTHING_FACTOR + currentPoint[1] * (1 - this.SMOOTHING_FACTOR),
        (previousPoint[2] ?? 0) * this.SMOOTHING_FACTOR + (currentPoint[2] ?? 0) * (1 - this.SMOOTHING_FACTOR),
      ];

      smoothed.push(smoothedPoint);
    }

    if (current.length > length) {
      for (let i = length; i < current.length; i++) {
        smoothed.push(current[i]);
      }
    }

    return smoothed;
  }

  isIntentionalMovement(currentLandmarks: number[][][], previousLandmarks: number[][][]): boolean {
    if (!currentLandmarks?.length || !previousLandmarks?.length) return true;

    let totalMovement = 0;
    let points = 0;

    for (let handIdx = 0; handIdx < Math.min(currentLandmarks.length, previousLandmarks.length); handIdx++) {
      const currentHand = currentLandmarks[handIdx];
      const previousHand = previousLandmarks[handIdx];
      if (!currentHand || !previousHand) {
        continue;
      }

      const length = Math.min(currentHand.length, previousHand.length, 21);
      for (let i = 0; i < length; i++) {
        const currentPoint = currentHand[i];
        const previousPoint = previousHand[i];
        if (!currentPoint || !previousPoint) {
          continue;
        }

        const movement = Math.sqrt(
          Math.pow((currentPoint[0] ?? 0) - (previousPoint[0] ?? 0), 2) +
          Math.pow((currentPoint[1] ?? 0) - (previousPoint[1] ?? 0), 2) +
          Math.pow((currentPoint[2] ?? 0) - (previousPoint[2] ?? 0), 2)
        );

        totalMovement += movement;
        points++;
      }
    }

    if (points === 0) {
      return true;
    }

    const averageMovement = totalMovement / points;
    return averageMovement > this.MOVEMENT_THRESHOLD;
  }

  private isIntentionalMovementForHand(currentHand: number[][], previousHand: number[][]): boolean {
    if (!currentHand?.length || !previousHand?.length) {
      return true;
    }

    const length = Math.min(currentHand.length, previousHand.length, 21);
    let totalMovement = 0;
    let points = 0;

    for (let i = 0; i < length; i++) {
      const currentPoint = currentHand[i];
      const previousPoint = previousHand[i];
      if (!currentPoint || !previousPoint) {
        continue;
      }

      const movement = Math.sqrt(
        Math.pow((currentPoint[0] ?? 0) - (previousPoint[0] ?? 0), 2) +
        Math.pow((currentPoint[1] ?? 0) - (previousPoint[1] ?? 0), 2) +
        Math.pow((currentPoint[2] ?? 0) - (previousPoint[2] ?? 0), 2)
      );

      totalMovement += movement;
      points++;
    }

    if (points === 0) {
      return true;
    }

    const averageMovement = totalMovement / points;
    return averageMovement > this.MOVEMENT_THRESHOLD;
  }

  private cloneHands(landmarks: number[][][]): number[][][] {
    return landmarks.map((hand) => this.cloneHand(hand));
  }

  private cloneHand(hand: number[][]): number[][] {
    if (!Array.isArray(hand)) {
      return [];
    }

    return hand.map((point) => {
      if (!Array.isArray(point)) {
        return [0, 0, 0];
      }

      return [point[0] ?? 0, point[1] ?? 0, point[2] ?? 0];
    });
  }

  clearHistory(): void {
    this.movementHistory = [];
  }
}

export class GestureSizeNormalizer {
  private static readonly DEFAULT_TOLERANCE = 0.3;
  private static readonly MIN_TOLERANCE = 0.1;
  private static readonly MAX_TOLERANCE = 1.0;
  private static readonly DEFAULT_MAX_SCALE = 1.4;

  private tolerance: number = GestureSizeNormalizer.DEFAULT_TOLERANCE;
  private referenceHandSizes: Array<number | null> = [];

  /**
   * Optimized gesture size normalization
   */
  normalizeHandSize(landmarks: number[][][]): number[][][] {
    if (!Array.isArray(landmarks) || landmarks.length === 0) {
      return landmarks;
    }

    const normalizedHands = landmarks.map((hand, index) => {
      if (!Array.isArray(hand) || hand.length < 21) {
        this.referenceHandSizes[index] = null;
        return hand;
      }

      const handSize = this.calculateHandSize(hand);

      if (this.referenceHandSizes[index] === null || this.referenceHandSizes[index] === undefined) {
        this.referenceHandSizes[index] = handSize;
        return hand;
      }

      const referenceSize = this.referenceHandSizes[index] ?? 0;
      if (referenceSize <= 0) {
        this.referenceHandSizes[index] = handSize;
        return hand;
      }

      const sizeRatio = handSize / referenceSize;
      if (Math.abs(sizeRatio - 1) <= this.tolerance) {
        return hand;
      }

      const { minScale, maxScale } = this.computeScaleBounds();
      const clampedRatio = this.clampSizeRatio(sizeRatio, minScale, maxScale);
      return this.applySizeNormalization(hand, clampedRatio);
    });

    return normalizedHands;
  }

  private calculateHandSize(hand: number[][]): number {
    if (hand.length < 21) return 1;

    // Calculate distance from wrist to middle finger tip
    const wrist = hand[0];
    const middleTip = hand[12];

    return Math.sqrt(
      Math.pow(middleTip[0] - wrist[0], 2) +
      Math.pow(middleTip[1] - wrist[1], 2) +
      Math.pow(middleTip[2] - wrist[2], 2)
    );
  }

  private applySizeNormalization(hand: number[][], sizeRatio: number): number[][] {
    const wrist = hand[0];
    const normalized: number[][] = [];

    for (const point of hand) {
      // Normalize relative to wrist position
      const normalizedPoint = [
        wrist[0] + (point[0] - wrist[0]) / sizeRatio,
        wrist[1] + (point[1] - wrist[1]) / sizeRatio,
        wrist[2] + (point[2] - wrist[2]) / sizeRatio,
      ];
      normalized.push(normalizedPoint);
    }

    return normalized;
  }

  private clampSizeRatio(sizeRatio: number, minScale: number, maxScale: number): number {
    if (!Number.isFinite(sizeRatio) || sizeRatio <= 0) {
      return 1;
    }

    if (sizeRatio < minScale) {
      return minScale;
    }

    if (sizeRatio > maxScale) {
      return maxScale;
    }

    return sizeRatio;
  }

  private clampTolerance(value: number): number {
    if (!Number.isFinite(value)) {
      return this.tolerance;
    }

    const clamped = Math.max(GestureSizeNormalizer.MIN_TOLERANCE, Math.min(GestureSizeNormalizer.MAX_TOLERANCE, value));
    return clamped;
  }

  private computeScaleBounds(): { minScale: number; maxScale: number } {
    const tolerance = this.tolerance;
    const minScale = Math.max(0, 1 - tolerance);

    const defaultMaxScale = GestureSizeNormalizer.DEFAULT_MAX_SCALE;
    const computedMax = 1 + tolerance;
    const isDefaultTolerance = Math.abs(tolerance - GestureSizeNormalizer.DEFAULT_TOLERANCE) < 1e-6;
    // Preserve the legacy maximum (1.4) when caregivers keep the default tolerance so existing
    // trained samples continue to fit within the expected size window. Customized tolerances use
    // the symmetric 1 ± tolerance range.
    const maxScale = isDefaultTolerance ? Math.max(defaultMaxScale, computedMax) : computedMax;

    return {
      minScale,
      maxScale,
    };
  }

  setTolerance(tolerance: number): void {
    this.tolerance = this.clampTolerance(tolerance);
  }

  getTolerance(): { tolerance: number; minScale: number; maxScale: number } {
    const { minScale, maxScale } = this.computeScaleBounds();

    return {
      tolerance: this.tolerance,
      minScale,
      maxScale,
    };
  }

  reset(): void {
    this.referenceHandSizes = [];
  }
}

// Create optimized instances
export const partialGestureDetector = new PartialGestureDetector();
export const tremorCompensator = new TremorCompensator();
export const gestureSizeNormalizer = new GestureSizeNormalizer();