/**
 * Visual Correction Manager - Amy First
 * Provides picture-based correction selection instead of text
 */
export class VisualCorrectionManager {
    constructor() {
        this.gestureHistory = [];
        this.HISTORY_SIZE = 100;
        this.activeSession = null;
        // Visual representations for gestures (Amy-friendly emojis)
        this.gestureVisuals = {
            thumbs_up: { emoji: '👍', description: 'Happy thumbs up' },
            thumbs_down: { emoji: '👎', description: 'Thumbs down' },
            open_palm: { emoji: '🖐️', description: 'Open hand' },
            fist: { emoji: '✊', description: 'Closed fist' },
            point: { emoji: '👆', description: 'Pointing finger' },
            peace: { emoji: '✌️', description: 'Peace sign' },
            ok: { emoji: '👌', description: 'OK sign' },
            heart: { emoji: '❤️', description: 'Heart shape' },
            wave: { emoji: '👋', description: 'Waving hand' },
            clap: { emoji: '👏', description: 'Clapping hands' }
        };
    }
    /**
     * Record gesture attempt for correction learning
     */
    recordGestureAttempt(gesture, confidence, success) {
        this.gestureHistory.push({
            gesture,
            confidence,
            timestamp: Date.now(),
            success
        });
        // Maintain history size
        if (this.gestureHistory.length > this.HISTORY_SIZE) {
            this.gestureHistory.shift();
        }
    }
    /**
     * Generate correction options when gesture confidence is low
     */
    generateCorrectionOptions(detectedGesture, confidence, alternativeGestures) {
        if (confidence > 0.7) {
            return null; // High confidence, no correction needed
        }
        const sessionId = `correction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        // Get top alternatives plus some common gestures
        const options = this.createCorrectionOptions(detectedGesture, alternativeGestures);
        if (options.length === 0) {
            return null;
        }
        const session = {
            originalGesture: detectedGesture,
            originalConfidence: confidence,
            timestamp: Date.now(),
            options,
            sessionId
        };
        this.activeSession = session;
        return session;
    }
    /**
     * Create correction options with visual representations
     */
    createCorrectionOptions(detectedGesture, alternatives) {
        const options = [];
        // Add the detected gesture as first option
        if (this.gestureVisuals[detectedGesture]) {
            options.push(this.createCorrectionOption(detectedGesture, 1.0));
        }
        // Add alternative gestures
        alternatives.slice(0, 3).forEach(alt => {
            if (this.gestureVisuals[alt.gesture] && alt.gesture !== detectedGesture) {
                options.push(this.createCorrectionOption(alt.gesture, alt.confidence));
            }
        });
        // Add frequently used gestures that weren't in alternatives
        const frequentGestures = this.getFrequentGestures(3);
        frequentGestures.forEach(gesture => {
            if (!options.find(opt => opt.gesture === gesture) && this.gestureVisuals[gesture]) {
                options.push(this.createCorrectionOption(gesture, 0.5)); // Lower priority
            }
        });
        // Sort by priority (confidence + frequency bonus)
        return options.sort((a, b) => b.priority - a.priority).slice(0, 6); // Max 6 options
    }
    /**
     * Create a single correction option
     */
    createCorrectionOption(gesture, confidence) {
        const visual = this.gestureVisuals[gesture];
        const context = this.getGestureContext(gesture);
        // Calculate priority based on confidence and usage patterns
        let priority = confidence;
        if (context.frequency > 5)
            priority += 0.2; // Frequent gesture bonus
        if (context.successRate > 0.8)
            priority += 0.1; // High success rate bonus
        if (Date.now() - context.lastUsed < 3600000)
            priority += 0.1; // Recently used bonus
        return {
            gesture,
            confidence,
            visualRepresentation: {
                type: 'emoji',
                value: visual.emoji,
                description: visual.description
            },
            context,
            priority
        };
    }
    /**
     * Get context information for a gesture
     */
    getGestureContext(gesture) {
        const gestureAttempts = this.gestureHistory.filter(h => h.gesture === gesture);
        if (gestureAttempts.length === 0) {
            return {
                frequency: 0,
                lastUsed: 0,
                successRate: 0
            };
        }
        const frequency = gestureAttempts.length;
        const lastUsed = Math.max(...gestureAttempts.map(h => h.timestamp));
        const successRate = gestureAttempts.filter(h => h.success).length / gestureAttempts.length;
        return {
            frequency,
            lastUsed,
            successRate
        };
    }
    /**
     * Get most frequently used gestures
     */
    getFrequentGestures(limit) {
        const frequency = {};
        this.gestureHistory.forEach(h => {
            frequency[h.gesture] = (frequency[h.gesture] || 0) + 1;
        });
        return Object.entries(frequency)
            .sort(([, a], [, b]) => b - a)
            .slice(0, limit)
            .map(([gesture]) => gesture);
    }
    /**
     * Handle correction selection
     */
    selectCorrection(sessionId, selectedGesture) {
        if (!this.activeSession || this.activeSession.sessionId !== sessionId) {
            return false;
        }
        this.activeSession.selectedOption = selectedGesture;
        // Record the correction for learning
        this.recordCorrectionResult(this.activeSession, selectedGesture);
        // Send confirmation to React Native
        this.sendCorrectionSelectionToReactNative(this.activeSession, selectedGesture);
        // Clear active session
        this.activeSession = null;
        return true;
    }
    /**
     * Cancel correction session
     */
    cancelCorrection(sessionId) {
        if (!this.activeSession || this.activeSession.sessionId !== sessionId) {
            return false;
        }
        // Record cancellation for learning
        this.recordCorrectionResult(this.activeSession, null);
        this.activeSession = null;
        return true;
    }
    /**
     * Get current correction session
     */
    getCurrentCorrectionSession() {
        return this.activeSession;
    }
    /**
     * Record correction result for learning
     */
    recordCorrectionResult(session, selectedGesture) {
        var _a, _b;
        // If user selected a different gesture, record it as a correction
        if (selectedGesture && selectedGesture !== session.originalGesture) {
            this.recordGestureAttempt(selectedGesture, 1.0, true); // User confirmed this is correct
        }
        // Send correction analytics to React Native
        try {
            (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
                type: 'correction_analytics',
                sessionId: session.sessionId,
                originalGesture: session.originalGesture,
                selectedGesture,
                correctionMade: selectedGesture !== session.originalGesture,
                timestamp: Date.now()
            }));
        }
        catch (error) {
            console.warn('Failed to send correction analytics:', error);
        }
    }
    /**
     * Send correction options to React Native
     */
    sendCorrectionOptionsToReactNative(session) {
        var _a, _b;
        try {
            (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
                type: 'correction_options',
                sessionId: session.sessionId,
                originalGesture: session.originalGesture,
                originalConfidence: session.originalConfidence,
                options: session.options,
                timestamp: session.timestamp
            }));
        }
        catch (error) {
            console.warn('Failed to send correction options:', error);
        }
    }
    /**
     * Send correction selection to React Native
     */
    sendCorrectionSelectionToReactNative(session, selectedGesture) {
        var _a, _b;
        try {
            (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
                type: 'correction_selected',
                sessionId: session.sessionId,
                originalGesture: session.originalGesture,
                selectedGesture,
                timestamp: Date.now()
            }));
        }
        catch (error) {
            console.warn('Failed to send correction selection:', error);
        }
    }
    /**
     * Add custom visual representation for a gesture
     */
    addCustomVisual(gesture, emoji, description) {
        this.gestureVisuals[gesture] = { emoji, description };
    }
    /**
     * Get correction statistics
     */
    getCorrectionStats() {
        // This would track correction usage over time
        // For now, return basic structure
        return {
            totalCorrections: 0,
            correctionRate: 0,
            mostCorrectedGesture: 'none',
            averageOptionsShown: 0
        };
    }
    /**
     * Reset correction state
     */
    reset() {
        this.activeSession = null;
        this.gestureHistory = [];
    }
    /**
     * Export correction configuration
     */
    exportConfiguration() {
        return Object.assign({}, this.gestureVisuals);
    }
    /**
     * Import correction configuration
     */
    importConfiguration(config) {
        this.gestureVisuals = Object.assign(Object.assign({}, this.gestureVisuals), config);
    }
}
