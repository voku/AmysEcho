interface GestureResult {
  label: string;
  confidence: number;
}

export interface RecognitionResponse {
  result: GestureResult;
  landmarks: Array<[number, number, number]>;
  landmarks_px?: Array<[number, number, number]>;
  image_size?: { width: number; height: number };
  handedness?: string | null;
  categories?: Array<{ name: string | null; score: number }>;
  appLabel?: string | null;
  appConfidence?: number | null;
}