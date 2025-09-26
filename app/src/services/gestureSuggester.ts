import { gestureModel } from '../model';
import { logger } from '../utils/logger';

export interface GestureSuggestion {
  id: string;
  label: string;
  confidence: number;
  reason: 'similarity' | 'history' | 'context' | 'common_confusion';
}

export interface GestureContext {
  recentGestures: string[];
  timeOfDay: number;
  confidence: number;
  landmarks?: number[][][];
  handedness?: string[];
}

/**
 * Service for suggesting likely intended gestures based on various factors
 */
class GestureSuggester {
  private gestureHistory: string[] = [];
  private readonly MAX_HISTORY = 10;
  private suggestionStats: Record<string, { shown: number; accepted: number }> = {};

  /**
   * Get suggestions for a failed gesture attempt
   */
  getSuggestions(
    failedGesture: string | null,
    context: GestureContext,
    maxSuggestions: number = 3
  ): GestureSuggestion[] {
    const suggestions: GestureSuggestion[] = [];

    // Add to history for future suggestions
    if (failedGesture) {
      this.addToHistory(failedGesture);
    }

    // 1. History-based suggestions (recently successful gestures)
    const historySuggestions = this.getHistoryBasedSuggestions(context.recentGestures);
    suggestions.push(...historySuggestions);

    // 2. Similarity-based suggestions (hand shape analysis)
    if (context.landmarks && context.handedness) {
      const similaritySuggestions = this.getSimilarityBasedSuggestions(
        context.landmarks,
        context.handedness
      );
      suggestions.push(...similaritySuggestions);
    }

    // 3. Context-based suggestions (time of day, patterns)
    const contextSuggestions = this.getContextBasedSuggestions(context);
    suggestions.push(...contextSuggestions);

    // 4. Common confusion suggestions
    const confusionSuggestions = this.getCommonConfusionSuggestions(failedGesture);
    suggestions.push(...confusionSuggestions);

    // Remove duplicates and sort by confidence
    const uniqueSuggestions = this.deduplicateSuggestions(suggestions);
    uniqueSuggestions.forEach(s => {
      const stats = this.suggestionStats[s.id] ?? { shown: 0, accepted: 0 };
      this.suggestionStats[s.id] = stats;
      const successRate = stats.shown > 0 ? stats.accepted / stats.shown : 0;
      const weight = 0.5 + successRate / 2;
      s.confidence *= weight;
    });
    const sortedSuggestions = uniqueSuggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxSuggestions);

    // Track how often suggestions are shown
    sortedSuggestions.forEach(s => {
      const stats = this.suggestionStats[s.id] ?? { shown: 0, accepted: 0 };
      stats.shown += 1;
      this.suggestionStats[s.id] = stats;
    });

