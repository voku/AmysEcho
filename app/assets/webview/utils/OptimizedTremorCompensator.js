/**
 * Optimized tremor compensator with memory-efficient history management
 * and intelligent processing based on performance constraints
 */
import { MemoryOptimizer } from './MemoryOptimizer';
export class OptimizedTremorCompensator {
    constructor() {
        this.landmarkHistory = null;
        this.SMOOTHING_FACTOR = 0.7;
        this.INTENTIONAL_MOVEMENT_THRESHOLD = 0.02;
        this.enabled = true;
        this.lastProcessedLandmarks = [];
        this.memoryOptimizer = MemoryOptimizer.getInstance();
        this.initializeHistoryBuffer();
        // Register cleanup callback
        this.memoryOptimizer.registerCleanupCallback('tremorCompensator', () => this.cleanup());
    }
    /**
     * Initialize or reinitialize the history buffer with optimized size
     */
    initializeHistoryBuffer() {
        const optimizedSize = this.memoryOptimizer.getOptimizedHistorySize(5);
        this.landmarkHistory = this.memoryOptimizer.createCircularBuffer(optimizedSize);
    }
    /**
     * Smooth landmarks with optimized processing
     */
    smoothLandmarks(landmarks) {
        if (!this.enabled || !landmarks || landmarks.length === 0) {
            return landmarks;
        }
        // Quick check: if landmarks haven't changed much, return previous result
        if (this.landmarksUnchanged(landmarks, this.lastProcessedLandmarks)) {
            return this.lastProcessedLandmarks;
        }
        // Add current frame to history
        this.landmarkHistory.push(JSON.parse(JSON.stringify(landmarks)));
        // Need at least 2 frames for smoothing
        if (this.landmarkHistory.getSize() < 2) {
            this.lastProcessedLandmarks = landmarks;
            return landmarks;
        }
        // Apply optimized smoothing
        const smoothed = this.applyOptimizedSmoothing(landmarks);
        this.lastProcessedLandmarks = smoothed;
        return smoothed;
    }
    /**
     * Apply optimized smoothing algorithm
     */
    applyOptimizedSmoothing(currentLandmarks) {
        const smoothed = JSON.parse(JSON.stringify(currentLandmarks));
        for (let handIdx = 0; handIdx < currentLandmarks.length; handIdx++) {
            const currentHand = currentLandmarks[handIdx];
            if (!currentHand)
                continue;
            for (let pointIdx = 0; pointIdx < currentHand.length; pointIdx++) {
                const currentPoint = currentHand[pointIdx];
                if (!currentPoint)
                    continue;
                // Calculate weighted average with optimization
                const smoothedPoint = this.calculateSmoothedPoint(handIdx, pointIdx, currentPoint);
                smoothed[handIdx][pointIdx] = smoothedPoint;
            }
        }
        return smoothed;
    }
    /**
     * Calculate smoothed point with optimized history access
     */
    calculateSmoothedPoint(handIdx, pointIdx, currentPoint) {
        let smoothedX = currentPoint[0];
        let smoothedY = currentPoint[1];
        let smoothedZ = currentPoint[2] || 0;
        let totalWeight = 1;
        // Use circular buffer for efficient history access
        const historySize = this.landmarkHistory.getSize();
        for (let historyIdx = 1; historyIdx < historySize; historyIdx++) {
            const weight = Math.pow(1 - this.SMOOTHING_FACTOR, historyIdx);
            const historyFrame = this.landmarkHistory.get(historyIdx - 1); // 0 = most recent
            if (historyFrame && historyFrame[handIdx] && historyFrame[handIdx][pointIdx]) {
                const historyPoint = historyFrame[handIdx][pointIdx];
                smoothedX += historyPoint[0] * weight;
                smoothedY += historyPoint[1] * weight;
                smoothedZ += (historyPoint[2] || 0) * weight;
                totalWeight += weight;
            }
        }
        return [
            smoothedX / totalWeight,
            smoothedY / totalWeight,
            smoothedZ / totalWeight
        ];
    }
    /**
     * Check if movement is likely intentional vs tremor
     */
    isIntentionalMovement(currentLandmarks, previousLandmarks) {
        if (!this.enabled)
            return true;
        if (!previousLandmarks || previousLandmarks.length === 0)
            return true;
        let totalMovement = 0;
        let pointCount = 0;
        // Calculate average movement across all hand landmarks
        for (let handIdx = 0; handIdx < Math.min(currentLandmarks.length, previousLandmarks.length); handIdx++) {
            const currentHand = currentLandmarks[handIdx];
            const previousHand = previousLandmarks[handIdx];
            if (!currentHand || !previousHand)
                continue;
            for (let pointIdx = 0; pointIdx < Math.min(currentHand.length, previousHand.length); pointIdx++) {
                const currentPoint = currentHand[pointIdx];
                const previousPoint = previousHand[pointIdx];
                if (!currentPoint || !previousPoint)
                    continue;
                const distance = Math.sqrt(Math.pow(currentPoint[0] - previousPoint[0], 2) +
                    Math.pow(currentPoint[1] - previousPoint[1], 2) +
                    Math.pow((currentPoint[2] || 0) - (previousPoint[2] || 0), 2));
                totalMovement += distance;
                pointCount++;
            }
        }
        if (pointCount === 0)
            return true;
        const averageMovement = totalMovement / pointCount;
        return averageMovement > this.INTENTIONAL_MOVEMENT_THRESHOLD;
    }
    /**
     * Check if landmarks have changed significantly
     */
    landmarksUnchanged(current, previous) {
        if (!previous || current.length !== previous.length)
            return false;
        for (let handIdx = 0; handIdx < current.length; handIdx++) {
            const currentHand = current[handIdx];
            const previousHand = previous[handIdx];
            if (!currentHand || !previousHand || currentHand.length !== previousHand.length) {
                return false;
            }
            // Check only key points for efficiency
            const keyPoints = [0, 4, 8, 12, 16, 20]; // wrist and fingertips
            for (const pointIdx of keyPoints) {
                const currentPoint = currentHand[pointIdx];
                const previousPoint = previousHand[pointIdx];
                if (!currentPoint || !previousPoint)
                    continue;
                for (let coord = 0; coord < 2; coord++) { // Only check x,y for efficiency
                    if (Math.abs(currentPoint[coord] - previousPoint[coord]) > 0.005) { // 0.5% change threshold
                        return false;
                    }
                }
            }
        }
        return true;
    }
    /**
     * Clear history and reset state
     */
    clearHistory() {
        if (this.landmarkHistory) {
            this.landmarkHistory.clear();
        }
        this.lastProcessedLandmarks = [];
    }
    /**
     * Cleanup resources
     */
    cleanup() {
        this.clearHistory();
        // Reduce buffer size under memory pressure
        if (this.landmarkHistory) {
            const optimizedSize = this.memoryOptimizer.getOptimizedHistorySize(3);
            this.landmarkHistory.resize(optimizedSize);
        }
    }
    /**
     * Enable or disable tremor compensation
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.clearHistory();
        }
    }
    /**
     * Get current status
     */
    getStatus() {
        var _a, _b;
        return {
            enabled: this.enabled,
            historySize: ((_a = this.landmarkHistory) === null || _a === void 0 ? void 0 : _a.getSize()) || 0,
            optimizedSize: ((_b = this.landmarkHistory) === null || _b === void 0 ? void 0 : _b['maxSize']) || 0
        };
    }
}
