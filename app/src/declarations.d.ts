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

export {};

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
    __cleanupGestureDetector?: () => void;
    __beginMlpTransfer?: () => void;
    __pushMlpChunk?: (chunk: string) => void;
    __commitMlpTransfer?: () => void;
  }
}
