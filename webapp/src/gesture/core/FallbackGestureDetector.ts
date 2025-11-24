/**
 * Fallback gesture detection system
 * Provides basic gesture recognition when main systems fail
 */

export class FallbackGestureDetector {
  private lastLandmarks: number[][][] | null = null;
  private gestureHistory: Array<{gesture: string; confidence: number; timestamp: number}> = [];
  private readonly HISTORY_SIZE = 5;
  private static readonly MIN_PALM_NORMALIZED_WIDTH = 0.15;
  private static readonly MIN_PALM_NORMALIZED_HEIGHT = 0.15;

  /**
   * Simple rule-based gesture detection as fallback
   */
  detectGesture(landmarks: number[][][]): {
    gesture: string;
    confidence: number;
    isFallback: boolean;
    feedback?: string;
  } {
    if (!landmarks || landmarks.length === 0) {
      return { gesture: '', confidence: 0, isFallback: true };
    }

    const firstHand = landmarks[0];
    if (!firstHand) {
      return { gesture: '', confidence: 0, isFallback: true };
    }

    // Basic gesture detection using simple heuristics
    const gesture = this.detectBasicGesture(firstHand); // Use first hand
    const confidence = this.calculateRuleBasedConfidence(firstHand, gesture);

    // Store in history for smoothing
    this.gestureHistory.push({
      gesture,
      confidence,
      timestamp: Date.now()
    });

    if (this.gestureHistory.length > this.HISTORY_SIZE) {
      this.gestureHistory.shift();
    }

    // Smooth confidence over recent detections
    const smoothedConfidence = this.smoothConfidence();

    this.lastLandmarks = landmarks;

    return {
      gesture,
      confidence: smoothedConfidence,
      isFallback: true,
      feedback: this.getGestureFeedback(gesture, smoothedConfidence)
    };
  }

  private detectBasicGesture(hand: number[][]): string {
    if (!hand || hand.length < 21) return '';

    // Simple finger counting for basic gestures
    const fingerTips = [8, 12, 16, 20]; // Index, middle, ring, pinky tips
    const fingerJoints = [6, 10, 14, 18]; // Corresponding joints
    const thumbTip = hand[4];
    const thumbJoint = hand[3];

    if (!thumbTip || !thumbJoint) return '';

    let extendedFingers = 0;

    // Count extended fingers
    for (let i = 0; i < fingerTips.length; i++) {
      const tipIdx = fingerTips[i];
      const jointIdx = fingerJoints[i];
      if (tipIdx === undefined || jointIdx === undefined) continue;
      const tip = hand[tipIdx];
      const joint = hand[jointIdx];
      if (!tip || !joint || tip[1] === undefined || joint[1] === undefined) continue;
      if (tip[1] < joint[1]) {
        extendedFingers++;
      }
    }

    // Check thumb
    if (thumbTip[1] === undefined || thumbJoint[1] === undefined) return '';
    const thumbExtended = thumbTip[1] < thumbJoint[1];

    // Basic gesture classification
    if (extendedFingers === 0 && !thumbExtended) {
      return 'fist';
    } else if (extendedFingers === 1 && !thumbExtended) {
      return 'point';
    } else if (extendedFingers === 2 && !thumbExtended) {
      return 'peace';
    } else if (extendedFingers >= 3 && thumbExtended) {
      return 'open_palm';
    } else if (extendedFingers === 0 && thumbExtended) {
      return 'thumbs_up';
    }

    return 'unknown';
  }

  private calculateRuleBasedConfidence(hand: number[][], gesture: string): number {
    if (!hand || gesture === 'unknown') return 0.3;

    // Simple confidence based on gesture clarity
    let confidence = 0.5;

    // Add confidence based on hand stability (compare with previous frame)
    if (this.lastLandmarks && this.lastLandmarks[0]) {
      const movement = this.calculateMovement(this.lastLandmarks[0], hand);
      if (movement < 0.05) confidence += 0.2; // Stable hand = higher confidence
    }

    // Add confidence based on gesture-specific rules
    switch (gesture) {
      case 'fist':
        confidence += this.checkFistClarity(hand) ? 0.2 : -0.1;
        break;
      case 'point':
        confidence += this.checkPointClarity(hand) ? 0.2 : -0.1;
        break;
      case 'thumbs_up':
        confidence += this.checkThumbsUpClarity(hand) ? 0.2 : -0.1;
        break;
      case 'open_palm':
        confidence += this.checkOpenPalmClarity(hand) ? 0.2 : -0.05;
        break;
    }

    return Math.max(0.1, Math.min(0.8, confidence));
  }

  private checkFistClarity(hand: number[][]): boolean {
    const fingerTips = [8, 12, 16, 20];
    const fingerJoints = [6, 10, 14, 18];
    let curledFingers = 0;

    for (let i = 0; i < fingerTips.length; i++) {
      const tipIdx = fingerTips[i];
      const jointIdx = fingerJoints[i];
      if (tipIdx === undefined || jointIdx === undefined) continue;
      const tip = hand[tipIdx];
      const joint = hand[jointIdx];
      if (!tip || !joint || tip[1] === undefined || joint[1] === undefined) continue;
      if (tip[1] > joint[1]) {
        curledFingers++;
      }
    }

    return curledFingers >= 3; // At least 3 fingers curled
  }

