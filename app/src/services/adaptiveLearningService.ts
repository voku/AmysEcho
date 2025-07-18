import { loadUsageStats } from './usageTracker';

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
};

