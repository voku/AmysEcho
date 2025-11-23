// @ts-nocheck
/**
 * Gesture Combination Manager - Amy First
 * Enables complex communication through gesture sequences
 */

export interface GestureSequence {
  gestures: string[];
  combinationName: string;
  description: string;
  timeWindow: number; // Max time between gestures in sequence (ms)
  minConfidence: number; // Minimum confidence for each gesture in sequence
}

export interface CombinationAttempt {
  sequence: string[];
  timestamp: number;
  confidence: number;
  timeSpan: number;
  completed: boolean;
}

export interface CombinationResult {
  combination: string;
  confidence: number;
  sequence: string[];
  description: string;
  timeSpan: number;
  feedback?: string;
}

export class GestureCombinationManager {
  private gestureHistory: Array<{gesture: string; confidence: number; timestamp: number}> = [];
  private readonly HISTORY_SIZE = 10;
  private readonly MAX_SEQUENCE_TIME = 5000; // 5 seconds max between gestures
  private readonly MIN_SEQUENCE_TIME = 200; // 200ms min between gestures

  // Predefined combinations for Amy's communication needs
  private predefinedCombinations: GestureSequence[] = [
    {
      gestures: ['thumbs_up', 'thumbs_up'],
      combinationName: 'double_thumbs_up',
      description: 'Super happy / Great job!',
      timeWindow: 2000,
      minConfidence: 0.6
    },
    {
      gestures: ['thumbs_up', 'open_palm'],
      combinationName: 'thumbs_up_open_palm',
      description: 'I want to play / Let\'s have fun!',
      timeWindow: 2500,
      minConfidence: 0.6
    },
    {
      gestures: ['fist', 'open_palm'],
      combinationName: 'fist_open_palm',
      description: 'Stop / No more',
      timeWindow: 2000,
      minConfidence: 0.6
    },
    {
      gestures: ['point', 'thumbs_up'],
      combinationName: 'point_thumbs_up',
      description: 'I like that / Good choice',
      timeWindow: 3000,
      minConfidence: 0.6
    },
    {
      gestures: ['open_palm', 'fist'],
      combinationName: 'open_palm_fist',
      description: 'Help me / I need assistance',
      timeWindow: 2500,
      minConfidence: 0.6
    },
    {
      gestures: ['thumbs_up', 'point'],
      combinationName: 'thumbs_up_point',
      description: 'Show me / Tell me more',
      timeWindow: 3000,
      minConfidence: 0.6
    }
  ];

  private customCombinations: GestureSequence[] = [];

  /**
   * Record a gesture for combination detection
   */
  recordGesture(gesture: string, confidence: number): void {
    const timestamp = Date.now();

    // Add to history
    this.gestureHistory.push({
      gesture,
      confidence,
      timestamp
    });

    // Maintain history size
    if (this.gestureHistory.length > this.HISTORY_SIZE) {
      this.gestureHistory.shift();
    }

    // Clean old gestures
    this.cleanOldGestures();
  }

  /**
   * Check for completed gesture combinations
   */
  checkForCombinations(): CombinationResult | null {
    if (this.gestureHistory.length < 2) {
      return null;
    }

    // Check predefined combinations
    for (const combination of this.predefinedCombinations) {
      const result = this.checkCombination(combination);
      if (result) {
        return result;
      }
    }

    // Check custom combinations
    for (const combination of this.customCombinations) {
      const result = this.checkCombination(combination);
      if (result) {
        return result;
      }
    }

    return null;
  }

  /**
   * Check if a specific combination is completed
   */
  private checkCombination(sequence: GestureSequence): CombinationResult | null {
    const { gestures, combinationName, description, timeWindow, minConfidence } = sequence;

    if (this.gestureHistory.length < gestures.length) {
      return null;
    }

    // Get recent gestures within time window
    const now = Date.now();
    const recentGestures = this.gestureHistory.filter(
      h => now - h.timestamp <= timeWindow
    );

    if (recentGestures.length < gestures.length) {
      return null;
    }

    // Check if the sequence matches
    const sequenceMatches = this.checkSequenceMatch(recentGestures, gestures, minConfidence);

    if (!sequenceMatches) {
      return null;
    }

    // Calculate combination confidence and time span
    const matchedGestures = recentGestures.slice(-gestures.length);
    const avgConfidence = matchedGestures.reduce((sum, g) => sum + g.confidence, 0) / matchedGestures.length;
    const timeSpan = matchedGestures[matchedGestures.length - 1].timestamp - matchedGestures[0].timestamp;

    // Clear the matched gestures from history to prevent duplicate detection
    this.clearMatchedGestures(matchedGestures);

    return {
      combination: combinationName,
      confidence: avgConfidence,
      sequence: matchedGestures.map(g => g.gesture),
      description,
      timeSpan,
      feedback: this.generateCombinationFeedback(combinationName, avgConfidence)
    };
  }

