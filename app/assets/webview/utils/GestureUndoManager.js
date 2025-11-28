/**
 * Gesture Undo Manager - Amy First
 * Provides simple gesture-based undo functionality
 */
export class GestureUndoManager {
    constructor() {
        this.gestureHistory = [];
        this.MAX_HISTORY = 5; // Keep last 5 gestures for undo
        this.UNDO_WINDOW = 10000; // 10 seconds to undo
        this.undoGestures = [
            {
                name: 'shake_undo',
                gesture: 'wave', // Waving hand as shake motion
                minConfidence: 0.7,
                cooldownMs: 3000, // 3 second cooldown
                holdDuration: 800, // Hold for 800ms
                feedback: {
                    message: 'Undoing last gesture! ↶',
                    hapticPattern: 'medium',
                    soundEnabled: true
                }
            },
            {
                name: 'cross_undo',
                gesture: 'thumbs_down', // Thumbs down as rejection
                minConfidence: 0.7,
                cooldownMs: 2000,
                holdDuration: 600,
                feedback: {
                    message: 'Cancelling that! ❌',
                    hapticPattern: 'light',
                    soundEnabled: true
                }
            }
        ];
        this.lastUndoTime = {};
        this.undoHoldStart = {};
        this.activeUndoSession = null;
    }
    /**
     * Record a gesture for potential undo
     */
    recordGestureForUndo(gesture, confidence, landmarks, handedness, sessionId) {
        if (confidence < 0.6) {
            return; // Only record confident gestures
        }
        const undoableGesture = {
            gesture,
            confidence,
            timestamp: Date.now(),
            landmarks: JSON.parse(JSON.stringify(landmarks)), // Deep copy
            handedness: [...handedness],
            sessionId,
            canUndo: true
        };
        this.gestureHistory.push(undoableGesture);
        // Maintain history size
        if (this.gestureHistory.length > this.MAX_HISTORY) {
            this.gestureHistory.shift();
        }
        // Clean old gestures
        this.cleanOldGestures();
    }
    /**
     * Check if a gesture should trigger undo
     */
    checkUndoTrigger(gesture, confidence, context) {
        // Find matching undo gesture
        const undoGesture = this.undoGestures.find(ug => ug.gesture === gesture);
        if (!undoGesture) {
            return null;
        }
        // Check confidence threshold
        if (confidence < undoGesture.minConfidence) {
            return null;
        }
        // Check cooldown
        const lastUndo = this.lastUndoTime[undoGesture.name] || 0;
        const now = Date.now();
        if (now - lastUndo < undoGesture.cooldownMs) {
            return null;
        }
        // Check if there's something to undo
        const targetGesture = this.getLastUndoableGesture();
        if (!targetGesture) {
            return null; // Nothing to undo
        }
        // Check hold duration
        const holdStart = this.undoHoldStart[undoGesture.name];
        if (!holdStart) {
            // Start holding timer
            this.undoHoldStart[undoGesture.name] = now;
            return null;
        }
        // Check if held long enough
        if (now - holdStart < undoGesture.holdDuration) {
            return null;
        }
        // Create undo session
        const sessionId = `undo_${now}_${Math.random().toString(36).substr(2, 9)}`;
        const session = {
            undoGesture,
            targetGesture,
            timestamp: now,
            confirmed: false,
            sessionId
        };
        this.activeUndoSession = session;
        // Record undo time and reset hold timer
        this.lastUndoTime[undoGesture.name] = now;
        delete this.undoHoldStart[undoGesture.name];
        return session;
    }
    /**
     * Confirm and execute undo
     */
    confirmUndo(sessionId) {
        if (!this.activeUndoSession || this.activeUndoSession.sessionId !== sessionId) {
            return false;
        }
        const session = this.activeUndoSession;
        session.confirmed = true;
        // Mark the target gesture as undone
        const targetIndex = this.gestureHistory.findIndex(g => g.sessionId === session.targetGesture.sessionId);
        if (targetIndex >= 0) {
            this.gestureHistory[targetIndex].canUndo = false;
        }
        // Send undo confirmation to React Native
        this.sendUndoToReactNative(session);
        // Clear active session
        this.activeUndoSession = null;
        return true;
    }
    /**
     * Cancel undo session
     */
    cancelUndo(sessionId) {
        if (!this.activeUndoSession || this.activeUndoSession.sessionId !== sessionId) {
            return false;
        }
        this.activeUndoSession = null;
        return true;
    }
    /**
     * Get the last undoable gesture
     */
    getLastUndoableGesture() {
        const now = Date.now();
        // Find the most recent undoable gesture within the time window
        for (let i = this.gestureHistory.length - 1; i >= 0; i--) {
            const gesture = this.gestureHistory[i];
            if (gesture.canUndo && (now - gesture.timestamp) <= this.UNDO_WINDOW) {
                return gesture;
            }
        }
        return null;
    }
    /**
     * Get undoable gestures history
     */
    getUndoableGestures() {
        const now = Date.now();
        return this.gestureHistory.filter(g => g.canUndo && (now - g.timestamp) <= this.UNDO_WINDOW);
    }
    /**
     * Reset hold timers (when gesture changes)
     */
    resetHoldTimers() {
        this.undoHoldStart = {};
    }
    /**
     * Get current undo session
     */
    getCurrentUndoSession() {
        return this.activeUndoSession;
    }
    /**
     * Get undo gesture by name
     */
    getUndoGesture(gestureName) {
        return this.undoGestures.find(ug => ug.name === gestureName) || null;
    }
    /**
     * Add custom undo gesture
     */
    addCustomUndoGesture(gesture) {
        // Check if gesture already exists
        const existingIndex = this.undoGestures.findIndex(ug => ug.name === gesture.name);
        if (existingIndex >= 0) {
            this.undoGestures[existingIndex] = gesture;
        }
        else {
            this.undoGestures.push(gesture);
        }
    }
    /**
     * Get undo hold progress
     */
    getUndoHoldProgress(gestureName) {
        const holdStart = this.undoHoldStart[gestureName];
        if (!holdStart) {
            return 0;
        }
        const undoGesture = this.undoGestures.find(ug => ug.name === gestureName);
        if (!undoGesture) {
            return 0;
        }
        const elapsed = Date.now() - holdStart;
        return Math.min(1, elapsed / undoGesture.holdDuration);
    }
    /**
     * Get undo statistics
     */
    getUndoStats() {
        var _a;
        const now = Date.now();
        const recentUndos = Object.values(this.lastUndoTime).filter(time => now - time < 3600000 // Last hour
        );
        const totalUndos = recentUndos.length;
        const undoRate = this.gestureHistory.length > 0 ? totalUndos / this.gestureHistory.length : 0;
        // Count undo gesture usage
        const undoUsage = {};
        Object.keys(this.lastUndoTime).forEach(gestureName => {
            undoUsage[gestureName] = (undoUsage[gestureName] || 0) + 1;
        });
        const mostUsedUndoGesture = ((_a = Object.entries(undoUsage)
            .sort(([, a], [, b]) => b - a)[0]) === null || _a === void 0 ? void 0 : _a[0]) || 'none';
        // Calculate average time to undo (simplified)
        const averageTimeToUndo = totalUndos > 0 ? this.UNDO_WINDOW / 2 : 0; // Rough estimate
        return {
            totalUndos,
            undoRate,
            mostUsedUndoGesture,
            averageTimeToUndo
        };
    }
    /**
     * Send undo command to React Native
     */
    sendUndoToReactNative(session) {
        var _a, _b;
        try {
            (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
                type: 'gesture_undo',
                sessionId: session.sessionId,
                undoneGesture: session.targetGesture.gesture,
                undoGesture: session.undoGesture.gesture,
                feedback: session.undoGesture.feedback,
                timestamp: session.timestamp
            }));
        }
        catch (error) {
            console.warn('Failed to send undo command:', error);
        }
    }
    /**
     * Clean old gestures from history
     */
    cleanOldGestures() {
        const now = Date.now();
        this.gestureHistory = this.gestureHistory.filter(g => (now - g.timestamp) <= this.UNDO_WINDOW);
    }
    /**
     * Reset undo state
     */
    reset() {
        this.gestureHistory = [];
        this.lastUndoTime = {};
        this.undoHoldStart = {};
        this.activeUndoSession = null;
    }
    /**
     * Export undo configuration
     */
    exportConfiguration() {
        return [...this.undoGestures];
    }
    /**
     * Import undo configuration
     */
    importConfiguration(config) {
        this.undoGestures = [...config];
    }
}
