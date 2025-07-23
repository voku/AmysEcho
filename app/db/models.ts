import { Model } from '@nozbe/watermelondb';
import { field, relation, text, date, children, json } from '@nozbe/watermelondb/decorators';

export class Profile extends Model {
  static table = 'profiles';
  static associations = {
    vocabulary_sets: { type: 'belongs_to', key: 'active_vocabulary_set_id' },
  } as const;

  @text('name') name!: string;
  @field('consent_help_me_get_smarter') consentHelpMeGetSmarter!: boolean;
  @field('consent_help_me_learn_over_time') consentHelpMeLearnOverTime!: boolean;
  @field('large_text') largeText!: boolean;
  @field('high_contrast') highContrast!: boolean;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @relation('vocabulary_sets', 'active_vocabulary_set_id') activeVocabularySet: any;
}

export class Symbol extends Model {
  static table = 'symbols';

  @text('name') name!: string;
  @text('icon_name') iconName!: string;
  @text('video_asset_path') videoAssetPath?: string;
  @text('dgs_video_asset_path') dgsVideoAssetPath?: string;
  @text('audio_uri') audioUri?: string;
  @text('category') category!: string;
  @field('priority') priority!: number;
  @field('is_active') isActive!: boolean;
  @date('created_at') createdAt!: Date;
  @text('emoji') emoji!: string;
  @text('color') color!: string;
  @field('health_score') healthScore!: number;
  @field('context_tags') contextTagsRaw?: string;

  get label(): string {
    return this.name;
  }

  get imageAssetPath(): string {
    return this.iconName;
  }

  get contextTags(): string[] {
    if (!this.contextTagsRaw) return [];
    try {
      return JSON.parse(this.contextTagsRaw);
    } catch {
      return [];
    }
  }
}

export class VocabularySet extends Model {
  static table = 'vocabulary_sets';
  static associations = {
    vocabulary_set_symbols: { type: 'has_many', foreignKey: 'vocabulary_set_id' },
  } as const;

  @field('name') name!: string;
}

export class UsageStat extends Model {
  static table = 'usage_stats';
  @relation('profiles', 'profile_id') profile!: any;
  @relation('symbols', 'symbol_id') symbol!: any;
  @field('usage_count') usageCount!: number;
}

export class VocabularySetSymbol extends Model {
  static table = 'vocabulary_set_symbols';
  @relation('vocabulary_sets', 'vocabulary_set_id') vocabularySet!: any;
  @relation('symbols', 'symbol_id') symbol!: any;
}

export class GestureDefinition extends Model {
  static table = 'gesture_definitions';
  static associations = {
    symbols: { type: 'belongs_to', key: 'symbol_id' },
    gesture_training_data: { type: 'has_many', foreignKey: 'gesture_definition_id' },
  } as const;

  @text('name') name!: string;
  @text('status') status!: string;
  @field('health_score') healthScore!: number;
  @field('min_confidence_threshold') minConfidenceThreshold!: number;
  @field('training_sessions_count') trainingSessionsCount!: number;
  @date('last_successful_recognition') lastSuccessfulRecognition!: Date | null;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @relation('symbols', 'symbol_id') symbol!: any;
  @children('gesture_training_data') trainingData!: any;
}

export class GestureTrainingData extends Model {
  static table = 'gesture_training_data';
  static associations = {
    gesture_definitions: { type: 'belongs_to', key: 'gesture_definition_id' },
  } as const;
  @text('landmark_data') landmarkData!: string;
  @text('source') source!: string;
  @field('quality_score') qualityScore!: number;
  @text('frame_metadata') frameMetadata!: string;
  @date('created_at') createdAt!: Date;
  @relation('gesture_definitions', 'gesture_definition_id') gestureDefinition!: any;
}

export class InteractionLog extends Model {
  static table = 'interaction_logs';
  @text('session_id') sessionId!: string;
  @text('gesture_definition_id') gestureDefinitionId!: string;
  @field('was_successful') wasSuccessful!: boolean;
  @field('confidence_score') confidenceScore!: number;
  @text('input_type') inputType!: string;
  @field('processing_time_ms') processingTimeMs!: number;
  @text('caregiver_override_id') caregiverOverrideId?: string;
  @text('environmental_context') environmentalContext!: string;
  @date('created_at') createdAt!: Date;
}

export class LearningAnalytic extends Model {
  static table = 'learning_analytics';
  @text('gesture_definition_id') gestureDefinitionId!: string;
  @field('success_rate_24h') successRate24h!: number;
  @field('success_rate_7d') successRate7d!: number;
  @field('avg_confidence_score') avgConfidenceScore!: number;
  @text('improvement_trend') improvementTrend!: string;
  @date('last_calculated') lastCalculated!: Date;
}


export function sanitizeLandmarks(data: any): any {
  return data;
}

export class Correction extends Model {
  static table = 'corrections';

  @text('predicted_gesture') predictedGesture!: string;
  @text('actual_gesture') actualGesture!: string;
  @field('confidence') confidence!: number;
  @json('landmarks', sanitizeLandmarks) landmarks!: number[][];
  @field('timestamp') timestamp!: number;
  @field('is_synced') isSynced!: boolean;
}