    logger.debug('Gesture suggestions generated:', sortedSuggestions);
    return sortedSuggestions;
  }

  /**
   * Add gesture to history for future suggestions
   */
  private addToHistory(gesture: string): void {
    this.gestureHistory.push(gesture);
    if (this.gestureHistory.length > this.MAX_HISTORY) {
      this.gestureHistory.shift();
    }
  }

  /**
   * Get suggestions based on recent successful gestures
   */
  private getHistoryBasedSuggestions(recentGestures: string[]): GestureSuggestion[] {
    const suggestions: GestureSuggestion[] = [];
    const recentSet = new Set(recentGestures.slice(-5)); // Last 5 gestures

    // Weight recent gestures higher
    Array.from(recentSet).forEach((gestureId, index) => {
      const entry = gestureModel.gestures.find(g => g.id === gestureId);
      if (entry) {
        const recencyWeight = (recentSet.size - index) / recentSet.size;
        suggestions.push({
          id: entry.id,
          label: entry.label,
          confidence: 0.6 * recencyWeight,
          reason: 'history'
        });
      }
    });

    return suggestions;
  }

  /**
   * Get suggestions based on hand shape similarity
   */
  private getSimilarityBasedSuggestions(
    landmarks: number[][][],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    handedness: string[]
  ): GestureSuggestion[] {
    const suggestions: GestureSuggestion[] = [];

    // Simple heuristic: compare finger positions
    // This is a simplified version - in a real implementation,
    // you'd use more sophisticated shape analysis
    const primaryHand = landmarks[0];
    if (!primaryHand) {
      return suggestions;
    }
    const handShape = this.analyzeHandShape(primaryHand);

    // Suggest gestures that might have similar hand shapes
    const shapeMatches: Record<string, string[]> = {
      'open_palm': ['hello', 'thank_you', 'please'],
      'fist': ['good', 'no', 'stop'],
      'point': ['yes', 'help', 'more'],
      'thumbs_up': ['good', 'yes', 'happy'],
    };

    const possibleMatches = shapeMatches[handShape] || [];
    possibleMatches.forEach(gestureId => {
      const entry = gestureModel.gestures.find(g => g.id === gestureId);
      if (entry) {
        suggestions.push({
          id: entry.id,
          label: entry.label,
          confidence: 0.5,
          reason: 'similarity'
        });
      }
    });

    return suggestions;
  }

  /**
   * Simple hand shape analysis
   */
  private analyzeHandShape(landmarks: number[][]): string {
    if (!landmarks || landmarks.length < 21) return 'unknown';

    // Check if fingers are extended (open palm)
    const fingerTips = [8, 12, 16, 20]; // Index, middle, ring, pinky tips
    const fingerBases = [6, 10, 14, 18]; // Finger bases


    let extendedFingers = 0;
    for (let i = 0; i < fingerTips.length; i++) {
      const tipIndex = fingerTips[i];
      const baseIndex = fingerBases[i];
      if (tipIndex === undefined || baseIndex === undefined) {
        continue;
      }
      const tip = landmarks[tipIndex]?.[1];
      const base = landmarks[baseIndex]?.[1];
      if (typeof tip !== 'number' || typeof base !== 'number') {
        continue;
      }
      if (tip < base) { // Finger extended
        extendedFingers++;
      }
    }

    if (extendedFingers >= 3) return 'open_palm';
    if (extendedFingers === 1) return 'point';
    if (extendedFingers === 0) return 'fist';

    // Check thumb position for thumbs up
    const thumbTip = landmarks[4]?.[0];
    const thumbBase = landmarks[2]?.[0];
    if (typeof thumbTip === 'number' && typeof thumbBase === 'number' && thumbTip > thumbBase) return 'thumbs_up';

    return 'unknown';
  }

  /**
   * Get suggestions based on context (time of day, etc.)
   */
  private getContextBasedSuggestions(context: GestureContext): GestureSuggestion[] {
    const suggestions: GestureSuggestion[] = [];
    const hour = Math.floor(context.timeOfDay / 60);

    // Time-based suggestions
    if (hour >= 6 && hour < 12) { // Morning
      suggestions.push({
        id: 'hello',
        label: 'Hallo',
        confidence: 0.4,
        reason: 'context'
      });
    } else if (hour >= 18 && hour < 22) { // Evening
      suggestions.push({
        id: 'good',
        label: 'Gut',
        confidence: 0.4,
        reason: 'context'
      });
    }

    return suggestions;
  }

  /**
   * Get suggestions for commonly confused gestures
   */
  private getCommonConfusionSuggestions(failedGesture: string | null): GestureSuggestion[] {
    const suggestions: GestureSuggestion[] = [];

    // Common gesture confusions
    const confusions: Record<string, string[]> = {
      'yes': ['good', 'please', 'thank_you'],
      'no': ['stop', 'good', 'bad'],
      'please': ['thank_you', 'hello', 'help'],
      'help': ['please', 'stop', 'more'],
    };

    if (failedGesture && confusions[failedGesture]) {
      confusions[failedGesture].forEach(gestureId => {
        const entry = gestureModel.gestures.find(g => g.id === gestureId);
        if (entry) {
          suggestions.push({
            id: entry.id,
            label: entry.label,
            confidence: 0.3,
            reason: 'common_confusion'
          });
        }
      });
    }

    return suggestions;
  }

  /**
   * Remove duplicate suggestions, keeping the one with highest confidence
   */
  private deduplicateSuggestions(suggestions: GestureSuggestion[]): GestureSuggestion[] {
    const seen = new Map<string, GestureSuggestion>();

    suggestions.forEach(suggestion => {
      const existing = seen.get(suggestion.id);
      if (!existing || suggestion.confidence > existing.confidence) {
        seen.set(suggestion.id, suggestion);
      }
    });

    return Array.from(seen.values());
  }

  /**
   * Clear gesture history
   */
  clearHistory(): void {
    this.gestureHistory = [];
    this.suggestionStats = {};
  }

  /**
   * Record whether a suggestion was accepted by the user
   */
  recordSuggestionResult(id: string, accepted: boolean): void {
    if (accepted) {
      const stats = (this.suggestionStats[id] ??= { shown: 0, accepted: 0 });
      stats.accepted++;
      if (stats.shown < stats.accepted) {
        stats.shown = stats.accepted;
      }
    }
  }

  /**
   * Expose suggestion stats for testing or analytics
   */
  getSuggestionStats(id: string): { shown: number; accepted: number } {
    return this.suggestionStats[id] || { shown: 0, accepted: 0 };
  }
}

export default new GestureSuggester();