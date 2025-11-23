// @ts-nocheck
import type { unzip, unzipSync } from 'fflate';

export interface GestureWindowAugmentations {
  ReactNativeWebView?: { postMessage?: (message: string) => void };
  fileset_resolver?: { FilesetResolver: any };
  vision?: { GestureRecognizer: any };
  __mlpPredict?: (
    landmarks: number[][][],
    handednesses: unknown,
  ) => { label: string; score: number } | null;
  __tapToStart?: string;
  __recognizerInitFailed?: string;
  __predictionError?: string;
  __cameraError?: string;
  __facingMode?: string;
  __mirrorOverlay?: boolean;
  __mlpThreshold?: number;
  __fallbackThreshold?: number;
  __gestureSizeTolerance?: number;
  __requestClipAudio?: boolean;
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
