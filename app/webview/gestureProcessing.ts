/**
 * Gesture processing utilities for Amy's Echo
 * Contains classes for normalizing gestures, detecting partial completion, and compensating for tremors
 */

// Gesture size tolerance and normalization system
export class GestureSizeNormalizer {
  private baseHandSize: number | null = null;
  private sizeTolerance = 0.3; // How much size variation to allow (30%)
  private minScale = 0.7; // Minimum allowed scale
  private maxScale = 1.4; // Maximum allowed scale

  /**
   * Set the tolerance level for gesture sizes
   */
  setTolerance(tolerance: number): void {
    this.sizeTolerance = Math.max(0.1, Math.min(1.0, tolerance));
    this.minScale = 1 - this.sizeTolerance;
    this.maxScale = 1 + this.sizeTolerance;
  }

  /**
   * Normalize hand landmarks to a standard size
   */
  normalizeHandSize(landmarks: number[][][]): number[][][] {
    if (landmarks.length === 0) return landmarks;

    const normalized = JSON.parse(JSON.stringify(landmarks));

    for (let handIdx = 0; handIdx < landmarks.length; handIdx++) {
      const hand = landmarks[handIdx];
      if (!hand || hand.length < 21) continue;

      // Calculate current hand size (distance between wrist and middle finger tip)
      const wrist = hand[0]; // Wrist landmark
      const middleTip = hand[12]; // Middle finger tip
      const currentSize = Math.sqrt(
        Math.pow(middleTip[0] - wrist[0], 2) +
        Math.pow(middleTip[1] - wrist[1], 2)
      );

      // Set base size on first valid measurement
      if (this.baseHandSize === null && currentSize > 0) {
        this.baseHandSize = currentSize;
      }

      if (this.baseHandSize && currentSize > 0) {
        // Calculate scale factor
        let scaleFactor = this.baseHandSize / currentSize;

        // Clamp scale factor to tolerance range
        scaleFactor = Math.max(this.minScale, Math.min(this.maxScale, scaleFactor));

        // Apply scaling to all landmarks relative to wrist
        for (let pointIdx = 0; pointIdx < hand.length; pointIdx++) {
          const point = hand[pointIdx];
          if (!point) continue;

          // Scale relative to wrist position
          const scaledX = wrist[0] + (point[0] - wrist[0]) * scaleFactor;
          const scaledY = wrist[1] + (point[1] - wrist[1]) * scaleFactor;
          const scaledZ = point[2] ? wrist[2] + (point[2] - wrist[2]) * scaleFactor : point[2];

          normalized[handIdx][pointIdx] = [scaledX, scaledY, scaledZ];
        }
      }
    }

    return normalized;
  }

  /**
   * Reset the base hand size (useful when switching users or sessions)
   */
  reset(): void {
    this.baseHandSize = null;
  }

  /**
   * Get current tolerance settings
   */
  getTolerance(): { tolerance: number; minScale: number; maxScale: number } {
    return {
      tolerance: this.sizeTolerance,
      minScale: this.minScale,
      maxScale: this.maxScale
    };
  }
}

// Partial gesture completion system
export class PartialGestureDetector {
  private gesturePatterns: Map<string, number[][][]> = new Map();
  private partialThreshold = 0.6; // Minimum completion percentage to consider
  private completionTimeout = 2000; // Time window to complete gesture (ms)
  private activePartialGestures: Map<string, { startTime: number; landmarks: number[][][]; progress: number }> = new Map();

  /**
   * Set the partial completion threshold
   */
  setThreshold(threshold: number): void {
    this.partialThreshold = Math.max(0.3, Math.min(0.9, threshold));
  }

  /**
   * Analyze hand pose for partial gesture completion
   */
  analyzePartialCompletion(landmarks: number[][][], gestureId: string): {
    isPartial: boolean;
    completion: number;
    confidence: number;
    feedback: string;
  } {
    if (landmarks.length === 0) {
      return { isPartial: false, completion: 0, confidence: 0, feedback: '' };
    }

    const hand = landmarks[0];
    if (!hand || hand.length < 21) {
      return { isPartial: false, completion: 0, confidence: 0, feedback: '' };
    }

    // Analyze different gesture types for partial completion
    switch (gestureId) {
      case 'thumbs_up':
        return this.analyzeThumbsUpPartial(hand);
      case 'open_palm':
        return this.analyzeOpenPalmPartial(hand);
      case 'fist':
        return this.analyzeFistPartial(hand);
      case 'point':
        return this.analyzePointPartial(hand);
      default:
        return { isPartial: false, completion: 0, confidence: 0, feedback: '' };
    }
  }

