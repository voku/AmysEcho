import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const mySchema = appSchema({
  version: 5,
  tables: [
    tableSchema({
      name: 'profiles',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'consent_help_me_get_smarter', type: 'boolean' },
        { name: 'consent_help_me_learn_over_time', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'active_vocabulary_set_id', type: 'string', isOptional: true, isIndexed: true },
      ],
    }),
    tableSchema({
      name: 'symbols',
      columns: [
        { name: 'name', type: 'string', isIndexed: true },
        { name: 'icon_name', type: 'string' },
        { name: 'video_asset_path', type: 'string', isOptional: true },
        { name: 'dgs_video_asset_path', type: 'string', isOptional: true },
        { name: 'category', type: 'string', isIndexed: true },
        { name: 'priority', type: 'number' },
        { name: 'is_active', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'emoji', type: 'string' },
        { name: 'color', type: 'string' },
        { name: 'health_score', type: 'number' },
        { name: 'context_tags', type: 'string', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'vocabulary_sets',
      columns: [{ name: 'name', type: 'string' }],
    }),
    tableSchema({
      name: 'vocabulary_set_symbols',
      columns: [
        { name: 'vocabulary_set_id', type: 'string', isIndexed: true },
        { name: 'symbol_id', type: 'string', isIndexed: true },
      ],
    }),
    tableSchema({
      name: 'usage_stats',
      columns: [
        { name: 'profile_id', type: 'string', isIndexed: true },
        { name: 'symbol_id', type: 'string', isIndexed: true },
        { name: 'usage_count', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'gesture_definitions',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'health_score', type: 'number' },
        { name: 'symbol_id', type: 'string', isIndexed: true },
        { name: 'min_confidence_threshold', type: 'number' },
        { name: 'training_sessions_count', type: 'number' },
        { name: 'last_successful_recognition', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'gesture_training_data',
      columns: [
        { name: 'gesture_definition_id', type: 'string', isIndexed: true },
        { name: 'landmark_data', type: 'string' },
        { name: 'source', type: 'string', isIndexed: true },
        { name: 'quality_score', type: 'number' },
        { name: 'frame_metadata', type: 'string' },
        { name: 'created_at', type: 'number', isIndexed: true },
      ],
    }),
    tableSchema({
      name: 'interaction_logs',
      columns: [
        { name: 'session_id', type: 'string', isIndexed: true },
        { name: 'gesture_definition_id', type: 'string', isIndexed: true },
        { name: 'was_successful', type: 'boolean', isIndexed: true },
        { name: 'confidence_score', type: 'number' },
        { name: 'input_type', type: 'string' },
        { name: 'processing_time_ms', type: 'number' },
        { name: 'caregiver_override_id', type: 'string', isOptional: true },
        { name: 'environmental_context', type: 'string' },
        { name: 'created_at', type: 'number', isIndexed: true },
      ],
    }),
    tableSchema({
      name: 'corrections',
      columns: [
        { name: 'predicted_gesture', type: 'string', isIndexed: true },
        { name: 'actual_gesture', type: 'string', isIndexed: true },
        { name: 'confidence', type: 'number' },
        { name: 'landmarks', type: 'string' },
        { name: 'timestamp', type: 'number', isIndexed: true },
        { name: 'is_synced', type: 'boolean' },
      ],
    }),
    tableSchema({
      name: 'learning_analytics',
      columns: [
        { name: 'gesture_definition_id', type: 'string', isIndexed: true },
        { name: 'success_rate_24h', type: 'number' },
        { name: 'success_rate_7d', type: 'number' },
        { name: 'avg_confidence_score', type: 'number' },
        { name: 'improvement_trend', type: 'string' },
        { name: 'last_calculated', type: 'number' },
      ],
    }),
  ],
});
