import { database } from '../../db';
import { GestureDefinition } from '../../db/models';
import { loadUsageStats } from './usageTracker';
import { Q } from '@nozbe/watermelondb';
import { logger } from '../utils/logger';

export const adaptiveLearningService = {
  /**
   * Fetch adaptive suggestions based on the user's vocabulary and usage history.
   *
   * LLM Hint: The real implementation will query the local database and apply
   * lightweight heuristics (e.g., most recent selections) to propose related
   * symbols. For now this is a stub that returns an empty array.
   */
  async getSuggestions(vocabulary: any[], profileId: string): Promise<any[]> {
    try {
      const usage = await loadUsageStats(profileId);
      const ranked = Object.entries(usage)
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);
      const suggestions: any[] = [];
      for (const id of ranked) {
        const sym = vocabulary.find((s) => s.id === id);
        if (sym) suggestions.push(sym);
        if (suggestions.length >= 3) break;
      }
      return suggestions;
    } catch {
      return [];
    }
  },

  async getWeakGesture(threshold: number = 70): Promise<GestureDefinition | null> {
    try {
      const gestures = await database.get<GestureDefinition>('gesture_definitions')
        .query(
          Q.where('health_score', Q.lt(threshold))
        )
        .fetch();
      // For simplicity, return the first weak gesture found
      if (gestures.length > 0) {
        return gestures[0];
      }
      return null;
    } catch (error) {
      logger.error('Error fetching weak gesture:', error);
      return null;
    }
  },
};

export async function recordInteraction(gestureId: string, wasSuccessful: boolean): Promise<boolean> {
  try {
    await database.write(async () => {
      const gestureDefinition = await database.get<GestureDefinition>('gesture_definitions').find(gestureId);
      let score = gestureDefinition.healthScore;
      let threshold = gestureDefinition.minConfidenceThreshold;
      if (wasSuccessful) {
        score = Math.min(100, score + 1);
        threshold = Math.max(0, threshold - 0.01);
      } else {
        score = Math.max(0, score - 5);
        threshold = Math.min(1, threshold + 0.02);
      }
      await gestureDefinition.update(g => {
        g.healthScore = score;
        g.minConfidenceThreshold = threshold;
      });
    });
    return true; // Indicate success
  } catch (error) {
    logger.error('Error recording interaction:', error);
    return false; // Indicate failure
  }
}
