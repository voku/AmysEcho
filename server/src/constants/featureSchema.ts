import path from 'path';
import { readFileSync } from 'fs';
import { SERVER_DIR } from './modelPaths.js';

type FeatureSchema = {
  coordinatesPerLandmark: number;
  landmarks: {
    hands: { perHand: number; totalHands: number; points: number };
    pose: { points: number };
    face: { points: number };
  };
  features: {
    hand: number;
    pose: number;
    face: number;
    multimodal: number;
  };
  windowSize: number;
  windowFeatureSize: number;
};

const schemaPath = path.join(SERVER_DIR, '..', 'spec', 'feature_schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as FeatureSchema;

export const FEATURE_SCHEMA = schema;
export const HAND_LANDMARKS_PER_HAND = schema.landmarks.hands.perHand;
export const TOTAL_HAND_LANDMARKS = schema.landmarks.hands.points;
export const POSE_LANDMARKS = schema.landmarks.pose.points;
export const FACE_LANDMARKS = schema.landmarks.face.points;
export const MULTIMODAL_LANDMARKS =
  schema.landmarks.hands.points + schema.landmarks.pose.points + schema.landmarks.face.points;
export const MULTIMODAL_FEATURE_SIZE = schema.features.multimodal;
export const WINDOW_SIZE = schema.windowSize;
export const WINDOW_FEATURE_SIZE = schema.windowFeatureSize;
