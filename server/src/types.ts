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

export type SignDefinitionStatus = "training" | "ready" | "disabled";

export interface SignDefinition {
	id: string;
	symbolId: string;
	status: SignDefinitionStatus;
	healthScore: number;
	minConfidenceThreshold: number;
}

export type TrainingSource = "HIP_2" | "HIP_3";
export type SyncStatus = "pending" | "synced";

export interface SignTrainingData {
	id: string;
	signId: string;
	landmarkData: unknown;
	source: TrainingSource;
	syncStatus: SyncStatus;
	approved: boolean;
}

export type ProcessedBy = "local" | "cloud";

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
	userId: string; // Owner of this profile (UUID from StoredUser)
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

export type UserRole = "admin" | "caregiver" | "user";

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
	/** Hash of the current valid refresh token (for rotation) */
	refreshTokenHash?: string;
	/** When the refresh token was issued */
	refreshTokenIssuedAt?: number;
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

/**
 * Training mode for a label
 * - server_pretrain: Uses curated bootstrap examples inside the normal training pipeline
 * - user_train: Uses user-recorded samples from the webapp
 */
export type LabelTrainingMode = "server_pretrain" | "user_train";

/**
 * Per-profile, per-label training settings
 * Amy First: Each child can have their own personalized label collection
 */
export interface UserLabelSetting {
	id: string;
	/** Profile ID that owns this setting */
	profileId: string;
	/** Label ID (e.g., "rot", "blau") */
	labelId: string;
	/** Training mode: server_pretrain or user_train */
	mode: LabelTrainingMode;
	/** Whether training for this label is enabled */
	enabled: boolean;
	/** Last update timestamp (ISO string) */
	updatedAt: string;
	/** Last successful training timestamp (ISO string) */
	lastTrainedAt?: string;
}

/**
 * Readiness status for a label
 * Amy First: Clear visibility into why training might not be ready
 */
export interface LabelReadinessStatus {
	/** Label ID */
	labelId: string;
	/** Display name in German */
	displayName: string;
	/** Current training mode */
	mode: LabelTrainingMode;
	/** Whether the label is enabled for training */
	enabled: boolean;
	/** Number of server-pretrain videos available */
	serverVideoCount: number;
	/** Number of user-recorded samples */
	userSampleCount: number;
	/** Number of landmarks extracted */
	landmarkCount: number;
	/** Whether the label is ready for training */
	ready: boolean;
	/** Reasons why the label is not ready (empty if ready) */
	reasons: string[];
	/** Last trained timestamp */
	lastTrainedAt?: string;
}
