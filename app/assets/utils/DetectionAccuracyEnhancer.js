/**
 * Enhanced detection accuracy system
 * Improves conflict resolution between detection methods and enhances rule-based detection
 */
export class DetectionAccuracyEnhancer {
    constructor() {
        this.confidenceHistory = new Map();
        this.HISTORY_SIZE = 5;
        this.CONFIDENCE_THRESHOLD_HIGH = 0.8;
        this.CONFIDENCE_THRESHOLD_MEDIUM = 0.6;
        this.CONFIDENCE_THRESHOLD_LOW = 0.4;
    }
    /**
     * Resolve conflicts between multiple detection methods
     */
    resolveConflicts(detectionResults) {
        if (detectionResults.length === 0) {
            return this.createEmptyResult();
        }
        if (detectionResults.length === 1) {
            return this.createSingleResult(detectionResults[0]);
        }
        // Group results by gesture
        const gestureGroups = this.groupByGesture(detectionResults);
        // Find the best result for each gesture
        const bestResults = this.findBestResultsPerGesture(gestureGroups);
        // Apply conflict resolution logic
        const resolution = this.applyConflictResolution(bestResults);
        // Update confidence history for learning
        this.updateConfidenceHistory(resolution.finalGesture, resolution.finalConfidence);
        return resolution;
    }
    /**
     * Enhance rule-based gesture detection with machine learning insights
     */
    enhanceRuleBasedDetection(landmarks, tremorCompensator, sizeNormalizer, partialDetector) {
        const results = [];
        if (!landmarks || landmarks.length === 0) {
            return results;
        }
        const hand = landmarks[0];
        if (!hand || hand.length < 21) {
            return results;
        }
        // Apply preprocessing
        const processedLandmarks = this.preprocessLandmarks(landmarks, tremorCompensator, sizeNormalizer);
        // Enhanced gesture detection with multiple heuristics
        const basicGestures = this.detectBasicGesturesEnhanced(processedLandmarks[0]);
        // Add partial gesture analysis
        const partialResults = this.analyzePartialGestures(processedLandmarks, partialDetector);
        // Combine and rank results
        const combinedResults = [...basicGestures, ...partialResults];
        const rankedResults = this.rankDetectionResults(combinedResults);
        return rankedResults.slice(0, 3); // Return top 3 results
    }
    /**
     * Preprocess landmarks for better detection
     */
    preprocessLandmarks(landmarks, tremorCompensator, sizeNormalizer) {
        let processed = landmarks;
        // Apply tremor compensation
        processed = tremorCompensator.smoothLandmarks(processed);
        // Apply size normalization
        processed = sizeNormalizer.normalizeHandSize(processed);
        return processed;
    }
    /**
     * Enhanced basic gesture detection with improved heuristics
     */
    detectBasicGesturesEnhanced(hand) {
        const results = [];
        // Multi-factor gesture detection
        const fingerStates = this.analyzeFingerStates(hand);
        const palmOrientation = this.analyzePalmOrientation(hand);
        const handShape = this.analyzeHandShape(hand);
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
    analyzeFingerStates(hand) {
        const fingers = [
            { name: 'thumb', tip: 4, joint: 3 },
            { name: 'index', tip: 8, joint: 6 },
            { name: 'middle', tip: 12, joint: 10 },
            { name: 'ring', tip: 16, joint: 14 },
            { name: 'pinky', tip: 20, joint: 18 }
        ];
        const result = {};
        fingers.forEach(finger => {
            const tip = hand[finger.tip];
            const joint = hand[finger.joint];
            if (!tip || !joint) {
                result[finger.name] = 'unknown';
                return;
            }
            // For thumb, compare y-coordinates (vertical extension)
            // For other fingers, compare y-coordinates (upward extension)
            const isExtended = tip[1] < joint[1];
            result[finger.name] = isExtended ? 'extended' : 'curled';
        });
        return result;
    }
    /**
     * Analyze palm orientation
     */
    analyzePalmOrientation(hand) {
        // Simplified palm orientation analysis
        const wrist = hand[0];
        const middleBase = hand[9];
        if (!wrist || !middleBase)
            return 'unknown';
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
    analyzeHandShape(hand) {
        const fingerStates = this.analyzeFingerStates(hand);
        const extendedCount = Object.values(fingerStates).filter(state => state === 'extended').length;
        if (extendedCount >= 4)
            return 'open';
        if (extendedCount <= 1)
            return 'closed';
        if (extendedCount >= 2 && extendedCount <= 3)
            return 'partial';
        return 'unknown';
    }
    /**
     * Calculate confidence scores for different gestures
     */
    calculateThumbsUpConfidence(fingerStates, palmOrientation) {
        let confidence = 0;
        // Thumb should be extended
        if (fingerStates.thumb === 'extended')
            confidence += 0.4;
        // Other fingers should be curled
        const otherFingers = ['index', 'middle', 'ring', 'pinky'];
        const curledCount = otherFingers.filter(finger => fingerStates[finger] === 'curled').length;
        confidence += (curledCount / 4) * 0.4;
        // Palm orientation bonus
        if (palmOrientation === 'upright')
            confidence += 0.2;
        return Math.min(confidence, 1.0);
    }
    calculateOpenPalmConfidence(fingerStates, handShape) {
        if (handShape === 'open')
            return 0.9;
        const extendedCount = Object.values(fingerStates).filter(state => state === 'extended').length;
        return extendedCount / 5;
    }
    calculateFistConfidence(fingerStates, handShape) {
        if (handShape === 'closed')
            return 0.9;
        const curledCount = Object.values(fingerStates).filter(state => state === 'curled').length;
        return curledCount / 5;
    }
    calculatePointConfidence(fingerStates) {
        let confidence = 0;
        // Index should be extended
        if (fingerStates.index === 'extended')
            confidence += 0.5;
        // Other fingers should be curled
        const otherFingers = ['middle', 'ring', 'pinky'];
        const curledCount = otherFingers.filter(finger => fingerStates[finger] === 'curled').length;
        confidence += (curledCount / 3) * 0.4;
        // Thumb can be either
        confidence += 0.1;
        return Math.min(confidence, 1.0);
    }
    /**
     * Analyze partial gestures
     */
    analyzePartialGestures(landmarks, partialDetector) {
        const results = [];
        const commonGestures = ['thumbs_up', 'open_palm', 'fist', 'point'];
        commonGestures.forEach(gesture => {
            const partial = partialDetector.analyzePartialCompletion(landmarks, gesture);
            if (partial.isPartial) {
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
    rankDetectionResults(results) {
        return results.sort((a, b) => {
            // Primary sort by confidence
            if (Math.abs(a.confidence - b.confidence) > 0.1) {
                return b.confidence - a.confidence;
            }
            // Secondary sort by method priority
            const methodPriority = {
                'mediapipe': 4,
                'mlp': 3,
                'rule_based': 2,
                'partial': 1,
                'fallback': 0
            };
            return methodPriority[b.method] - methodPriority[a.method];
        });
    }
    /**
     * Group detection results by gesture
     */
    groupByGesture(results) {
        const groups = new Map();
        results.forEach(result => {
            if (!groups.has(result.gesture)) {
                groups.set(result.gesture, []);
            }
            groups.get(result.gesture).push(result);
        });
        return groups;
    }
    /**
     * Find best result for each gesture
     */
    findBestResultsPerGesture(gestureGroups) {
        const bestResults = [];
        gestureGroups.forEach((results, gesture) => {
            const best = results.reduce((best, current) => current.confidence > best.confidence ? current : best);
            bestResults.push(best);
        });
        return bestResults;
    }
    /**
     * Apply conflict resolution logic
     */
    applyConflictResolution(results) {
        if (results.length === 0) {
            return this.createEmptyResult();
        }
        // Sort by confidence
        results.sort((a, b) => b.confidence - a.confidence);
        const bestResult = results[0];
        // Check for clear winner
        if (bestResult.confidence >= this.CONFIDENCE_THRESHOLD_HIGH ||
            (bestResult.confidence >= this.CONFIDENCE_THRESHOLD_MEDIUM && results.length === 1)) {
            return {
                finalGesture: bestResult.gesture,
                finalConfidence: bestResult.confidence,
                methodUsed: bestResult.method,
                alternatives: results.slice(1),
                confidence: bestResult.confidence,
                reasoning: 'Clear high-confidence result'
            };
        }
        // Check for consistency in recent history
        const historicalConfidence = this.getHistoricalConfidence(bestResult.gesture);
        if (historicalConfidence > 0.7) {
            return {
                finalGesture: bestResult.gesture,
                finalConfidence: Math.max(bestResult.confidence, historicalConfidence * 0.8),
                methodUsed: bestResult.method,
                alternatives: results.slice(1),
                confidence: bestResult.confidence,
                reasoning: 'Historical consistency bonus'
            };
        }
        // Use method priority as tiebreaker
        const methodPriority = {
            'mediapipe': 4,
            'mlp': 3,
            'rule_based': 2,
            'partial': 1,
            'fallback': 0
        };
        results.sort((a, b) => {
            if (Math.abs(a.confidence - b.confidence) < 0.1) {
                return methodPriority[b.method] - methodPriority[a.method];
            }
            return b.confidence - a.confidence;
        });
        return {
            finalGesture: results[0].gesture,
            finalConfidence: results[0].confidence,
            methodUsed: results[0].method,
            alternatives: results.slice(1),
            confidence: results[0].confidence,
            reasoning: 'Method priority tiebreaker'
        };
    }
    /**
     * Update confidence history for learning
     */
    updateConfidenceHistory(gesture, confidence) {
        if (!this.confidenceHistory.has(gesture)) {
            this.confidenceHistory.set(gesture, []);
        }
        const history = this.confidenceHistory.get(gesture);
        history.push(confidence);
        if (history.length > this.HISTORY_SIZE) {
            history.shift();
        }
    }
    /**
     * Get historical confidence for a gesture
     */
    getHistoricalConfidence(gesture) {
        const history = this.confidenceHistory.get(gesture);
        if (!history || history.length === 0)
            return 0;
        const avgConfidence = history.reduce((sum, conf) => sum + conf, 0) / history.length;
        return avgConfidence;
    }
    /**
     * Create empty conflict resolution result
     */
    createEmptyResult() {
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
     * Create single result conflict resolution
     */
    createSingleResult(result) {
        return {
            finalGesture: result.gesture,
            finalConfidence: result.confidence,
            methodUsed: result.method,
            alternatives: [],
            confidence: result.confidence,
            reasoning: 'Single detection result'
        };
    }
    /**
     * Get detection accuracy statistics
     */
    getAccuracyStats() {
        const methodDistribution = {};
        const historicalConfidence = {};
        let totalConfidence = 0;
        let totalGestures = 0;
        this.confidenceHistory.forEach((history, gesture) => {
            historicalConfidence[gesture] = history.reduce((sum, conf) => sum + conf, 0) / history.length;
            totalConfidence += historicalConfidence[gesture];
            totalGestures++;
        });
        return {
            totalGestures,
            averageConfidence: totalGestures > 0 ? totalConfidence / totalGestures : 0,
            methodDistribution,
            historicalConfidence
        };
    }
    /**
     * Reset accuracy tracking
     */
    reset() {
        this.confidenceHistory.clear();
    }
}
