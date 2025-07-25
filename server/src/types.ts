export interface SymbolRecord {
  id: string;
  name: string;
  emoji: string;
  color: string;
  audioUri: string;
  /** Optional path to a German Sign Language (DGS) demonstration video */
  dgsVideoUri?: string;
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

export interface VocabularySet {
  id: string;
  name: string;
}

export interface VocabularySetSymbol {
  id: string;
  vocabularySetId: string;
  symbolId: string;
}

export interface UsageStat {
  id: string;
  symbolId: string;
  profileId: string;
  count: number;
}

export interface LearningAnalytics {
  id: string;
  successRate7d: number;
  improvementTrend: number;
}
