/**
 * Fallback gesture detection system
 * Provides basic gesture recognition when main systems fail
 */
export class FallbackGestureDetector {
    constructor() {
        this.lastLandmarks = null;
        this.gestureHistory = [];
        this.HISTORY_SIZE = 5;
        this.ruleBasedConfidence = 0.0;
    }
    /**
     * Simple rule-based gesture detection as fallback
     */
    detectGesture(landmarks) {
        if (!landmarks || landmarks.length === 0) {
            return { gesture: '', confidence: 0, isFallback: true };
        }
        this.lastLandmarks = landmarks;
        // Basic gesture detection using simple heuristics
        const gesture = this.detectBasicGesture(landmarks[0]); // Use first hand
        const confidence = this.calculateRuleBasedConfidence(landmarks[0], gesture);
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
        return {
            gesture,
            confidence: smoothedConfidence,
            isFallback: true,
            feedback: this.getGestureFeedback(gesture, smoothedConfidence)
        };
    }
    detectBasicGesture(hand) {
        if (!hand || hand.length < 21)
            return '';
        // Simple finger counting for basic gestures
        const fingerTips = [8, 12, 16, 20]; // Index, middle, ring, pinky tips
        const fingerJoints = [6, 10, 14, 18]; // Corresponding joints
        const thumbTip = hand[4];
        const thumbJoint = hand[3];
        let extendedFingers = 0;
        // Count extended fingers
        for (let i = 0; i < fingerTips.length; i++) {
            if (hand[fingerTips[i]][1] < hand[fingerJoints[i]][1]) {
                extendedFingers++;
            }
        }
        // Check thumb
        const thumbExtended = thumbTip[1] < thumbJoint[1];
        // Basic gesture classification
        if (extendedFingers === 0 && !thumbExtended) {
            return 'fist';
        }
        else if (extendedFingers === 1 && !thumbExtended) {
            return 'point';
        }
        else if (extendedFingers === 2 && !thumbExtended) {
            return 'peace';
        }
        else if (extendedFingers >= 3 && thumbExtended) {
            return 'open_palm';
        }
        else if (extendedFingers === 0 && thumbExtended) {
            return 'thumbs_up';
        }
        return 'unknown';
    }
    calculateRuleBasedConfidence(hand, gesture) {
        if (!hand || gesture === 'unknown')
            return 0.3;
        // Simple confidence based on gesture clarity
        let confidence = 0.5;
        // Add confidence based on hand stability (compare with previous frame)
        if (this.lastLandmarks && this.lastLandmarks[0]) {
            const movement = this.calculateMovement(this.lastLandmarks[0], hand);
            if (movement < 0.05)
                confidence += 0.2; // Stable hand = higher confidence
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
        }
        return Math.max(0.1, Math.min(0.8, confidence));
    }
    checkFistClarity(hand) {
        const fingerTips = [8, 12, 16, 20];
        const fingerJoints = [6, 10, 14, 18];
        let curledFingers = 0;
        for (let i = 0; i < fingerTips.length; i++) {
            if (hand[fingerTips[i]][1] > hand[fingerJoints[i]][1]) {
                curledFingers++;
            }
        }
        return curledFingers >= 3; // At least 3 fingers curled
    }
    checkPointClarity(hand) {
        const indexExtended = hand[8][1] < hand[6][1];
        const otherFingersCurled = hand[12][1] > hand[10][1] && // Middle
            hand[16][1] > hand[14][1] && // Ring
            hand[20][1] > hand[18][1]; // Pinky
        return indexExtended && otherFingersCurled;
    }
    checkThumbsUpClarity(hand) {
        const thumbExtended = hand[4][1] < hand[3][1];
        const otherFingersCurled = hand[8][1] > hand[6][1] && // Index
            hand[12][1] > hand[10][1] && // Middle
            hand[16][1] > hand[14][1] && // Ring
            hand[20][1] > hand[18][1]; // Pinky
        return thumbExtended && otherFingersCurled;
    }
    calculateMovement(prevHand, currHand) {
        let totalMovement = 0;
        let points = 0;
        for (let i = 0; i < Math.min(prevHand.length, currHand.length); i++) {
            if (prevHand[i] && currHand[i]) {
                const dx = prevHand[i][0] - currHand[i][0];
                const dy = prevHand[i][1] - currHand[i][1];
                totalMovement += Math.sqrt(dx * dx + dy * dy);
                points++;
            }
        }
        return points > 0 ? totalMovement / points : 0;
    }
    smoothConfidence() {
        var _a;
        if (this.gestureHistory.length === 0)
            return 0;
        const recent = this.gestureHistory.slice(-3); // Last 3 detections
        const avgConfidence = recent.reduce((sum, h) => sum + h.confidence, 0) / recent.length;
        // Weight recent detections more heavily
        return avgConfidence * 0.8 + (((_a = recent[recent.length - 1]) === null || _a === void 0 ? void 0 : _a.confidence) || 0) * 0.2;
    }
    getGestureFeedback(gesture, confidence) {
        if (confidence < 0.4) {
            return 'Versuch es nochmal, halte deine Hand ruhig';
        }
        switch (gesture) {
            case 'fist':
                return 'Faust erkannt!';
            case 'point':
                return 'Zeigefinger erkannt!';
            case 'thumbs_up':
                return 'Daumen hoch erkannt!';
            case 'open_palm':
                return 'Offene Hand erkannt!';
            default:
                return 'Geste erkannt!';
        }
    }
    reset() {
        this.lastLandmarks = null;
        this.gestureHistory = [];
    }
}
