import type { unzip, unzipSync } from 'fflate';
import type { GestureRecognitionOrchestrator } from './core/GestureRecognitionOrchestrator';

export {};

declare global {
  interface Window {
    fflate?: { unzip: typeof unzip; unzipSync: typeof unzipSync };
    ReactNativeWebView?: { postMessage?: (message: string) => void };
    __setMlpModelB64?: (b64: string) => Promise<boolean>;
    __mlpFeatureMode?: 'absolute' | 'relative_delta';
    __beginMlpTransfer?: () => boolean;
    __pushMlpChunk?: (chunk: string) => void;
    __commitMlpTransfer?: () => Promise<void>;
    __startClipCapture?: (id: string) => void;
    __stopClipCapture?: (id: string) => void;
    __cancelClipCapture?: (id?: string) => void;
    __requestCameraStart?: (source?: string) => Promise<boolean>;
    __cleanupGestureDetector?: () => void;
    __gestureOrchestrator?: GestureRecognitionOrchestrator | null;
    __currentProfileId?: string;
    __getGestureSystemStatus?: () =>
      | {
          initialized: boolean;
          running: boolean;
          performance: unknown;
          memory: unknown;
          health: unknown;
        }
      | { error: string };
  }
}
