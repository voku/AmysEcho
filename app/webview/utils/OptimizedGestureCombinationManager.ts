/**
 * Optimized gesture combination manager with memory-efficient sequence tracking
 * and intelligent cleanup based on performance constraints
 */

import { MemoryOptimizer, CircularBuffer } from './MemoryOptimizer';

export interface GestureSequence {
  gestures: string[];
  timeWindow: number; // milliseconds
  description: string;
  feedback: string;
}

export interface CombinationResult {
  combination: string;
  confidence: number;
  sequence: string[];
  timeSpan: number;
  description: string;
  feedback: string;
}

export class OptimizedGestureCombinationManager {
  private memoryOptimizer: MemoryOptimizer;
  private gestureHistory: CircularBuffer<{gesture: string; confidence: number; timestamp: number}> | null = null;
  private customSequences: Map<string, GestureSequence> = new Map();
  private enabled = true;
  private lastCleanupTime = 0;
  private readonly CLEANUP_INTERVAL = 10000; // 10 seconds

  // Default gesture sequences for common combinations
  private readonly DEFAULT_SEQUENCES: Record<string, GestureSequence> = {
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

  constructor() {
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
  private initializeHistoryBuffer(): void {
    const optimizedSize = this.memoryOptimizer.getOptimizedHistorySize(20);
    this.gestureHistory = this.memoryOptimizer.createCircularBuffer<{gesture: string; confidence: number; timestamp: number}>(optimizedSize);
  }

  /**
   * Record a gesture for combination detection
   */
  recordGesture(gesture: string, confidence: number): void {
    if (!this.enabled || confidence < 0.5) return; // Only record confident gestures

    this.gestureHistory!.push({
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
  checkForCombinations(): CombinationResult | null {
    if (!this.enabled || this.gestureHistory!.getSize() < 2) return null;

    const history = this.gestureHistory!.toArray();
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
  private checkSequence(
    history: Array<{gesture: string; confidence: number; timestamp: number}>,
    sequence: GestureSequence,
    currentTime: number
  ): { confidence: number; matchedGestures: string[]; timeSpan: number } | null {
    const { gestures, timeWindow } = sequence;

    // Need at least as many gestures as the sequence requires
    if (history.length < gestures.length) return null;

    // Look for sequence match within time window
    for (let startIdx = 0; startIdx <= history.length - gestures.length; startIdx++) {
      const candidateSequence = history.slice(startIdx, startIdx + gestures.length);
      const chronologicalSequence = [...candidateSequence].reverse();

      // Check if sequence matches
      if (this.sequenceMatches(chronologicalSequence, gestures)) {
        const earliestGesture = chronologicalSequence[0];
        const latestGesture = chronologicalSequence[chronologicalSequence.length - 1];
        const timeSpan = latestGesture.timestamp - earliestGesture.timestamp;

        const sequenceStartTime = earliestGesture.timestamp;

        if (sequenceStartTime < currentTime - timeWindow) {
          continue;
        }

        if (timeSpan <= timeWindow) {
          const avgConfidence = chronologicalSequence.reduce((sum, g) => sum + g.confidence, 0) /
            chronologicalSequence.length;
          const matchedGestures = chronologicalSequence.map(g => g.gesture);

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
  private sequenceMatches(
    candidate: Array<{gesture: string; confidence: number; timestamp: number}>,
    target: string[]
  ): boolean {
    if (candidate.length !== target.length) return false;

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
  addCustomSequence(name: string, sequence: GestureSequence): void {
    this.customSequences.set(name, sequence);
  }

  /**
   * Remove a custom sequence
   */
  removeCustomSequence(name: string): boolean {
    return this.customSequences.delete(name);
  }

  /**
   * Get all available sequences
   */
  getAllSequences(): Record<string, GestureSequence> {
    const result: Record<string, GestureSequence> = {};
    for (const [key, sequence] of this.customSequences) {
      result[key] = sequence;
    }
    return result;
  }

  /**
   * Get combination progress for UI feedback
   */
  getCombinationProgress(): Record<string, { progress: number; nextGesture: string; timeRemaining: number }> {
    const result: Record<string, { progress: number; nextGesture: string; timeRemaining: number }> = {};
    const history = this.gestureHistory!.toArray();
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
  private calculateProgress(
    history: Array<{gesture: string; confidence: number; timestamp: number}>,
    sequence: GestureSequence,
    currentTime: number
  ): { progress: number; nextGesture: string; timeRemaining: number } {
    if (history.length === 0) {
      return { progress: 0, nextGesture: sequence.gestures[0], timeRemaining: sequence.timeWindow };
    }

    // Find the longest matching prefix
    let matchLength = 0;
    for (let i = 0; i < Math.min(history.length, sequence.gestures.length); i++) {
      if (history[history.length - 1 - i].gesture === sequence.gestures[sequence.gestures.length - 1 - i]) {
        matchLength++;
      } else {
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
  private cleanupOldEntries(): void {
    if (!this.gestureHistory) return;

    const history = this.gestureHistory.toArray();
    const now = Date.now();
    const maxAge = 10000; // 10 seconds

    // Remove old entries (keep only recent ones)
    const recentHistory = history.filter(entry => now - entry.timestamp < maxAge);

    // Rebuild buffer with only recent entries
    this.gestureHistory.clear();
    recentHistory.forEach(entry => this.gestureHistory!.push(entry));
  }

  /**
   * Memory cleanup
   */
  cleanup(): void {
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
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.gestureHistory?.clear();
    }
  }

  /**
   * Get current status
   */
  getStatus(): {
    enabled: boolean;
    historySize: number;
    sequenceCount: number;
    optimizedSize: number;
  } {
    return {
      enabled: this.enabled,
      historySize: this.gestureHistory?.getSize() || 0,
      sequenceCount: this.customSequences.size,
      optimizedSize: this.gestureHistory?.['maxSize'] || 0
    };
  }
}