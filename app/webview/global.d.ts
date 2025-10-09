/// <reference path="../src/declarations.d.ts" />

import type { unzip, unzipSync } from 'fflate';
import type { GestureRecognitionOrchestrator } from './core/GestureRecognitionOrchestrator';

export {};

declare global {
  interface Window {
    fflate?: { unzip: typeof unzip; unzipSync: typeof unzipSync };
    __setMlpModelB64?: (b64: string) => Promise<boolean>;
    __beginMlpTransfer?: () => boolean;
    __pushMlpChunk?: (chunk: string) => void;
    __commitMlpTransfer?: () => Promise<void>;
    __startClipCapture?: (id: string) => void;
    __stopClipCapture?: (id: string) => void;
    __gestureOrchestrator?: GestureRecognitionOrchestrator | null;
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
