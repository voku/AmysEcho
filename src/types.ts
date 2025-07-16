export interface SymbolRecord {
  id: string;
  name: string;
  emoji: string;
  color: string;
  audioUri: string;
  healthScore: number;
}

export type GestureDefinitionStatus = 'training' | 'ready' | 'disabled';

export interface GestureDefinition {
  id: string;
  symbolId: string;
  status: GestureDefinitionStatus;
  healthScore: number;
  minConfidenceThreshold: number;
}

export type TrainingSource = 'HIP_2' | 'HIP_3';
export type SyncStatus = 'pending' | 'synced';

export interface GestureTrainingData {
  id: string;
  gestureDefinitionId: string;
  landmarkData: unknown;
  source: TrainingSource;
  syncStatus: SyncStatus;
}

export type ProcessedBy = 'local' | 'cloud';

export interface InteractionLog {
  id: string;
  gestureDefinitionId: string;
  wasSuccessful: boolean;
  confidenceScore: number;
  timestamp: number;
  caregiverOverrideId?: string;
  processedBy: ProcessedBy;
}

export interface Profile {
  id: string;
  consentDataUpload: boolean;
  consentHelpMeGetSmarter: boolean;
  vocabularySetId: string;
  largeText?: boolean;
  highContrast?: boolean;
}

export interface LearningAnalytics {
  id: string;
  successRate7d: number;
  improvementTrend: number;
}
