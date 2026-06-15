/**
 * MediaPipe Tasks Vision SDK loader
 * Handles dynamic loading and initialization of MediaPipe components
 */

import { logger } from '../../services/logger';
import {
  MEDIAPIPE_TASKS_VISION_CDN_BASE,
  MEDIAPIPE_TASKS_VISION_VERSION,
} from '../config/MediaPipeDependencies';

// Types for MediaPipe components
export interface MediaPipeComponents {
  FilesetResolver: any;
  GestureRecognizer: any;
  HolisticLandmarker?: any;
  PoseLandmarker?: any;
  FaceLandmarker?: any;
  wasmBase: string;
}

/**
 * Dynamically load MediaPipe Tasks Vision from CDN
 */
function describeError(error: unknown): { message: string; name?: string; stack?: string } {
  if (error && typeof error === 'object') {
    const withProps = error as { message?: unknown; name?: unknown; stack?: unknown };
    const result: { message: string; name?: string; stack?: string } = {
      message: typeof withProps.message === 'string' ? withProps.message : String(error),
    };
    if (typeof withProps.name === 'string') {
      result.name = withProps.name;
    }
    if (typeof withProps.stack === 'string') {
      result.stack = withProps.stack;
    }
    return result;
  }
  return { message: String(error) };
}

function errorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return String(error);
}

export async function loadTasksVision(): Promise<MediaPipeComponents> {
  // Resolve a pinned version from host config if provided
  async function resolvePinnedBase() {
    const pinnedVersion = (window as any).__mediapipeVersion;
    if (typeof pinnedVersion === 'string' && pinnedVersion.length) {
      return { base: MEDIAPIPE_TASKS_VISION_CDN_BASE, version: pinnedVersion };
    }
    return {
      base: MEDIAPIPE_TASKS_VISION_CDN_BASE,
      version: MEDIAPIPE_TASKS_VISION_VERSION,
    };
  }

  function tryLoadScript(src: string, integrity?: string, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      if (integrity) {
        s.integrity = integrity;
        s.crossOrigin = 'anonymous';
      }
      if ((window as any).__visionBundleNonce) {
        s.nonce = (window as any).__visionBundleNonce;
      }
      s.async = true;
      const cleanup = () => {
        s.onload = s.onerror = null;
        if (s.parentNode) s.parentNode.removeChild(s);
      };
      const to = setTimeout(() => {
        cleanup();
        console.warn(`Script load timeout after ${timeoutMs}ms: ${src}`);
        reject(new Error(`Script load timeout after ${timeoutMs}ms: ${src}`));
      }, timeoutMs);
      s.onload = () => {
        clearTimeout(to);
        cleanup();
        console.log(`Script loaded successfully: ${src}`);
        resolve(null);
      };
      s.onerror = (event) => {
        clearTimeout(to);
        cleanup();
        console.error(`Script failed to load: ${src}`, event);
        reject(new Error(`Script failed to load: ${src}`));
      };
      document.head.appendChild(s);
    });
  }

  const haveUMD = () =>
    window.fileset_resolver &&
    window.fileset_resolver.FilesetResolver &&
    window.vision &&
    window.vision.GestureRecognizer;
    // Note: HolisticLandmarker is optional, graceful fallback supported

  // Compute preferred URLs
  const pinned = await resolvePinnedBase();
  const candidates = [];
  if (pinned) {
    candidates.push({
      umd: pinned.base + '/@mediapipe/tasks-vision@' + pinned.version + '/vision_bundle.cjs',
      esm: pinned.base + '/@mediapipe/tasks-vision@' + pinned.version + '/vision_bundle.mjs',
      wasm: pinned.base + '/@mediapipe/tasks-vision@' + pinned.version + '/wasm',
    });
  }
  // Generic latest as fallback
  candidates.push({
    umd: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.cjs',
    esm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs',
    wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm',
  });
  candidates.push({
    umd: 'https://unpkg.com/@mediapipe/tasks-vision/vision_bundle.cjs',
    esm: 'https://unpkg.com/@mediapipe/tasks-vision/vision_bundle.mjs',
    wasm: 'https://unpkg.com/@mediapipe/tasks-vision/wasm',
  });

  let lastError: unknown = null;
  let attemptCount = 0;

  for (const c of candidates) {
    attemptCount++;
    try {
      logger.debug(`Attempting to load MediaPipe from ${c.esm} (attempt ${attemptCount}/${candidates.length})`);

      // Try ESM first
      try {
        const mod = await import(/* @vite-ignore */ c.esm);
        if (mod?.FilesetResolver && mod?.GestureRecognizer) {
          logger.info('Successfully loaded MediaPipe via ESM');
          return {
            FilesetResolver: mod.FilesetResolver,
            GestureRecognizer: mod.GestureRecognizer,
            HolisticLandmarker: mod.HolisticLandmarker, // Optional
            PoseLandmarker: mod.PoseLandmarker, // Optional
            FaceLandmarker: mod.FaceLandmarker, // Optional
            wasmBase: c.wasm,
          };
        }
      } catch (e) {
        console.warn(`ESM import failed for ${c.esm}:`, e);
    lastError = e;
      }

      // Try UMD as fallback
      logger.debug(`Attempting to load MediaPipe from ${c.umd} (attempt ${attemptCount}/${candidates.length})`);
      if (!haveUMD()) {
        const sri =
          pinned && c.umd.includes(`@${pinned.version}/`) ? (window as any).__visionBundleSri : undefined;
        await tryLoadScript(c.umd, sri);
      }
      if (haveUMD()) {
        logger.info('Successfully loaded MediaPipe via UMD');
        return {
          FilesetResolver: window.fileset_resolver!.FilesetResolver,
          GestureRecognizer: window.vision!.GestureRecognizer,
          HolisticLandmarker: window.vision!.HolisticLandmarker, // Optional
          PoseLandmarker: window.vision!.PoseLandmarker, // Optional
          FaceLandmarker: window.vision!.FaceLandmarker, // Optional
          wasmBase: c.wasm,
        };
      }
    } catch (e) {
      console.warn(`MediaPipe load attempt ${attemptCount} failed:`, e);
    lastError = e;
    }
  }

  // Provide more detailed error information
  const errorDetails = {
    attempts: attemptCount,
    candidates: candidates.map(c => ({ umd: c.umd, esm: c.esm })),
    lastError: lastError ? describeError(lastError) : null,
    userAgent: navigator.userAgent,
    hasFetch: typeof fetch !== 'undefined',
    isSecureContext: window.isSecureContext,
  };

  console.error('All MediaPipe loading attempts failed:', errorDetails);

  throw new Error(
    'Tasks Vision globals not available after ' + attemptCount + ' attempts' +
      (lastError ? ': ' + errorMessage(lastError) : ''),
  );
}