  private analyzeThumbsUpPartial(hand: number[][]): {
    isPartial: boolean;
    completion: number;
    confidence: number;
    feedback: string;
  } {
    // Thumbs up: thumb extended, other fingers curled
    const thumbExtended = hand[4][1] < hand[3][1]; // Thumb tip above thumb joint
    const indexCurled = hand[8][1] > hand[6][1]; // Index tip below joint
    const middleCurled = hand[12][1] > hand[10][1]; // Middle tip below joint
    const ringCurled = hand[16][1] > hand[14][1]; // Ring tip below joint
    const pinkyCurled = hand[20][1] > hand[18][1]; // Pinky tip below joint

    const completion = (thumbExtended ? 1 : 0) +
                      (indexCurled ? 1 : 0) +
                      (middleCurled ? 1 : 0) +
                      (ringCurled ? 1 : 0) +
                      (pinkyCurled ? 1 : 0);

    const normalizedCompletion = completion / 5;
    const isPartial = normalizedCompletion >= 0.4 && normalizedCompletion < 1.0;

    let feedback = '';
    if (isPartial) {
      if (!thumbExtended) {
        feedback = 'Streck deinen Daumen nach oben';
      } else if (!indexCurled) {
        feedback = 'Mach eine Faust mit den Fingern';
      }
    }

    return {
      isPartial,
      completion: normalizedCompletion,
      confidence: normalizedCompletion * 0.8,
      feedback
    };
  }

  private analyzeOpenPalmPartial(hand: number[][]): {
    isPartial: boolean;
    completion: number;
    confidence: number;
    feedback: string;
  } {
    // Open palm: all fingers extended
    const fingers = [
      { tip: 8, joint: 6 }, // Index
      { tip: 12, joint: 10 }, // Middle
      { tip: 16, joint: 14 }, // Ring
      { tip: 20, joint: 18 }, // Pinky
      { tip: 4, joint: 3 } // Thumb
    ];

    let extendedCount = 0;
    for (const finger of fingers) {
      if (hand[finger.tip][1] < hand[finger.joint][1]) {
        extendedCount++;
      }
    }

    const normalizedCompletion = extendedCount / fingers.length;
    const isPartial = normalizedCompletion >= 0.4 && normalizedCompletion < 1.0;

    let feedback = '';
    if (isPartial) {
      feedback = 'Streck alle Finger aus für eine offene Hand';
    }

    return {
      isPartial,
      completion: normalizedCompletion,
      confidence: normalizedCompletion * 0.8,
      feedback
    };
  }

  private analyzeFistPartial(hand: number[][]): {
    isPartial: boolean;
    completion: number;
    confidence: number;
    feedback: string;
  } {
    // Fist: all fingers curled
    const fingers = [
      { tip: 8, joint: 6 }, // Index
      { tip: 12, joint: 10 }, // Middle
      { tip: 16, joint: 14 }, // Ring
      { tip: 20, joint: 18 }, // Pinky
    ];

    let curledCount = 0;
    for (const finger of fingers) {
      if (hand[finger.tip][1] > hand[finger.joint][1]) {
        curledCount++;
      }
    }

    const normalizedCompletion = curledCount / fingers.length;
    const isPartial = normalizedCompletion >= 0.4 && normalizedCompletion < 1.0;

    let feedback = '';
    if (isPartial) {
      feedback = 'Schließe deine Hand zur Faust';
    }

    return {
      isPartial,
      completion: normalizedCompletion,
      confidence: normalizedCompletion * 0.8,
      feedback
    };
  }

  private analyzePointPartial(hand: number[][]): {
    isPartial: boolean;
    completion: number;
    confidence: number;
    feedback: string;
  } {
    // Point: index extended, other fingers curled
    const indexExtended = hand[8][1] < hand[6][1];
    const middleCurled = hand[12][1] > hand[10][1];
    const ringCurled = hand[16][1] > hand[14][1];
    const pinkyCurled = hand[20][1] > hand[18][1];

    const completion = (indexExtended ? 1 : 0) +
                      (middleCurled ? 1 : 0) +
                      (ringCurled ? 1 : 0) +
                      (pinkyCurled ? 1 : 0);

    const normalizedCompletion = completion / 4;
    const isPartial = normalizedCompletion >= 0.4 && normalizedCompletion < 1.0;

    let feedback = '';
    if (isPartial) {
      if (!indexExtended) {
        feedback = 'Streck deinen Zeigefinger aus';
      } else if (!middleCurled || !ringCurled || !pinkyCurled) {
        feedback = 'Mach eine Faust mit den anderen Fingern';
      }
    }

    return {
      isPartial,
      completion: normalizedCompletion,
      confidence: normalizedCompletion * 0.8,
      feedback
    };
  }
}

