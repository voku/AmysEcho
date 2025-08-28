export interface LearningAnalytics {
  successRate7d: number;
  improvementTrend: number;
}

export interface InteractionLog {
  id: string;
  gestureDefinitionId: string;
  gestureName: string;
  wasSuccessful: boolean;
  confidenceScore: number;
  timestamp: number;
  processedBy: 'local' | 'cloud' | 'centroid';
  caregiverOverrideId?: string;
}

export interface GestureStats {
  gestureDefinitionId: string;
  successCount: number;
  failureCount: number;
}