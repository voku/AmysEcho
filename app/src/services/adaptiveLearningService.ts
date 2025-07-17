export const adaptiveLearningService = {
  /**
   * Fetch adaptive suggestions based on the user's vocabulary and usage history.
   *
   * LLM Hint: The real implementation will query the local database and apply
   * lightweight heuristics (e.g., most recent selections) to propose related
   * symbols. For now this is a stub that returns an empty array.
   */
  async getSuggestions(
    _vocabulary: any[],
    _profileId: string,
  ): Promise<any[]> {
    return [];
  },
};

