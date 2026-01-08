export interface SymbolRecord {
  id: string;
  name: string;
  emoji: string;
  color: string;
  category?: string;
  imageUrl?: string;
  audioUri: string;
  /** Optional path to a German Sign Language (DGS) demonstration video */
  dgsVideoUri?: string;
  healthScore: number;
  /** ID of the child profile this symbol belongs to. If undefined, it is a global symbol. */
  profileId?: string;
}

export type SignDefinitionStatus = 'training' | 'ready' | 'disabled';

export interface SignDefinition {
  id: string;
  symbolId: string;
  status: SignDefinitionStatus;
  healthScore: number;
  minConfidenceThreshold: number;
}

export type TrainingSource = 'HIP_2' | 'HIP_3';
export type SyncStatus = 'pending' | 'synced';

export interface SignTrainingData {
  id: string;
  signId: string;
  landmarkData: unknown;
  source: TrainingSource;
  syncStatus: SyncStatus;
  approved: boolean;
}

export type ProcessedBy = 'local' | 'cloud';

export interface InteractionLog {
  id: string;
  signId: string;
  wasSuccessful: boolean;
  confidenceScore: number;
  timestamp: number;
  caregiverOverrideId?: string;
  processedBy: ProcessedBy;
}

export interface ManifestEntry {
  label: string;
  profileId?: string | null;
}

export interface ProfileMetadata {
  ageYears?: number;
  birthDate?: string;
  primaryLanguage?: string;
  notes?: string;
}

export interface Profile {
  id: string;
  displayName: string;
  createdAt: string;
  metadata?: ProfileMetadata;
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
  signId: string; // Added gestureDefinitionId
  successRate24h: number;
  successRate7d: number;
  avgConfidenceScore: number; // Added avgConfidenceScore
  improvementTrend: number;
  lastCalculated: number; // Added lastCalculated
}

export type UserRole = 'admin' | 'caregiver' | 'user';

export interface StoredUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  displayName?: string;
  role: UserRole;
  createdAt: number;
  emailVerifiedAt?: number;
  emailVerificationTokenHash?: string;
  emailVerificationExpiresAt?: number;
  emailVerificationSentAt?: number;
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: number;
  passwordResetRequestedAt?: number;
}


export interface Correction {
  id: string;
  predictedSign: string;
  actualSign: string;
  confidence: number;
  timestamp: number;
  isSynced: boolean;
  profileId?: string; // Assuming corrections can be linked to a profile
}

export interface NegativeSample {
  id: string;
  sign: string;
  timestamp: number;
}
