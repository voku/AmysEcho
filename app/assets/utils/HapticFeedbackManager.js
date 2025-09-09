/**
 * Enhanced Haptic Feedback Manager - Amy First
 * Provides immediate feedback for every hand movement detection
 */
export class HapticFeedbackManager {
    constructor() {
        this.lastHapticTime = 0;
        this.MIN_HAPTIC_INTERVAL = 100; // Minimum 100ms between haptics
        this.MAX_HAPTIC_INTERVAL = 2000; // Maximum 2s between repeated events
        this.hapticHistory = [];
        this.HISTORY_SIZE = 10;
        // Amy's haptic preferences
        this.preferences = {
            intensity: 'normal',
            enableMovementFeedback: true,
            enableGestureFeedback: true,
            enableSuccessFeedback: true,
            enableErrorFeedback: true,
            reduceFrequentHaptics: true, // Prevent haptic spam
            adaptiveIntensity: true // Adjust based on time of day
        };
        // Predefined haptic patterns for different events
        this.patterns = {
            // Hand detection and movement
            hand_detected: {
                type: 'light',
                intensity: 0.3,
                duration: 50
            },
            hand_moved: {
                type: 'light',
                intensity: 0.2,
                duration: 30
            },
            hand_stable: {
                type: 'light',
                intensity: 0.4,
                duration: 40
            },
            // Gesture detection stages
            gesture_start: {
                type: 'light',
                intensity: 0.5,
                duration: 60
            },
            gesture_progress: {
                type: 'light',
                intensity: 0.3,
                duration: 40,
                repeat: 2,
                interval: 50
            },
            gesture_complete: {
                type: 'medium',
                intensity: 0.7,
                duration: 80
            },
            // Success and recognition
            gesture_recognized: {
                type: 'success',
                intensity: 0.8,
                duration: 100
            },
            high_confidence: {
                type: 'success',
                intensity: 0.9,
                duration: 120
            },
            // Errors and corrections
            gesture_failed: {
                type: 'error',
                intensity: 0.6,
                duration: 70,
                repeat: 2,
                interval: 100
            },
            low_confidence: {
                type: 'light',
                intensity: 0.4,
                duration: 50
            },
            // Special events
            emergency_detected: {
                type: 'heavy',
                intensity: 1.0,
                duration: 150,
                repeat: 3,
                interval: 100
            },
            combination_start: {
                type: 'medium',
                intensity: 0.6,
                duration: 60,
                repeat: 2,
                interval: 80
            },
            combination_complete: {
                type: 'success',
                intensity: 1.0,
                duration: 200
            },
            // Learning and practice
            practice_start: {
                type: 'light',
                intensity: 0.4,
                duration: 50,
                repeat: 3,
                interval: 150
            },
            practice_success: {
                type: 'success',
                intensity: 0.7,
                duration: 100
            },
            practice_hint: {
                type: 'light',
                intensity: 0.3,
                duration: 40,
                repeat: 2,
                interval: 200
            }
        };
    }
    /**
     * Trigger haptic feedback for a specific event
     */
    triggerHaptic(event, context) {
        // Disable haptic system during testing to avoid interference with existing tests
        if (window.__disableHapticSystem === true) {
            return;
        }
        if (!this.shouldTriggerHaptic(event)) {
            return;
        }
        const pattern = this.getAdaptedPattern(event, context);
        if (!pattern) {
            return;
        }
        const hapticEvent = {
            event,
            pattern,
            priority: this.getEventPriority(event),
            context
        };
        this.sendHapticToReactNative(hapticEvent);
        this.recordHapticEvent(event);
    }
    /**
     * Trigger haptic for hand detection
     */
    onHandDetected(handCount, stability) {
        if (!this.preferences.enableMovementFeedback) {
            return;
        }
        if (handCount === 1) {
            this.triggerHaptic('hand_detected', { handCount, stability });
        }
        else if (handCount === 2) {
            // Different pattern for two hands
            this.triggerHaptic('hand_detected', { handCount, stability, pattern: 'double' });
        }
    }
    /**
     * Trigger haptic for hand movement
     */
    onHandMovement(movementIntensity) {
        if (!this.preferences.enableMovementFeedback || movementIntensity < 0.1) {
            return;
        }
        // Only trigger for significant movements to avoid spam
        const timeSinceLastMovement = Date.now() - this.lastHapticTime;
        if (timeSinceLastMovement < 200) {
            return;
        }
        this.triggerHaptic('hand_moved', { intensity: movementIntensity });
    }
    /**
     * Trigger haptic for gesture detection stages
     */
    onGestureStage(stage, gesture, confidence) {
        if (!this.preferences.enableGestureFeedback) {
            return;
        }
        const event = `gesture_${stage}`;
        this.triggerHaptic(event, { gesture, confidence });
    }
    /**
     * Trigger haptic for gesture recognition
     */
    onGestureRecognized(gesture, confidence, isHighConfidence = false) {
        if (!this.preferences.enableGestureFeedback) {
            return;
        }
        if (isHighConfidence || confidence > 0.8) {
            this.triggerHaptic('high_confidence', { gesture, confidence });
        }
        else {
            this.triggerHaptic('gesture_recognized', { gesture, confidence });
        }
    }
    /**
     * Trigger haptic for gesture failure
     */
    onGestureFailed(gesture, reason) {
        if (!this.preferences.enableErrorFeedback) {
            return;
        }
        this.triggerHaptic('gesture_failed', { gesture, reason });
    }
    /**
     * Trigger haptic for emergency gestures
     */
    onEmergencyGesture(gesture) {
        this.triggerHaptic('emergency_detected', { gesture, priority: 'critical' });
    }
    /**
     * Trigger haptic for gesture combinations
     */
    onCombinationEvent(event, combination) {
        const hapticEvent = `combination_${event}`;
        this.triggerHaptic(hapticEvent, { combination });
    }
    /**
     * Trigger haptic for practice sessions
     */
    onPracticeEvent(event) {
        const hapticEvent = `practice_${event}`;
        this.triggerHaptic(hapticEvent);
    }
    /**
     * Update Amy's haptic preferences
     */
    updatePreferences(newPreferences) {
        this.preferences = Object.assign(Object.assign({}, this.preferences), newPreferences);
    }
    /**
     * Get current haptic preferences
     */
    getPreferences() {
        return Object.assign({}, this.preferences);
    }
    /**
     * Check if haptic should be triggered based on timing and preferences
     */
    shouldTriggerHaptic(event) {
        const now = Date.now();
        // Check minimum interval
        if (now - this.lastHapticTime < this.MIN_HAPTIC_INTERVAL) {
            return false;
        }
        // Check for frequent event suppression
        if (this.preferences.reduceFrequentHaptics) {
            const recentEvents = this.hapticHistory.filter(h => now - h.timestamp < this.MAX_HAPTIC_INTERVAL);
            const sameEventCount = recentEvents.filter(h => h.event === event).length;
            if (sameEventCount >= 3) {
                return false; // Don't spam the same haptic
            }
        }
        return true;
    }
    /**
     * Get adapted haptic pattern based on preferences and context
     */
    getAdaptedPattern(event, context) {
        let basePattern = this.patterns[event];
        if (!basePattern) {
            // Fallback to light haptic for unknown events
            basePattern = this.patterns.hand_detected;
        }
        if (!basePattern) {
            return null;
        }
        const adaptedPattern = Object.assign({}, basePattern);
        // Adjust intensity based on preferences
        if (this.preferences.intensity === 'gentle') {
            adaptedPattern.intensity = Math.max(0.1, adaptedPattern.intensity * 0.6);
        }
        else if (this.preferences.intensity === 'strong') {
            adaptedPattern.intensity = Math.min(1.0, adaptedPattern.intensity * 1.3);
        }
        // Adjust based on time of day if adaptive intensity is enabled
        if (this.preferences.adaptiveIntensity) {
            const hour = new Date().getHours();
            if (hour >= 6 && hour <= 9) { // Morning - gentler
                adaptedPattern.intensity *= 0.8;
            }
            else if (hour >= 20 || hour <= 5) { // Evening/Night - slightly stronger for reassurance
                adaptedPattern.intensity = Math.min(1.0, adaptedPattern.intensity * 1.1);
            }
        }
        // Context-specific adjustments
        if ((context === null || context === void 0 ? void 0 : context.priority) === 'critical') {
            adaptedPattern.intensity = 1.0;
            adaptedPattern.repeat = (adaptedPattern.repeat || 1) + 1;
        }
        return adaptedPattern;
    }
    /**
     * Get priority level for haptic event
     */
    getEventPriority(event) {
        const criticalEvents = ['emergency_detected'];
        const highEvents = ['gesture_recognized', 'high_confidence', 'combination_complete'];
        const mediumEvents = ['gesture_complete', 'gesture_start', 'hand_detected'];
        if (criticalEvents.includes(event))
            return 'critical';
        if (highEvents.includes(event))
            return 'high';
        if (mediumEvents.includes(event))
            return 'medium';
        return 'low';
    }
    /**
     * Send haptic event to React Native
     */
    sendHapticToReactNative(hapticEvent) {
        var _a, _b;
        try {
            (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
                type: 'haptic_feedback',
                event: hapticEvent.event,
                pattern: hapticEvent.pattern,
                priority: hapticEvent.priority,
                context: hapticEvent.context,
                timestamp: Date.now()
            }));
            this.lastHapticTime = Date.now();
        }
        catch (error) {
            console.warn('Failed to send haptic feedback:', error);
        }
    }
    /**
     * Record haptic event for frequency tracking
     */
    recordHapticEvent(event) {
        this.hapticHistory.push({
            event,
            timestamp: Date.now()
        });
        // Maintain history size
        if (this.hapticHistory.length > this.HISTORY_SIZE) {
            this.hapticHistory.shift();
        }
    }
    /**
     * Reset haptic state (for testing or fresh start)
     */
    reset() {
        this.hapticHistory = [];
        this.lastHapticTime = 0;
    }
    /**
     * Get haptic statistics
     */
    getHapticStats() {
        var _a;
        const now = Date.now();
        const recentHaptics = this.hapticHistory.filter(h => now - h.timestamp < 60000).length; // Last minute
        const eventCounts = {};
        for (const h of this.hapticHistory) {
            eventCounts[h.event] = (eventCounts[h.event] || 0) + 1;
        }
        const mostFrequentEvent = ((_a = Object.entries(eventCounts)
            .sort(([, a], [, b]) => b - a)[0]) === null || _a === void 0 ? void 0 : _a[0]) || 'none';
        const intervals = [];
        for (let i = 1; i < this.hapticHistory.length; i++) {
            intervals.push(this.hapticHistory[i].timestamp - this.hapticHistory[i - 1].timestamp);
        }
        const averageInterval = intervals.length > 0
            ? intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
            : 0;
        return {
            totalHaptics: this.hapticHistory.length,
            recentHaptics,
            mostFrequentEvent,
            averageInterval
        };
    }
}
