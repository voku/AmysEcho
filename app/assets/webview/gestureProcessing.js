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
    constructor() {
        this.gestureHistory = new Map();
        this.MAX_HISTORY = 5;
        this.COMPLETION_THRESHOLDS = {
            fist: 0.7,
            point: 0.8,
            thumbs_up: 0.75,
            open_palm: 0.6,
            peace: 0.7,
        };
    }
    /**
     * Optimized partial gesture analysis with reduced memory allocation
     */
    analyzePartialCompletion(landmarks, gestureId) {
        if (!(landmarks === null || landmarks === void 0 ? void 0 : landmarks[0]) || landmarks[0].length < 21) {
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
    calculateCompletion(hand, gestureId) {
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
    calculateFistCompletion(hand) {
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
    calculatePointCompletion(hand) {
        const indexExtended = hand[8][1] < hand[6][1];
        const otherFingersCurled = hand[12][1] > hand[10][1] && // Middle
            hand[16][1] > hand[14][1] && // Ring
            hand[20][1] > hand[18][1]; // Pinky
        if (indexExtended && otherFingersCurled)
            return 1.0;
        if (indexExtended)
            return 0.7;
        return 0.0;
    }
    calculateThumbsUpCompletion(hand) {
        const thumbExtended = hand[4][1] < hand[3][1];
        if (thumbExtended)
            return 1.0;
        return 0.0;
    }
    calculateOpenPalmCompletion(hand) {
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
    calculatePartialConfidence(hand, gestureId, completion) {
        const baseConfidence = completion * 0.8; // Partial gestures have lower base confidence
        // Add stability bonus
        const stability = this.calculateHandStability(hand);
        const stabilityBonus = stability * 0.2;
        return Math.min(baseConfidence + stabilityBonus, 0.9);
    }
    calculateHandStability(hand) {
        // Simple stability calculation based on hand size consistency
        if (hand.length < 21)
            return 0;
        const wrist = hand[0];
        const middleTip = hand[12];
        const distance = Math.sqrt(Math.pow(middleTip[0] - wrist[0], 2) +
            Math.pow(middleTip[1] - wrist[1], 2));
        // Normalize distance (rough hand size indicator)
        return Math.min(Math.max(distance, 0.1), 0.5) / 0.5;
    }
    updateGestureHistory(gestureId, confidence) {
        if (!this.gestureHistory.has(gestureId)) {
            this.gestureHistory.set(gestureId, []);
        }
        const history = this.gestureHistory.get(gestureId);
        history.push({ confidence, timestamp: Date.now() });
        if (history.length > this.MAX_HISTORY) {
            history.shift();
        }
    }
    generatePartialFeedback(gestureId, completion) {
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
    shouldRecognizePartial(completion, confidence) {
        return completion >= 0.4 && confidence >= 0.5;
    }
    cleanup() {
        // Clear old history entries
        const cutoffTime = Date.now() - 30000; // 30 seconds ago
        for (const [gestureId, history] of this.gestureHistory) {
            const filtered = history.filter(entry => entry.timestamp > cutoffTime);
            if (filtered.length === 0) {
                this.gestureHistory.delete(gestureId);
            }
            else {
                this.gestureHistory.set(gestureId, filtered);
            }
        }
    }
}
export class TremorCompensator {
    constructor() {
        this.movementHistory = [];
        this.MAX_HISTORY = 3;
        this.SMOOTHING_FACTOR = 0.7;
        this.MOVEMENT_THRESHOLD = 0.02;
    }
    /**
     * Optimized tremor compensation with reduced memory usage
     */
    smoothLandmarks(landmarks) {
        if (!(landmarks === null || landmarks === void 0 ? void 0 : landmarks[0]) || landmarks[0].length < 21) {
            return landmarks;
        }
        const currentLandmarks = landmarks[0];
        const now = Date.now();
        // Add to history
        this.movementHistory.push({ landmarks: currentLandmarks, timestamp: now });
        if (this.movementHistory.length > this.MAX_HISTORY) {
            this.movementHistory.shift();
        }
        // Only smooth if we have enough history
        if (this.movementHistory.length < 2) {
            return landmarks;
        }
        // Check if movement is intentional
        if (!this.isIntentionalMovement(landmarks, [this.movementHistory[this.movementHistory.length - 2].landmarks])) {
            // Return previous smoothed position to reduce tremor
            return [this.movementHistory[this.movementHistory.length - 2].landmarks];
        }
        // Apply smoothing
        const smoothed = this.applySmoothing(currentLandmarks);
        return [smoothed];
    }
    applySmoothing(current) {
        if (this.movementHistory.length < 2)
            return current;
        const previous = this.movementHistory[this.movementHistory.length - 2].landmarks;
        const smoothed = [];
        for (let i = 0; i < Math.min(current.length, previous.length); i++) {
            const currentPoint = current[i];
            const previousPoint = previous[i];
            // Apply exponential smoothing
            const smoothedPoint = [
                previousPoint[0] * this.SMOOTHING_FACTOR + currentPoint[0] * (1 - this.SMOOTHING_FACTOR),
                previousPoint[1] * this.SMOOTHING_FACTOR + currentPoint[1] * (1 - this.SMOOTHING_FACTOR),
                previousPoint[2] * this.SMOOTHING_FACTOR + currentPoint[2] * (1 - this.SMOOTHING_FACTOR),
            ];
            smoothed.push(smoothedPoint);
        }
        return smoothed;
    }
    isIntentionalMovement(currentLandmarks, previousLandmarks) {
        if (!(currentLandmarks === null || currentLandmarks === void 0 ? void 0 : currentLandmarks[0]) || !(previousLandmarks === null || previousLandmarks === void 0 ? void 0 : previousLandmarks[0]))
            return true;
        const current = currentLandmarks[0];
        const previous = previousLandmarks[0];
        if (current.length !== previous.length)
            return true;
        let totalMovement = 0;
        let points = 0;
        for (let i = 0; i < Math.min(current.length, previous.length, 21); i++) {
            const currentPoint = current[i];
            const previousPoint = previous[i];
            const movement = Math.sqrt(Math.pow(currentPoint[0] - previousPoint[0], 2) +
                Math.pow(currentPoint[1] - previousPoint[1], 2) +
                Math.pow(currentPoint[2] - previousPoint[2], 2));
            totalMovement += movement;
            points++;
        }
        const averageMovement = points > 0 ? totalMovement / points : 0;
        return averageMovement > this.MOVEMENT_THRESHOLD;
    }
    clearHistory() {
        this.movementHistory = [];
    }
}
export class GestureSizeNormalizer {
    constructor() {
        this.tolerance = 0.3;
        this.referenceHandSize = null;
    }
    /**
     * Optimized gesture size normalization
     */
    normalizeHandSize(landmarks) {
        if (!(landmarks === null || landmarks === void 0 ? void 0 : landmarks[0]) || landmarks[0].length < 21) {
            return landmarks;
        }
        const hand = landmarks[0];
        const handSize = this.calculateHandSize(hand);
        // Initialize reference size on first use
        if (this.referenceHandSize === null) {
            this.referenceHandSize = handSize;
            return landmarks;
        }
        // Check if normalization is needed
        const sizeRatio = handSize / this.referenceHandSize;
        if (Math.abs(sizeRatio - 1) <= this.tolerance) {
            return landmarks; // No normalization needed
        }
        // Apply normalization
        const normalizedHand = this.applySizeNormalization(hand, sizeRatio);
        return [normalizedHand];
    }
    calculateHandSize(hand) {
        if (hand.length < 21)
            return 1;
        // Calculate distance from wrist to middle finger tip
        const wrist = hand[0];
        const middleTip = hand[12];
        return Math.sqrt(Math.pow(middleTip[0] - wrist[0], 2) +
            Math.pow(middleTip[1] - wrist[1], 2) +
            Math.pow(middleTip[2] - wrist[2], 2));
    }
    applySizeNormalization(hand, sizeRatio) {
        const wrist = hand[0];
        const normalized = [];
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
    setTolerance(tolerance) {
        this.tolerance = Math.max(0, Math.min(1, tolerance));
    }
    reset() {
        this.referenceHandSize = null;
    }
}
// Create optimized instances
export const partialGestureDetector = new PartialGestureDetector();
export const tremorCompensator = new TremorCompensator();
export const gestureSizeNormalizer = new GestureSizeNormalizer();
