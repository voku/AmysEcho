/**
 * Gesture Combination Service - Amy First
 *
 * Enables recognition of gesture sequences for complex communication needs.
 * Allows Amy to combine simple gestures to express compound concepts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

export interface GestureSequence {
  id: string;
  name: string;
  description: string;
  gestures: string[]; // Array of gesture IDs in sequence
  combinedMeaning: string; // What the combination means
  timeWindow: number; // Max time between gestures in sequence (ms)
  minConfidence: number; // Minimum confidence for each gesture
  enabled: boolean;
  usageCount: number;
  lastUsed: number;
}

export interface SequenceMatch {
  sequenceId: string;
  sequence: GestureSequence;
  matchConfidence: number;
  completedGestures: string[];
  remainingGestures: string[];
  timeElapsed: number;
}

class GestureCombinationService {
  private static instance: GestureCombinationService;
  private sequences: Map<string, GestureSequence> = new Map();
  private activeSequences: Map<string, {
    sequence: GestureSequence;
    progress: string[]; // Completed gestures in sequence
    startTime: number;
    lastGestureTime: number;
  }> = new Map();
  private readonly STORAGE_KEY = 'gesture_sequences';
  private readonly SEQUENCE_TIMEOUT = 5000; // 5 seconds to complete sequence

  private constructor() {
    this.loadSequences();
    this.initializeDefaultSequences();
  }

  static getInstance(): GestureCombinationService {
    if (!GestureCombinationService.instance) {
      GestureCombinationService.instance = new GestureCombinationService();
    }
    return GestureCombinationService.instance;
  }

  /**
   * Process a gesture and check for sequence matches
   */
  processGesture(gestureId: string, confidence: number): SequenceMatch | null {
    if (confidence < 0.5) return null; // Only consider confident gestures

    const now = Date.now();
    let bestMatch: SequenceMatch | null = null;
    let bestConfidence = 0;

    // Check all active sequences
    for (const [sequenceId, active] of this.activeSequences) {
      const sequence = active.sequence;
      const expectedGestureIndex = active.progress.length;

      // Check if this gesture matches the next expected gesture
      if (expectedGestureIndex < sequence.gestures.length &&
          sequence.gestures[expectedGestureIndex] === gestureId &&
          confidence >= sequence.minConfidence) {

        // Check time window
        const timeSinceLastGesture = now - active.lastGestureTime;
        if (timeSinceLastGesture <= sequence.timeWindow) {
          // Add gesture to progress
          active.progress.push(gestureId);
          active.lastGestureTime = now;

          // Calculate match confidence
          const progressRatio = active.progress.length / sequence.gestures.length;
          const timeRatio = Math.max(0, 1 - (timeSinceLastGesture / sequence.timeWindow));
          const matchConfidence = (progressRatio * 0.7) + (timeRatio * 0.3);

          // Check if sequence is complete
          if (active.progress.length === sequence.gestures.length) {
            // Sequence completed!
            const completedMatch: SequenceMatch = {
              sequenceId,
              sequence,
              matchConfidence,
              completedGestures: [...active.progress],
              remainingGestures: [],
              timeElapsed: now - active.startTime
            };

            // Update usage statistics
            sequence.usageCount++;
            sequence.lastUsed = now;
            this.sequences.set(sequenceId, sequence);
            this.saveSequences();

            // Remove from active sequences
            this.activeSequences.delete(sequenceId);

            return completedMatch;
          } else {
            // Partial match - keep sequence active
            if (matchConfidence > bestConfidence) {
              bestMatch = {
                sequenceId,
                sequence,
                matchConfidence,
                completedGestures: [...active.progress],
                remainingGestures: sequence.gestures.slice(expectedGestureIndex + 1),
                timeElapsed: now - active.startTime
              };
              bestConfidence = matchConfidence;
            }
          }
        } else {
          // Time window exceeded - remove sequence
          this.activeSequences.delete(sequenceId);
        }
      }
    }

    // Check if this gesture starts any new sequences
    for (const [sequenceId, sequence] of this.sequences) {
      if (sequence.enabled &&
          sequence.gestures[0] === gestureId &&
          confidence >= sequence.minConfidence) {

        // Start new sequence
        this.activeSequences.set(sequenceId, {
          sequence,
          progress: [gestureId],
          startTime: now,
          lastGestureTime: now
        });

        // If this is a single-gesture sequence, complete it immediately
        if (sequence.gestures.length === 1) {
          const completedMatch: SequenceMatch = {
            sequenceId,
            sequence,
            matchConfidence: confidence,
            completedGestures: [gestureId],
            remainingGestures: [],
            timeElapsed: 0
          };

          // Update usage statistics
          sequence.usageCount++;
          sequence.lastUsed = now;
          this.sequences.set(sequenceId, sequence);
          this.saveSequences();

          // Remove from active sequences
          this.activeSequences.delete(sequenceId);

          return completedMatch;
        }
      }
    }

    // Clean up expired sequences
    this.cleanupExpiredSequences(now);

    return bestMatch;
  }

  /**
   * Get all available sequences
   */
  getAllSequences(): GestureSequence[] {
    return Array.from(this.sequences.values());
  }

  /**
   * Get active sequences (currently being performed)
   */
  getActiveSequences(): Array<{sequence: GestureSequence; progress: string[]; timeRemaining: number}> {
    const now = Date.now();
    const active: Array<{sequence: GestureSequence; progress: string[]; timeRemaining: number}> = [];

    for (const activeSeq of this.activeSequences.values()) {
      const timeRemaining = activeSeq.sequence.timeWindow - (now - activeSeq.lastGestureTime);
      if (timeRemaining > 0) {
        active.push({
          sequence: activeSeq.sequence,
          progress: [...activeSeq.progress],
          timeRemaining
        });
      }
    }

    return active;
  }

  /**
   * Add or update a gesture sequence
   */
  addSequence(sequence: Omit<GestureSequence, 'usageCount' | 'lastUsed'>): void {
    const fullSequence: GestureSequence = {
      ...sequence,
      usageCount: 0,
      lastUsed: 0
    };

    this.sequences.set(sequence.id, fullSequence);
    this.saveSequences();
    logger.info('Gesture sequence added:', sequence.name);
  }

  /**
   * Remove a gesture sequence
   */
  removeSequence(sequenceId: string): void {
    this.sequences.delete(sequenceId);
    this.activeSequences.delete(sequenceId);
    this.saveSequences();
    logger.info('Gesture sequence removed:', sequenceId);
  }

  /**
   * Enable or disable a sequence
   */
  setSequenceEnabled(sequenceId: string, enabled: boolean): void {
    const sequence = this.sequences.get(sequenceId);
    if (sequence) {
      sequence.enabled = enabled;
      this.sequences.set(sequenceId, sequence);
      this.saveSequences();
    }
  }

  /**
   * Get sequence usage statistics
   */
  getSequenceStats(): {
    totalSequences: number;
    activeSequences: number;
    mostUsedSequence: string;
    totalUsage: number;
  } {
    const sequences = Array.from(this.sequences.values());
    const activeCount = this.activeSequences.size;

    if (sequences.length === 0) {
      return {
        totalSequences: 0,
        activeSequences: 0,
        mostUsedSequence: '',
        totalUsage: 0
      };
    }

    const mostUsed = sequences.reduce((prev, current) =>
      prev.usageCount > current.usageCount ? prev : current
    );

    const totalUsage = sequences.reduce((sum, seq) => sum + seq.usageCount, 0);

    return {
      totalSequences: sequences.length,
      activeSequences: activeCount,
      mostUsedSequence: mostUsed.name,
      totalUsage
    };
  }

  // Private methods

  private initializeDefaultSequences(): void {
    // Only initialize if no sequences exist
    if (this.sequences.size > 0) return;

    const defaultSequences: Omit<GestureSequence, 'usageCount' | 'lastUsed'>[] = [
      {
        id: 'help_me_drink',
        name: 'Hilf mir trinken',
        description: 'Kombination für Trinkhilfe',
        gestures: ['help', 'drink'],
        combinedMeaning: 'Ich brauche Hilfe beim Trinken',
        timeWindow: 3000,
        minConfidence: 0.6,
        enabled: true
      },
      {
        id: 'thank_you_please',
        name: 'Danke bitte',
        description: 'Höfliche Dankesformel',
        gestures: ['thank_you', 'please'],
        combinedMeaning: 'Vielen Dank, bitte',
        timeWindow: 2000,
        minConfidence: 0.5,
        enabled: true
      },
      {
        id: 'good_morning',
        name: 'Guten Morgen',
        description: 'Morgengruß',
        gestures: ['good', 'morning'],
        combinedMeaning: 'Guten Morgen!',
        timeWindow: 2500,
        minConfidence: 0.5,
        enabled: true
      },
      {
        id: 'i_love_you',
        name: 'Ich liebe dich',
        description: 'Liebeserklärung',
        gestures: ['i', 'love', 'you'],
        combinedMeaning: 'Ich liebe dich',
        timeWindow: 4000,
        minConfidence: 0.5,
        enabled: true
      }
    ];

    defaultSequences.forEach(seq => this.addSequence(seq));
    logger.info('Default gesture sequences initialized');
  }

  private cleanupExpiredSequences(now: number): void {
    for (const [sequenceId, active] of this.activeSequences) {
      const timeSinceLastGesture = now - active.lastGestureTime;
      if (timeSinceLastGesture > active.sequence.timeWindow) {
        this.activeSequences.delete(sequenceId);
      }
    }
  }

  private async loadSequences(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.sequences = new Map(Object.entries(parsed));
      }
    } catch (error) {
      logger.warn('Failed to load gesture sequences:', error);
    }
  }

  private async saveSequences(): Promise<void> {
    try {
      const serialized = Object.fromEntries(this.sequences);
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(serialized));
    } catch (error) {
      logger.warn('Failed to save gesture sequences:', error);
    }
  }
}

export const gestureCombinationService = GestureCombinationService.getInstance();