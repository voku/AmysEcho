import type { unzip, unzipSync } from 'fflate';
import type { MLPPrediction } from './MediaPipeTypes';

export interface GestureWindowAugmentations {
  ReactNativeWebView?: { postMessage?: (message: string) => void };
  fileset_resolver?: { FilesetResolver: any };
  vision?: { 
    GestureRecognizer: any;
    HolisticLandmarker?: any;
    PoseLandmarker?: any;
    FaceLandmarker?: any;
  };
  __mlpPredict?: (
    landmarks: number[][][],
    handednesses: unknown,
    poseLandmarks?: number[][],
    faceLandmarks?: number[][],
    audioFeatures?: Float32Array
  ) => MLPPrediction | null;
  __tapToStart?: string;
  __recognizerInitFailed?: string;
  __predictionError?: string;
  __cameraError?: string;
  __mirrorOverlay?: boolean;
  __mlpThreshold?: number;
  __gestureSizeTolerance?: number;
  __amyIntensity?: 'gentle' | 'normal' | 'strong';
  __amyTimeBased?: boolean;
  __amyContextAware?: boolean;
  __autostartCamera?: boolean;
  __requestCameraStart?: (source?: string) => Promise<boolean> | boolean;
  __visionBundleSri?: string;
  __visionBundleNonce?: string;
  __mediapipeVersion?: string;
  __allowCdnEsm?: boolean;
  __cleanupGestureDetector?: (() => void) | undefined;
  __beginMlpTransfer?: () => boolean;
  __pushMlpChunk?: (chunk: string) => void;
  __commitMlpTransfer?: () => Promise<void>;
  __setMlpModelB64?: (b64: string) => Promise<boolean>;
  fflate?: { unzip: typeof unzip; unzipSync: typeof unzipSync };
}