  private checkPointClarity(hand: number[][]): boolean {
    const p8 = hand[8];
    const p6 = hand[6];
    const p12 = hand[12];
    const p10 = hand[10];
    const p16 = hand[16];
    const p14 = hand[14];
    const p20 = hand[20];
    const p18 = hand[18];

    if (!p8 || !p6 || !p12 || !p10 || !p16 || !p14 || !p20 || !p18) return false;
    if (p8[1] === undefined || p6[1] === undefined || p12[1] === undefined || p10[1] === undefined ||
        p16[1] === undefined || p14[1] === undefined || p20[1] === undefined || p18[1] === undefined) return false;

    const indexExtended = p8[1] < p6[1];
    const otherFingersCurled =
      p12[1] > p10[1] && // Middle
      p16[1] > p14[1] && // Ring
      p20[1] > p18[1];   // Pinky

    return indexExtended && otherFingersCurled;
  }

  private checkThumbsUpClarity(hand: number[][]): boolean {
    const p4 = hand[4];
    const p3 = hand[3];
    const p8 = hand[8];
    const p6 = hand[6];
    const p12 = hand[12];
    const p10 = hand[10];
    const p16 = hand[16];
    const p14 = hand[14];
    const p20 = hand[20];
    const p18 = hand[18];

    if (!p4 || !p3 || !p8 || !p6 || !p12 || !p10 || !p16 || !p14 || !p20 || !p18) return false;
    if (p4[1] === undefined || p3[1] === undefined || p8[1] === undefined || p6[1] === undefined ||
        p12[1] === undefined || p10[1] === undefined || p16[1] === undefined || p14[1] === undefined ||
        p20[1] === undefined || p18[1] === undefined) return false;

    const thumbExtended = p4[1] < p3[1];
    const otherFingersCurled =
      p8[1] > p6[1] &&   // Index
      p12[1] > p10[1] && // Middle
      p16[1] > p14[1] && // Ring
      p20[1] > p18[1];   // Pinky

    return thumbExtended && otherFingersCurled;
  }

  private checkOpenPalmClarity(hand: number[][]): boolean {
    const fingerTips = [8, 12, 16, 20];
    const fingerJoints = [6, 10, 14, 18];
    let extendedFingers = 0;

    for (let i = 0; i < fingerTips.length; i++) {
      const tipIdx = fingerTips[i];
      const jointIdx = fingerJoints[i];
      if (tipIdx === undefined || jointIdx === undefined) continue;
      const tip = hand[tipIdx];
      const joint = hand[jointIdx];
      if (!tip || !joint || tip[1] === undefined || joint[1] === undefined) continue;
      if (tip[1] < joint[1]) {
        extendedFingers += 1;
      }
    }

    const p4 = hand[4];
    const p2 = hand[2];
    if (!p4 || !p2 || p4[1] === undefined || p2[1] === undefined) return false;

    const thumbExtended = p4[1] < p2[1];
    const palmWidth = Math.abs((hand[5]?.[0] ?? 0) - (hand[17]?.[0] ?? 0));
    const palmHeight = Math.abs((hand[0]?.[1] ?? 0) - (hand[9]?.[1] ?? 0));

    return (
      extendedFingers >= 3 &&
      thumbExtended &&
      palmWidth > FallbackGestureDetector.MIN_PALM_NORMALIZED_WIDTH &&
      palmHeight > FallbackGestureDetector.MIN_PALM_NORMALIZED_HEIGHT
    );
  }

  private calculateMovement(prevHand: number[][], currHand: number[][]): number {
    let totalMovement = 0;
    let points = 0;

    for (let i = 0; i < Math.min(prevHand.length, currHand.length); i++) {
      const prev = prevHand[i];
      const curr = currHand[i];
      if (prev && curr && prev[0] !== undefined && prev[1] !== undefined &&
          curr[0] !== undefined && curr[1] !== undefined) {
        const dx = prev[0] - curr[0];
        const dy = prev[1] - curr[1];
        totalMovement += Math.sqrt(dx * dx + dy * dy);
        points++;
      }
    }

    return points > 0 ? totalMovement / points : 0;
  }

  private smoothConfidence(): number {
    if (this.gestureHistory.length === 0) return 0;

    const recent = this.gestureHistory.slice(-3); // Last 3 detections
    const avgConfidence = recent.reduce((sum, h) => sum + h.confidence, 0) / recent.length;

    // Weight recent detections more heavily
    return avgConfidence * 0.8 + (recent[recent.length - 1]?.confidence || 0) * 0.2;
  }

  private getGestureFeedback(gesture: string, confidence: number): string {
    if (confidence < 0.4) {
      return 'Versuch es nochmal, wir schaffen das gemeinsam!';
    }

    const celebrationMessages = [
      'Super! Deine Hand bewegt sich richtig.',
      'Toll! Ich sehe deine Geste ganz deutlich.',
      'Fantastisch! Das war eine klasse Geste.',
    ];

    const gestureLabels: Record<string, string> = {
      fist: 'Faust',
      point: 'Zeigefinger',
      peace: 'Peace-Geste',
      thumbs_up: 'Daumen hoch',
      open_palm: 'offene Hand',
    };

    const clampedConfidence = Math.max(0, Math.min(1, confidence));
    const messageIndex = Math.min(
      celebrationMessages.length - 1,
      Math.floor((clampedConfidence - 0.4) / 0.2)
    );
    const celebration = celebrationMessages[Math.max(0, messageIndex)];
    const friendlyLabel = gestureLabels[gesture] ?? 'deine Geste';

    return `${celebration} (${friendlyLabel}).`;
  }

  reset(): void {
    this.lastLandmarks = null;
    this.gestureHistory = [];
  }
}