/**
 * Optimized gesture combination manager with memory-efficient sequence tracking
 * and intelligent cleanup based on performance constraints
 */
import { MemoryOptimizer } from './MemoryOptimizer';
export class OptimizedGestureCombinationManager {
    constructor() {
        this.gestureHistory = null;
        this.customSequences = new Map();
        this.enabled = true;
        this.lastCleanupTime = 0;
        this.CLEANUP_INTERVAL = 10000; // 10 seconds
        // Default gesture sequences for common combinations
        this.DEFAULT_SEQUENCES = {
            help_sequence: {
                gestures: ['thumbs_up', 'point'],
                timeWindow: 3000,
                description: 'Help request sequence',
                feedback: 'Hilfe-Signal erkannt!'
            },
            yes_sequence: {
                gestures: ['thumbs_up', 'open_palm'],
                timeWindow: 2000,
                description: 'Affirmative response',
                feedback: 'Ja-Signal erkannt!'
            },
            no_sequence: {
                gestures: ['point', 'fist'],
                timeWindow: 2000,
                description: 'Negative response',
                feedback: 'Nein-Signal erkannt!'
            }
        };
        this.memoryOptimizer = MemoryOptimizer.getInstance();
        this.initializeHistoryBuffer();
        // Register cleanup callback
        this.memoryOptimizer.registerCleanupCallback('gestureCombinationManager', () => this.cleanup());
        // Load default sequences
        Object.entries(this.DEFAULT_SEQUENCES).forEach(([key, sequence]) => {
            this.customSequences.set(key, sequence);
        });
    }
    /**
     * Initialize or reinitialize the history buffer with optimized size
     */
    initializeHistoryBuffer() {
        const optimizedSize = this.memoryOptimizer.getOptimizedHistorySize(20);
        this.gestureHistory = this.memoryOptimizer.createCircularBuffer(optimizedSize);
    }
    /**
     * Record a gesture for combination detection
     */
    recordGesture(gesture, confidence) {
        if (!this.enabled || confidence < 0.5)
            return; // Only record confident gestures
        this.gestureHistory.push({
            gesture,
            confidence,
            timestamp: Date.now()
        });
        // Periodic cleanup
        const now = Date.now();
        if (now - this.lastCleanupTime > this.CLEANUP_INTERVAL) {
            this.cleanupOldEntries();
            this.lastCleanupTime = now;
        }
    }
    /**
     * Check for gesture combinations in recent history
     */
    checkForCombinations() {
        if (!this.enabled || this.gestureHistory.getSize() < 2)
            return null;
        const history = this.gestureHistory.toArray();
        const now = Date.now();
        // Check each custom sequence
        for (const [sequenceKey, sequence] of this.customSequences) {
            const result = this.checkSequence(history, sequence, now);
            if (result) {
                return {
                    combination: sequenceKey,
                    confidence: result.confidence,
                    sequence: result.matchedGestures,
                    timeSpan: result.timeSpan,
                    description: sequence.description,
                    feedback: sequence.feedback
                };
            }
        }
        return null;
    }
    /**
     * Check if a specific sequence matches recent history
     */
    checkSequence(history, sequence, currentTime) {
        const { gestures, timeWindow } = sequence;
        // Need at least as many gestures as the sequence requires
        if (history.length < gestures.length)
            return null;
        // Look for sequence match within time window
        for (let startIdx = 0; startIdx <= history.length - gestures.length; startIdx++) {
            const candidateSequence = history.slice(startIdx, startIdx + gestures.length);
            // Check if sequence matches
            if (this.sequenceMatches(candidateSequence, gestures)) {
                const timeSpan = candidateSequence[candidateSequence.length - 1].timestamp - candidateSequence[0].timestamp;
                // Check if within time window
                if (timeSpan <= timeWindow) {
                    const avgConfidence = candidateSequence.reduce((sum, g) => sum + g.confidence, 0) / candidateSequence.length;
                    const matchedGestures = candidateSequence.map(g => g.gesture);
                    return {
                        confidence: avgConfidence,
                        matchedGestures,
                        timeSpan
                    };
                }
            }
        }
        return null;
    }
    /**
     * Check if candidate sequence matches target sequence
     */
    sequenceMatches(candidate, target) {
        if (candidate.length !== target.length)
            return false;
        for (let i = 0; i < target.length; i++) {
            if (candidate[i].gesture !== target[i]) {
                return false;
            }
        }
        return true;
    }
    /**
     * Add a custom gesture sequence
     */
    addCustomSequence(name, sequence) {
        this.customSequences.set(name, sequence);
    }
    /**
     * Remove a custom sequence
     */
    removeCustomSequence(name) {
        return this.customSequences.delete(name);
    }
    /**
     * Get all available sequences
     */
    getAllSequences() {
        const result = {};
        for (const [key, sequence] of this.customSequences) {
            result[key] = sequence;
        }
        return result;
    }
    /**
     * Get combination progress for UI feedback
     */
    getCombinationProgress() {
        const result = {};
        const history = this.gestureHistory.toArray();
        const now = Date.now();
        for (const [sequenceKey, sequence] of this.customSequences) {
            const progress = this.calculateProgress(history, sequence, now);
            if (progress.progress > 0) {
                result[sequenceKey] = progress;
            }
        }
        return result;
    }
    /**
     * Calculate progress for a sequence
     */
    calculateProgress(history, sequence, currentTime) {
        if (history.length === 0) {
            return { progress: 0, nextGesture: sequence.gestures[0], timeRemaining: sequence.timeWindow };
        }
        // Find the longest matching prefix
        let matchLength = 0;
        for (let i = 0; i < Math.min(history.length, sequence.gestures.length); i++) {
            if (history[history.length - 1 - i].gesture === sequence.gestures[sequence.gestures.length - 1 - i]) {
                matchLength++;
            }
            else {
                break;
            }
        }
        const progress = matchLength / sequence.gestures.length;
        const nextGesture = matchLength < sequence.gestures.length ? sequence.gestures[matchLength] : '';
        // Calculate time remaining based on last matching gesture
        let timeRemaining = sequence.timeWindow;
        if (matchLength > 0) {
            const lastMatchTime = history[history.length - matchLength].timestamp;
            const elapsed = currentTime - lastMatchTime;
            timeRemaining = Math.max(0, sequence.timeWindow - elapsed);
        }
        return { progress, nextGesture, timeRemaining };
    }
    /**
     * Clean up old entries from history
     */
    cleanupOldEntries() {
        if (!this.gestureHistory)
            return;
        const history = this.gestureHistory.toArray();
        const now = Date.now();
        const maxAge = 10000; // 10 seconds
        // Remove old entries (keep only recent ones)
        const recentHistory = history.filter(entry => now - entry.timestamp < maxAge);
        // Rebuild buffer with only recent entries
        this.gestureHistory.clear();
        recentHistory.forEach(entry => this.gestureHistory.push(entry));
    }
    /**
     * Memory cleanup
     */
    cleanup() {
        this.cleanupOldEntries();
        // Reduce buffer size under memory pressure
        if (this.gestureHistory) {
            const optimizedSize = this.memoryOptimizer.getOptimizedHistorySize(15);
            this.gestureHistory.resize(optimizedSize);
        }
    }
    /**
     * Enable or disable combination detection
     */
    setEnabled(enabled) {
        var _a;
        this.enabled = enabled;
        if (!enabled) {
            (_a = this.gestureHistory) === null || _a === void 0 ? void 0 : _a.clear();
        }
    }
    /**
     * Get current status
     */
    getStatus() {
        var _a, _b;
        return {
            enabled: this.enabled,
            historySize: ((_a = this.gestureHistory) === null || _a === void 0 ? void 0 : _a.getSize()) || 0,
            sequenceCount: this.customSequences.size,
            optimizedSize: ((_b = this.gestureHistory) === null || _b === void 0 ? void 0 : _b['maxSize']) || 0
        };
    }
}
