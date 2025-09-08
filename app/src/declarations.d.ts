declare module 'crypto-js';
declare module 'react-native-webview';
declare module 'expo-crypto' {
  export enum CryptoDigestAlgorithm {
    SHA256 = 'SHA256',
  }
  export function digestFileAsync(
    algorithm: CryptoDigestAlgorithm,
    fileUri: string
  ): Promise<string>;
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
    fileset_resolver?: any;
    vision?: any;
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
