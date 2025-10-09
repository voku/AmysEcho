declare module 'crypto-js';
declare module 'react-native-webview';
declare module '*.npz' {
  const value: number;
  export default value;
}
declare module 'expo-file-system' {
  export enum FileSystemUploadType {
    BINARY_CONTENT = 0,
    MULTIPART = 1,
  }
}

import type { unzip, unzipSync } from 'fflate';

export {};

declare global {
  // Allow responsive style objects in React Native style props without TS noise
  // This keeps UI code concise while we progressively migrate to a typed responsive system.
  // It affects only type checking; runtime behavior is unchanged.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNativeStyleAugment {
    type ResponsiveValue = { sm?: any; md?: any; lg?: any; xl?: any };
  }
}

declare module 'react-native' {
  // Broadly relax style prop value types to accept responsive objects
  interface ViewStyle {
    [key: string]: any | ReactNativeStyleAugment.ResponsiveValue;
  }
  interface TextStyle {
    [key: string]: any | ReactNativeStyleAugment.ResponsiveValue;
  }
  interface ImageStyle {
    [key: string]: any | ReactNativeStyleAugment.ResponsiveValue;
  }
}

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage?: (msg: string) => void };
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
    __amyIntensity?: 'gentle' | 'normal' | 'strong';
    __amyTimeBased?: boolean;
    __amyContextAware?: boolean;
    __autostartCamera?: boolean;
    __visionBundleSri?: string;
    __visionBundleNonce?: string;
    __mediapipeVersion?: string;
    __allowCdnEsm?: boolean;
    __cleanupGestureDetector?: () => void;
    __beginMlpTransfer?: () => boolean;
    __pushMlpChunk?: (chunk: string) => void;
    __commitMlpTransfer?: () => Promise<void>;
    __setMlpModelB64?: (b64: string) => Promise<boolean>;
    fflate?: { unzip: typeof unzip; unzipSync: typeof unzipSync };
  }
}