  /**
   * Check if recent gestures match the expected sequence
   */
  private checkSequenceMatch(
    recentGestures: Array<{gesture: string; confidence: number; timestamp: number}>,
    expectedSequence: string[],
    minConfidence: number
  ): boolean {
    if (recentGestures.length < expectedSequence.length) {
      return false;
    }

    // Check the last N gestures match the sequence
    const candidateGestures = recentGestures.slice(-expectedSequence.length);

    for (let i = 0; i < expectedSequence.length; i++) {
      if (candidateGestures[i].gesture !== expectedSequence[i] ||
          candidateGestures[i].confidence < minConfidence) {
        return false;
      }
    }

    // Check timing - gestures should be reasonably spaced
    for (let i = 1; i < candidateGestures.length; i++) {
      const timeDiff = candidateGestures[i].timestamp - candidateGestures[i - 1].timestamp;
      if (timeDiff < this.MIN_SEQUENCE_TIME || timeDiff > this.MAX_SEQUENCE_TIME) {
        return false;
      }
    }

    return true;
  }

  /**
   * Clear matched gestures from history to prevent duplicate detection
   */
  private clearMatchedGestures(matchedGestures: Array<{gesture: string; confidence: number; timestamp: number}>): void {
    // Remove the matched gestures from history
    const matchedTimestamps = new Set(matchedGestures.map(g => g.timestamp));
    this.gestureHistory = this.gestureHistory.filter(g => !matchedTimestamps.has(g.timestamp));
  }

  /**
   * Generate feedback for successful combination
   */
  private generateCombinationFeedback(combinationName: string, confidence: number): string {
    const baseMessages = {
      double_thumbs_up: ['Fantastic! You\'re so happy!', 'Super thumbs up! Great job!', 'Double happy! 🎉'],
      thumbs_up_open_palm: ['Let\'s play! You want to have fun!', 'Play time! Great idea!', 'Fun time ahead! 🎈'],
      fist_open_palm: ['Okay, we\'ll stop now.', 'Got it, time to finish.', 'Stopping as requested.'],
      point_thumbs_up: ['You like that choice!', 'Good pick! You made a great choice!', 'Perfect selection! 👍'],
      open_palm_fist: ['I\'m here to help!', 'Help is on the way!', 'Let me assist you! 🤝'],
      thumbs_up_point: ['You want to learn more!', 'Curious mind! Let\'s explore!', 'Great question! 🔍']
    };

    const messages = baseMessages[combinationName as keyof typeof baseMessages] || ['Great combination!'];
    const messageIndex = Math.floor(Math.random() * messages.length);

    if (confidence > 0.8) {
      return messages[messageIndex] + ' (Perfect timing!)';
    } else if (confidence > 0.7) {
      return messages[messageIndex] + ' (Nice work!)';
    } else {
      return messages[messageIndex];
    }
  }

  /**
   * Add a custom gesture combination
   */
  addCustomCombination(combination: GestureSequence): void {
    this.customCombinations.push(combination);
  }

  /**
   * Remove a custom combination
   */
  removeCustomCombination(combinationName: string): void {
    this.customCombinations = this.customCombinations.filter(c => c.combinationName !== combinationName);
  }

  /**
   * Get all available combinations
   */
  getAllCombinations(): GestureSequence[] {
    return [...this.predefinedCombinations, ...this.customCombinations];
  }

  /**
   * Get combination progress (for partial completion feedback)
   */
  getCombinationProgress(): { expected: string; progress: number; nextGesture?: string } | null {
    if (this.gestureHistory.length === 0) {
      return null;
    }

    // Check if we're in the middle of any combination
    for (const combination of [...this.predefinedCombinations, ...this.customCombinations]) {
      const progress = this.checkPartialProgress(combination);
      if (progress) {
        return progress;
      }
    }

    return null;
  }

  /**
   * Check progress toward a combination
   */
  private checkPartialProgress(sequence: GestureSequence): { expected: string; progress: number; nextGesture?: string } | null {
    const { gestures, timeWindow } = sequence;
    const now = Date.now();

    // Get recent gestures within time window
    const recentGestures = this.gestureHistory.filter(
      h => now - h.timestamp <= timeWindow
    );

    if (recentGestures.length === 0) {
      return null;
    }

    // Check if recent gestures match the start of the sequence
    let matchCount = 0;
    for (let i = 0; i < Math.min(recentGestures.length, gestures.length - 1); i++) {
      if (recentGestures[recentGestures.length - 1 - i].gesture === gestures[gestures.length - 1 - i]) {
        matchCount++;
      } else {
        break;
      }
    }

    if (matchCount > 0 && matchCount < gestures.length) {
      return {
        expected: sequence.combinationName,
        progress: matchCount / gestures.length,
        nextGesture: gestures[matchCount]
      };
    }

    return null;
  }

  /**
   * Clean old gestures from history
   */
  private cleanOldGestures(): void {
    const now = Date.now();
    const maxAge = Math.max(...this.predefinedCombinations.map(c => c.timeWindow));

    this.gestureHistory = this.gestureHistory.filter(
      h => now - h.timestamp <= maxAge
    );
  }

  /**
   * Reset combination history
   */
  reset(): void {
    this.gestureHistory = [];
  }

  /**
   * Get combination statistics
   */
  getCombinationStats(): {
    totalAttempts: number;
    successfulCombinations: number;
    averageTimeSpan: number;
    popularCombinations: Array<{name: string; count: number}>;
  } {
    // This would track combination usage over time
    // For now, return basic structure
    return {
      totalAttempts: 0,
      successfulCombinations: 0,
      averageTimeSpan: 0,
      popularCombinations: []
    };
  }
}