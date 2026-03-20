export interface FrameData {
  landmarks: number[][][];
  handedness?: string[];
}

export interface ClipReadyPayload {
  id: string;
  base64: string;
  mimeType: string;
  durationMs: number;
  frameCount: number;
  capturedAt: string;
}

export interface FrameBatchPayload {
  frames?: string[];
  landmarks: number[][][][];
  handednesses?: string[][];
  poseLandmarks?: number[][][];
  faceLandmarks?: number[][][];
  timestamps?: number[];
}

export type FrameCapturePayload =
  | string
  | {
      base64?: string;
      uri?: string;
      width?: number;
      height?: number;
    }
  | null;
