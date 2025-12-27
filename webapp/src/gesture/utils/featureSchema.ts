import schema from '../../../../spec/feature_schema.json';

type FeatureSchema = typeof schema;

const typedSchema = schema as FeatureSchema;

export const FEATURE_SCHEMA = typedSchema;
export const HAND_LANDMARKS_PER_HAND = typedSchema.landmarks.hands.perHand;
export const TOTAL_HAND_LANDMARKS = typedSchema.landmarks.hands.points;
export const POSE_LANDMARKS = typedSchema.landmarks.pose.points;
export const FACE_LANDMARKS = typedSchema.landmarks.face.points;
export const HAND_FEATURES_SIZE = typedSchema.features.hand;
export const POSE_FEATURES_SIZE = typedSchema.features.pose;
export const FACE_FEATURES_SIZE = typedSchema.features.face;
export const MULTIMODAL_FEATURES_SIZE = typedSchema.features.multimodal;
export const WINDOW_SIZE = typedSchema.windowSize;
