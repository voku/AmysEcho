/**
 * Hand stability analysis and guidance system
 * Helps users maintain steady hand positions for better gesture recognition
 */
export class HandStabilityAssistant {
    constructor() {
        this.stabilityHistory = [];
        this.MAX_HISTORY = 10;
        this.stabilityThreshold = 0.02; // Movement threshold for stability
        this.stabilityScore = 0;
        this.lastStablePosition = null;
    }
    /**
     * Analyze hand stability based on landmark movement
     */
    analyzeStability(landmarks) {
        if (landmarks.length === 0 || !landmarks[0]) {
            return { isStable: false, stabilityScore: 0, feedback: 'Positioniere deine Hand in der Kamera' };
        }
        const hand = landmarks[0];
        if (hand.length < 21) {
            return { isStable: false, stabilityScore: 0, feedback: 'Halte deine Hand ruhig' };
        }
        // Calculate center of palm as reference point
        const palmCenter = this.calculatePalmCenter(hand);
        const movement = this.lastStablePosition
            ? this.calculateMovement(this.lastStablePosition, palmCenter)
            : 0;
        // Update stability history
        this.stabilityHistory.push(movement);
        if (this.stabilityHistory.length > this.MAX_HISTORY) {
            this.stabilityHistory.shift();
        }
        // Calculate stability score (lower movement = higher stability)
        const avgMovement = this.stabilityHistory.reduce((sum, m) => sum + m, 0) / this.stabilityHistory.length;
        this.stabilityScore = Math.max(0, 1 - (avgMovement / this.stabilityThreshold));
        const isStable = this.stabilityScore > 0.7;
        if (isStable) {
            this.lastStablePosition = palmCenter;
        }
        let feedback = '';
        let guidePosition;
        if (!isStable) {
            if (this.stabilityScore < 0.3) {
                feedback = 'Halte deine Hand ruhiger';
                guidePosition = { x: 0.5, y: 0.5 }; // Center of screen
            }
            else if (this.stabilityScore < 0.7) {
                feedback = 'Fast geschafft! Halte still';
            }
        }
        else {
            feedback = 'Perfekt! Hand ist stabil';
        }
        return {
            isStable,
            stabilityScore: this.stabilityScore,
            feedback,
            guidePosition
        };
    }
    /**
     * Calculate center of palm using key landmarks
     */
    calculatePalmCenter(hand) {
        // Use wrist and base of fingers as reference
        const wrist = hand[0];
        const indexBase = hand[5];
        const pinkyBase = hand[17];
        const centerX = (wrist[0] + indexBase[0] + pinkyBase[0]) / 3;
        const centerY = (wrist[1] + indexBase[1] + pinkyBase[1]) / 3;
        const centerZ = (wrist[2] + indexBase[2] + pinkyBase[2]) / 3;
        return [[centerX, centerY, centerZ]];
    }
    /**
     * Calculate movement between two positions
     */
    calculateMovement(pos1, pos2) {
        if (!pos1[0] || !pos2[0])
            return 0;
        const dx = pos1[0][0] - pos2[0][0];
        const dy = pos1[0][1] - pos2[0][1];
        const dz = pos1[0][2] - pos2[0][2];
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    /**
     * Reset stability tracking
     */
    reset() {
        this.stabilityHistory = [];
        this.stabilityScore = 0;
        this.lastStablePosition = null;
    }
    /**
     * Get current stability status
     */
    getStabilityStatus() {
        return {
            score: this.stabilityScore,
            isStable: this.stabilityScore > 0.7
        };
    }
    /**
     * Set stability threshold
     */
    setStabilityThreshold(threshold) {
        this.stabilityThreshold = Math.max(0.01, Math.min(0.1, threshold));
    }
    /**
     * Get stability statistics
     */
    getStabilityStats() {
        const avgMovement = this.stabilityHistory.length > 0
            ? this.stabilityHistory.reduce((sum, m) => sum + m, 0) / this.stabilityHistory.length
            : 0;
        return {
            currentScore: this.stabilityScore,
            averageMovement: avgMovement,
            historySize: this.stabilityHistory.length,
            threshold: this.stabilityThreshold
        };
    }
}