// Tremor compensation system
export class TremorCompensator {
  private landmarkHistory: number[][][][] = [];
  private readonly MAX_HISTORY = 5; // Keep last 5 frames for smoothing
  private readonly SMOOTHING_FACTOR = 0.7; // How much to smooth (0-1)

  /**
   * Add new landmarks to history and return smoothed version
   */
  smoothLandmarks(landmarks: number[][][]): number[][][] {
    // Add current frame to history
    this.landmarkHistory.push(JSON.parse(JSON.stringify(landmarks)));
    if (this.landmarkHistory.length > this.MAX_HISTORY) {
      this.landmarkHistory.shift();
    }

    if (this.landmarkHistory.length < 2) {
      return landmarks; // Not enough history for smoothing
    }

    // Apply exponential smoothing
    const smoothed = JSON.parse(JSON.stringify(landmarks));

    for (let handIdx = 0; handIdx < landmarks.length; handIdx++) {
      const hand = landmarks[handIdx];
      if (!hand) continue;

      for (let pointIdx = 0; pointIdx < hand.length; pointIdx++) {
        const currentPoint = hand[pointIdx];
        if (!currentPoint) continue;

        // Calculate weighted average of recent frames
        let smoothedX = currentPoint[0];
        let smoothedY = currentPoint[1];
        let smoothedZ = currentPoint[2] || 0;

        let totalWeight = 1;
        for (let historyIdx = 0; historyIdx < this.landmarkHistory.length - 1; historyIdx++) {
          const weight = Math.pow(1 - this.SMOOTHING_FACTOR, historyIdx + 1);
          const historyHand = this.landmarkHistory[historyIdx][handIdx];
          if (historyHand && historyHand[pointIdx]) {
            const historyPoint = historyHand[pointIdx];
            smoothedX += historyPoint[0] * weight;
            smoothedY += historyPoint[1] * weight;
            smoothedZ += (historyPoint[2] || 0) * weight;
            totalWeight += weight;
          }
        }

        smoothed[handIdx][pointIdx] = [
          smoothedX / totalWeight,
          smoothedY / totalWeight,
          smoothedZ / totalWeight
        ];
      }
    }

    return smoothed;
  }

  /**
   * Detect if movement is likely intentional vs tremor
   */
  isIntentionalMovement(currentLandmarks: number[][][], previousLandmarks: number[][][]): boolean {
    if (!previousLandmarks || previousLandmarks.length === 0) {
      return true; // First frame is always considered intentional
    }

    let totalMovement = 0;
    let pointCount = 0;

    // Calculate average movement across all hand landmarks
    for (let handIdx = 0; handIdx < Math.min(currentLandmarks.length, previousLandmarks.length); handIdx++) {
      const currentHand = currentLandmarks[handIdx];
      const previousHand = previousLandmarks[handIdx];

      if (!currentHand || !previousHand) continue;

      for (let pointIdx = 0; pointIdx < Math.min(currentHand.length, previousHand.length); pointIdx++) {
        const currentPoint = currentHand[pointIdx];
        const previousPoint = previousHand[pointIdx];

        if (!currentPoint || !previousPoint) continue;

        const distance = Math.sqrt(
          Math.pow(currentPoint[0] - previousPoint[0], 2) +
          Math.pow(currentPoint[1] - previousPoint[1], 2) +
          Math.pow((currentPoint[2] || 0) - (previousPoint[2] || 0), 2)
        );

        totalMovement += distance;
        pointCount++;
      }
    }

    if (pointCount === 0) return true;

    const averageMovement = totalMovement / pointCount;

    // Consider movement intentional if it's above a threshold
    // This helps filter out micro-tremors while preserving gestures
    const INTENTIONAL_MOVEMENT_THRESHOLD = 0.02; // Adjust based on testing
    return averageMovement > INTENTIONAL_MOVEMENT_THRESHOLD;
  }

  /**
   * Clear history (useful when switching gestures or starting new session)
   */
  clearHistory(): void {
    this.landmarkHistory = [];
  }
}