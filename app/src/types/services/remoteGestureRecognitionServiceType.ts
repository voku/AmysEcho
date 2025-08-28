import { Vector3D,GestureRecognitionResult } from '../';

export interface RecognitionResponse {
  result: GestureRecognitionResult;
  landmarks: Vector3D[];
  landmarks_px?: Vector3D[];
  image_size?: { width: number; height: number };
  handedness?: string | null;
  categories?: Array<{ name: string | null; score: number }>;
  appLabel?: string | null;
  appConfidence?: number | null;
}