import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import type { WebViewMessageEvent } from 'react-native-webview/lib/WebViewTypes';
import type { WebViewPermissionRequestEvent } from '../webviewTypes';

import { GestureWebView } from './GestureWebView';
import { gestureDetectorBase64 } from '../webview/gestureDetectorBase64';
import {
  CAMERA_WEBVIEW_BASE_URL,
  FALLBACK_CONFIDENCE_THRESHOLD,
  MLP_CONFIDENCE_THRESHOLD,
} from '../constants';
import { logger } from '../utils/logger';
import { useModelInjection } from '../hooks/useModelInjection';
import { fetchMlpModel, getCachedMlpModel, getCachedMlpMeta } from '../services/dgsModelClient';
import { loadActiveProfileId, onActiveProfileChange } from '../storage';
import type { ClipReadyPayload, FrameBatchPayload, FrameCapturePayload } from '../types/frames';

const MAX_ERROR_PAYLOAD_SNIPPET_LENGTH = 200;

const parseFrameCapturePayload = (capture: unknown): FrameCapturePayload => {
  if (typeof capture === 'string') {
    return capture;
  }

  if (capture && typeof capture === 'object') {
    const { base64, uri, width, height } = capture as {
      base64?: unknown;
      uri?: unknown;
      width?: unknown;
      height?: unknown;
    };

    const sanitized: { base64?: string; uri?: string; width?: number; height?: number } = {};

    if (typeof base64 === 'string' && base64.length > 0) {
      sanitized.base64 = base64;
    }

    if (typeof uri === 'string' && uri.length > 0) {
      sanitized.uri = uri;
    }

    if (typeof width === 'number') {
      sanitized.width = width;
    }

    if (typeof height === 'number') {
      sanitized.height = height;
    }

    if (sanitized.base64 || sanitized.uri) {
      return sanitized;
    }
  }

  return null;
};

export interface MediaPipeGestureDetectorHandle {
  startClipCapture: () => Promise<string>;
  stopClipCapture: () => Promise<ClipReadyPayload>;
  cancelClipCapture: () => void;
}

type ClipRequestState = {
  id: string | null;
  resolve?: (payload: ClipReadyPayload) => void;
  reject?: (error: Error) => void;
  timeout?: ReturnType<typeof setTimeout> | null;
};

export type CameraStateEvent =
  | 'camera_started'
  | 'camera_start_failed'
  | 'camera_start_hook_success'
  | 'camera_start_hook_error'
  | 'dom_ready'
  | 'cleanup_done';

export interface MediaPipeErrorDetails {
  reason?: string | null;
}

interface Props {
  onGestureDetected: (
    gesture: string | null,
    confidence: number,
    landmarks: number[][][],
    handedness: string[],
    frameCapture?: FrameCapturePayload,
  ) => void | Promise<void>;
  onLandmarks?: (
    landmarks: number[][][],
    handedness: string[],
  ) => void;
  onError: (error: string, details?: MediaPipeErrorDetails) => void;
  onWebViewEvent?: (telemetry: any) => void;
  onModelUpdateStatus?: (status: 'idle' | 'updating' | 'complete' | 'error') => void;
  facingMode?: 'user' | 'environment';
  onFrameBatch?: (payload: FrameBatchPayload) => void;
  gestureSizeTolerance?: number;
  onCameraStateChange?: (event: CameraStateEvent) => void;
}

const WEBVIEW_UNAVAILABLE_TEXT = 'Ich brauche einen Moment. Lass uns gleich weitermachen!';
const TAP_TO_START_TEXT = 'Tippe, um die Kamera zu starten';
const TAP_TO_START_ACCESSIBILITY_LABEL = 'Kamera starten';
const TAP_TO_START_ACCESSIBILITY_HINT =
  'Doppeltippen, um die Kamera zu aktivieren und die Berechtigung erneut zu öffnen.';
const RECOGNIZER_INIT_FAILED_TEXT = "Ich bin gleich bereit. Versuch's nochmal!";
const PREDICTION_ERROR_TEXT = "Das hat nicht geklappt. Lass es uns nochmal versuchen!";
const CAMERA_ERROR_TEXT = 'Die Kamera braucht einen Moment. Lass uns weitermachen!';
const CAMERA_RETRY_PROMPT_TEXT = 'Die Kamera braucht einen Moment. Tippe, um sie neu zu starten.';
const GESTURE_PROCESSING_ERROR_TEXT = "Das hat nicht geklappt. Probier's einfach nochmal!";
const CLIP_RECORDING_ERROR_TEXT = 'Videoclip konnte nicht gespeichert werden. Versuch es nochmal!';
const CLIP_UNSUPPORTED_DEVICE_TEXT = 'Dieses Gerät unterstützt keine Videoaufnahmen.';
const DEFAULT_GESTURE_SIZE_TOLERANCE = 0.3;

const escapeJs = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/'/g, "\\'");

export const MediaPipeGestureDetector = forwardRef<MediaPipeGestureDetectorHandle, Props>(
(
  {
    onGestureDetected,
    onLandmarks,
    onError,
    onWebViewEvent,
    onModelUpdateStatus,
    onFrameBatch,
    facingMode = 'user',
    gestureSizeTolerance = DEFAULT_GESTURE_SIZE_TOLERANCE,
    onCameraStateChange,
  },
  ref,
) => {
  const webviewRef = useRef<any>(null);
  const clipStateRef = useRef<ClipRequestState>({ id: null, timeout: null });
  const [webviewError, setWebviewError] = useState<string | null>(null);
  const [cameraPromptMessage, setCameraPromptMessage] = useState<string>(TAP_TO_START_TEXT);
  const [isCameraPromptVisible, setIsCameraPromptVisible] = useState<boolean>(true);

  const {
    injectModel,
    mlpReadyRef,
    pendingModelRef,
    pendingModelContextRef,
    markTransferComplete,
    requeueLastModel,
    resetTransferState,
  } = useModelInjection(
    webviewRef,
    onModelUpdateStatus,
  );

  const deliverGestureMessage = useCallback(
    (message: any) => {
      if (!message || typeof message !== 'object') {
        return false;
      }

      const gesture = typeof message.gesture === 'string' ? message.gesture : null;
      const rawConfidence =
        typeof message.confidence === 'number'
          ? message.confidence
          : parseFloat(String(message.confidence ?? ''));
      const confidence = Number.isFinite(rawConfidence) ? rawConfidence : 0;
      const landmarks = Array.isArray(message.landmarks) ? message.landmarks : [];
      const handedness = Array.isArray(message.handednesses)
        ? message.handednesses.map((label: unknown) =>
            typeof label === 'string' ? label : String(label ?? ''),
          )
        : [];

      const frameCapture: FrameCapturePayload = parseFrameCapturePayload(message?.frameCapture);

      void onGestureDetected(gesture, confidence, landmarks, handedness, frameCapture);
      return true;
    },
    [onGestureDetected],
  );

  const clearClipTimeout = useCallback(() => {
    const state = clipStateRef.current;
    if (state.timeout) {
      clearTimeout(state.timeout);
      state.timeout = null;
    }
  }, []);

  const resetClipState = useCallback(() => {
    clearClipTimeout();
    clipStateRef.current.id = null;
    delete clipStateRef.current.resolve;
    delete clipStateRef.current.reject;
  }, [clearClipTimeout]);

  const cancelClipCapture = useCallback(() => {
    const state = clipStateRef.current;
    if (!state.id) {
      return;
    }

    const clipId = state.id;

    if (webviewRef.current?.injectJavaScript) {
      try {
        webviewRef.current.injectJavaScript(
          `window.__cancelClipCapture && window.__cancelClipCapture(${JSON.stringify(clipId)}); true;`,
        );
      } catch (error) {
        logger.warn('Failed to forward cancelClipCapture to WebView', error);
      }
    }

    const error = new Error('clip_capture_cancelled');
    state.reject?.(error);
    resetClipState();
  }, [resetClipState]);

  const startClipCapture = useCallback(async () => {
    const state = clipStateRef.current;
    if (state.id) {
      logger.warn('Clip capture already active, returning existing request id', { clipId: state.id });
      return state.id;
    }

    if (!webviewRef.current) {
      throw new Error('webview_not_ready');
    }

    const clipId = `clip_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    state.id = clipId;

    try {
      webviewRef.current.injectJavaScript(
        `window.__startClipCapture && window.__startClipCapture(${JSON.stringify(clipId)}); true;`
      );
    } catch (error) {
      resetClipState();
      throw error instanceof Error ? error : new Error(String(error));
    }

    return clipId;
  }, [resetClipState]);

  const stopClipCapture = useCallback(() => {
    const state = clipStateRef.current;
    if (!state.id) {
      return Promise.reject(new Error('no_active_clip_capture'));
    }

    if (!webviewRef.current) {
      resetClipState();
      return Promise.reject(new Error('webview_not_ready'));
    }

    return new Promise<ClipReadyPayload>((resolve, reject) => {
      clearClipTimeout();
      state.resolve = (payload) => {
        resolve(payload);
      };
      state.reject = (error) => {
        reject(error);
      };
      state.timeout = setTimeout(() => {
        const timeoutError = new Error('clip_capture_timeout');
        state.reject?.(timeoutError);
        onError('clip_error', { reason: 'clip_capture_timeout' });
        resetClipState();
      }, 15000);

      try {
        webviewRef.current!.injectJavaScript(
          `window.__stopClipCapture && window.__stopClipCapture(${JSON.stringify(state.id)}); true;`
        );
      } catch (error) {
        clearClipTimeout();
        resetClipState();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }, [clearClipTimeout, onError, resetClipState]);

  useImperativeHandle(
    ref,
    () => ({
      startClipCapture,
      stopClipCapture,
      cancelClipCapture,
    }),
    [cancelClipCapture, startClipCapture, stopClipCapture],
  );

  useEffect(() => {
    let cancelled = false;

    const loadModel = async () => {
      try {
        const profileId = await loadActiveProfileId().catch((err) => {
          logger.warn('Failed to load active profile ID, using global model', err);
          return null;
        });

        let cached = await getCachedMlpModel(profileId ?? undefined);
        let cachedMeta = await getCachedMlpMeta(profileId ?? undefined);
        let cachedSource: string = profileId ? 'profile-cache' : 'global-cache';

        if (!cached && profileId) {
          cached = await getCachedMlpModel();
          cachedMeta = await getCachedMlpMeta();
          cachedSource = 'global-cache';
        }

        if (!cancelled && cached) {
          injectModel(cached, {
            profileId: cachedSource === 'global-cache' ? 'global' : profileId,
            version: cachedMeta?.version ?? null,
            source: cachedSource ?? 'cache',
            cached: true,
          });
        }

        const latest = await fetchMlpModel(profileId ?? undefined);
        if (!cancelled && latest) {
          let latestMeta = await getCachedMlpMeta(profileId ?? undefined);
          let source: string = profileId ? 'profile' : 'global';
          let contextProfileId: string | null | undefined = profileId ?? null;

          if (!latestMeta && profileId) {
            latestMeta = await getCachedMlpMeta();
            source = 'global';
            contextProfileId = 'global';
          }

          injectModel(latest, {
            profileId: contextProfileId,
            version: latestMeta?.version ?? null,
            source,
            cached: false,
          });
        }
      } catch (err) {
        logger.warn('Failed to load or inject MLP model', err);
      }
    };

    loadModel();
    const unsubscribe = onActiveProfileChange(() => {
      loadModel();
    });

    return () => {
      cancelled = true;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [injectModel, pendingModelRef]);

  useEffect(() => {
    return () => {
      try {
        webviewRef.current?.injectJavaScript(
          'window.__cleanupGestureDetector&&window.__cleanupGestureDetector();',
        );
      } catch (err) {
        logger.warn('Failed to inject WebView cleanup script', err);
      }
      cancelClipCapture();
    };
  }, [cancelClipCapture]);

  const inlineGestureDetectorSource = useMemo(
    () => `data:text/javascript;base64,${gestureDetectorBase64.replace(/\s+/g, '')}`,
    [],
  );

  const sanitizedGestureSizeTolerance = useMemo(() => {
    if (typeof gestureSizeTolerance !== 'number' || !Number.isFinite(gestureSizeTolerance)) {
      return DEFAULT_GESTURE_SIZE_TOLERANCE;
    }

    if (gestureSizeTolerance < 0) {
      return 0;
    }

    return gestureSizeTolerance;
  }, [gestureSizeTolerance]);

  const htmlContent = useMemo(() => {
    const tapToStart = escapeJs(TAP_TO_START_TEXT);
    const recognizerFailed = escapeJs(RECOGNIZER_INIT_FAILED_TEXT);
    const predictionError = escapeJs(PREDICTION_ERROR_TEXT);
    const cameraError = escapeJs(CAMERA_ERROR_TEXT);

    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script>
    window.__tapToStart = '${tapToStart}';
    window.__recognizerInitFailed = '${recognizerFailed}';
    window.__predictionError = '${predictionError}';
    window.__cameraError = '${cameraError}';
    window.__mlpThreshold = ${MLP_CONFIDENCE_THRESHOLD};
    window.__fallbackThreshold = ${FALLBACK_CONFIDENCE_THRESHOLD};
    window.__facingMode = '${escapeJs(facingMode)}';
    window.__mirrorOverlay = ${facingMode === 'user'};
    window.__gestureSizeTolerance = ${sanitizedGestureSizeTolerance};
    window.__autostartCamera = true;
  </script>
  <script>
    (function loadGestureBundle() {
      var src = ${JSON.stringify(inlineGestureDetectorSource)};
      try {
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = src;
        script.onload = function () {
          try {
            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
              window.ReactNativeWebView.postMessage(
                JSON.stringify({ type: 'telemetry', event: 'inline_bundle_loaded' })
              );
            }
          } catch (event) {
            console.warn('Failed to report inline bundle load', event);
          }
        };
        script.onerror = function (event) {
          console.error('Failed to load inline gesture bundle', event);
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(
              JSON.stringify({ type: 'error', message: 'inline_bundle_load_failed' })
            );
          }
        };
        document.head.appendChild(script);
      } catch (error) {
        console.error('Failed to bootstrap gesture bundle', error);
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: 'error', message: 'inline_bundle_exception' })
          );
        }
      }
    })();
  </script>
</head>
<body></body>
</html>`;
  }, [facingMode, inlineGestureDetectorSource, sanitizedGestureSizeTolerance]);

  const cameraStartRetryRef = useRef<{
    attempts: number;
    timeout: ReturnType<typeof setTimeout> | null;
  }>({
    attempts: 0,
    timeout: null,
  });

  const clearCameraStartRetryTimeout = useCallback(() => {
    const state = cameraStartRetryRef.current;
    if (state.timeout) {
      clearTimeout(state.timeout);
      state.timeout = null;
    }
  }, []);

  const injectCameraStartRequest = useCallback(
    (reason: string) => {
      const webview = webviewRef.current;
      if (!webview?.injectJavaScript) {
        return false;
      }

      const script = `
        (() => {
          try {
            const hook = window.__requestCameraStart;
            if (typeof hook === 'function') {
              const maybePromise = hook('${escapeJs(reason)}');
              if (maybePromise && typeof maybePromise === 'object' && typeof maybePromise.catch === 'function') {
                maybePromise.catch((error) => {
                  console.warn('Camera start hook rejected', error);
                });
              }
            }
          } catch (error) {
            console.warn('Failed to invoke camera start hook', error);
          }
        })();
        true;
      `;

      try {
        webview.injectJavaScript(script);
        return true;
      } catch (error) {
        logger.warn('Failed to inject camera start request', error);
        return false;
      }
    },
    [],
  );

  const scheduleCameraStartAttempt = useCallback(
    (reason: string, resetAttempts = false) => {
      const state = cameraStartRetryRef.current;
      if (resetAttempts) {
        state.attempts = 0;
      }

      const attemptNumber = state.attempts;
      const delay =
        attemptNumber === 0
          ? 0
          : Math.min(2000 * 2 ** Math.max(attemptNumber - 1, 0), 30000);

      clearCameraStartRetryTimeout();

      const runAttempt = () => {
        state.timeout = null;
        const injected = injectCameraStartRequest(reason);
        state.attempts = attemptNumber + 1;

        if (!injected) {
          scheduleCameraStartAttempt(reason, false);
        }
      };

      if (delay === 0) {
        runAttempt();
      } else {
        state.timeout = setTimeout(runAttempt, delay);
      }
    },
    [clearCameraStartRetryTimeout, injectCameraStartRequest],
  );

  const handleTapToStartPress = useCallback(() => {
    setCameraPromptMessage(TAP_TO_START_TEXT);
    setIsCameraPromptVisible(false);
    scheduleCameraStartAttempt('tap_overlay', true);
  }, [scheduleCameraStartAttempt]);

  useEffect(() => {
    return () => {
      clearCameraStartRetryTimeout();
      cameraStartRetryRef.current.attempts = 0;
    };
  }, [clearCameraStartRetryTimeout]);

  useEffect(() => {
    if (!webviewRef.current?.injectJavaScript) {
      return;
    }

    try {
      const script = `
        (() => {
          const value = ${sanitizedGestureSizeTolerance};
          window.__gestureSizeTolerance = value;
          if (window.__gestureOrchestrator) {
            try {
              if (typeof window.__gestureOrchestrator.updateGestureSizeTolerance === "function") {
                window.__gestureOrchestrator.updateGestureSizeTolerance(value);
              } else if (typeof window.__gestureOrchestrator.setGestureTolerance === "function") {
                window.__gestureOrchestrator.setGestureTolerance(value);
              }
            } catch (error) {
              console.warn("Failed to apply gesture size tolerance", error);
            }
          }
        })();
        true;
      `;

      webviewRef.current.injectJavaScript(script);
    } catch (err) {
      logger.warn('Failed to inject gesture size tolerance update', err);
    }
  }, [sanitizedGestureSizeTolerance]);

  const handlePermissionRequest = useCallback((event: WebViewPermissionRequestEvent) => {
    try {
      const { origin, resources, grant, deny } = event.nativeEvent;
      const normalizedOrigin = typeof origin === 'string' ? origin.trim() : '';
      const trustedOrigin =
        normalizedOrigin.length > 0 &&
        normalizedOrigin.toLowerCase().startsWith(CAMERA_WEBVIEW_BASE_URL.toLowerCase());

      if (!trustedOrigin) {
        logger.warn('WebView permission denied: untrusted origin', { origin: normalizedOrigin });
        deny?.();
        return;
      }

      const wantsCamera = Array.isArray(resources) && resources.includes('VIDEO_CAPTURE');
      if (wantsCamera) {
        grant?.(['VIDEO_CAPTURE']);
      } else {
        logger.warn('WebView permission denied: camera access not requested', {
          origin: normalizedOrigin,
          resources,
        });
        deny?.();
      }
    } catch (err) {
      logger.warn('Permission request handling failed', err);
      try {
        event?.nativeEvent?.deny?.();
      } catch {}
    }
  }, []);

  const forwardLandmarks = useCallback(
    (payload: unknown) => {
      if (!onLandmarks) {
        return;
      }

      if (!payload || typeof payload !== 'object') {
        onLandmarks([], []);
        return;
      }

      const { landmarks, handedness, handednesses } = payload as {
        landmarks?: unknown;
        handedness?: unknown;
        handednesses?: unknown;
      };

      const normalizedLandmarks = Array.isArray(landmarks)
        ? (landmarks as number[][][])
        : [];
      const handednessCandidates = Array.isArray(handedness)
        ? [handedness]
        : Array.isArray(handednesses)
        ? handednesses
        : [];
      const primaryHandedness = handednessCandidates.find(
        (entry): entry is string[] =>
          Array.isArray(entry) && entry.some((label) => typeof label === 'string'),
      );
      const normalizedHandedness = Array.isArray(primaryHandedness)
        ? primaryHandedness
            .filter((label): label is string => typeof label === 'string')
            .map((label) => label)
        : [];

      onLandmarks(normalizedLandmarks, normalizedHandedness);
    },
    [onLandmarks],
  );

  const forwardFrameBatch = useCallback(
    (payload: unknown) => {
      if (!onFrameBatch || !payload || typeof payload !== 'object') {
        return;
      }

      const data = payload as FrameBatchPayload & {
        handednesses?: unknown;
        timestamps?: unknown;
      };
      const frames = Array.isArray(data.frames)
        ? data.frames.filter((frame: unknown): frame is string => typeof frame === 'string')
        : [];
      const landmarks = Array.isArray(data.landmarks)
        ? (data.landmarks as number[][][][])
        : [];
      const timestamps = Array.isArray(data.timestamps)
        ? data.timestamps.filter((ts: unknown): ts is number => typeof ts === 'number')
        : [];
      const handednesses = Array.isArray(data.handednesses)
        ? data.handednesses.map((entry: unknown) => {
            if (!Array.isArray(entry)) {
              return [] as string[];
            }
            return entry
              .filter((label: unknown): label is string => typeof label === 'string')
              .map((label) => label);
          })
        : [];

      onFrameBatch({ frames, landmarks, handednesses, timestamps });
    },
    [onFrameBatch],
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        if (data.type === 'gesture') {
          if (deliverGestureMessage(data)) {
            setWebviewError(null);
          }
        } else if (data.type === 'landmarks') {
          forwardLandmarks(data);
        } else if (data.type === 'gesture_batch') {
          const messages = Array.isArray(data.messages) ? data.messages : [];
          let processedCount = 0;

          for (const message of messages) {
            const messageType =
              message && typeof message === 'object'
                ? (message as { type?: string }).type
                : undefined;

            if (messageType === 'FRAME_BATCH') {
              forwardFrameBatch(message);
            } else if (messageType === 'landmarks') {
              forwardLandmarks(message);
            } else if (messageType === 'telemetry') {
              onWebViewEvent?.(message);
            } else if (deliverGestureMessage(message)) {
              processedCount += 1;
            }
          }

          if (processedCount > 0) {
            setWebviewError(null);
          }

          if (onWebViewEvent) {
            const messageCount =
              typeof data.messageCount === 'number' ? data.messageCount : messages.length;
            const telemetry: {
              type: 'telemetry';
              event: 'gesture_batch_received';
              batchSize: number;
              processedCount: number;
              messageCount?: number;
              frameCount?: number;
              lastSentAt?: number;
            } = {
              type: 'telemetry',
              event: 'gesture_batch_received',
              batchSize: messageCount,
              processedCount,
            };

          if (typeof data.messageCount === 'number') {
            telemetry.messageCount = data.messageCount;
          }
          if (typeof data.frameCount === 'number') {
            telemetry.frameCount = data.frameCount;
          }
          if (typeof data.lastSentAt === 'number') {
            telemetry.lastSentAt = data.lastSentAt;
          }

          onWebViewEvent(telemetry);
        }
      } else if (data.type === 'FRAME_BATCH') {
          forwardFrameBatch(data);
        } else if (data.type === 'clip_ready') {
          const clipId = typeof data.id === 'string' ? data.id : null;
          if (!clipId || clipId !== clipStateRef.current.id) {
            return;
          }
          const payload: ClipReadyPayload = {
            id: clipId,
            base64: typeof data.base64 === 'string' ? data.base64 : '',
            mimeType: typeof data.mimeType === 'string' ? data.mimeType : 'video/mp4',
            durationMs: typeof data.durationMs === 'number' ? data.durationMs : 0,
            frameCount: typeof data.frameCount === 'number' ? data.frameCount : 0,
            capturedAt:
              typeof data.capturedAt === 'string' ? data.capturedAt : new Date().toISOString(),
          };
          clearClipTimeout();
          clipStateRef.current.resolve?.(payload);
          resetClipState();
        } else if (data.type === 'clip_error') {
          const errorId = typeof data.id === 'string' ? data.id : null;
          const reason = typeof data.reason === 'string' ? data.reason : 'clip_error';

          if (errorId && errorId !== clipStateRef.current.id) {
            logger.debug('Ignoring stale clip_error event', { errorId, currentId: clipStateRef.current.id });
            return;
          }

          if (clipStateRef.current.id) {
            clearClipTimeout();
            clipStateRef.current.reject?.(new Error(reason));
            resetClipState();
          }
          if (reason === 'media_recorder_unavailable' || reason === 'media_recorder_not_supported') {
            setWebviewError(CLIP_UNSUPPORTED_DEVICE_TEXT);
          } else {
            setWebviewError(CLIP_RECORDING_ERROR_TEXT);
          }
          const details: MediaPipeErrorDetails = { reason };
          onError('clip_error', details);
        } else if (data.type === 'telemetry') {
          onWebViewEvent?.(data);
          const eventName = data.event;

          if (eventName === 'mlp_ready') {
            mlpReadyRef.current = true;
            if (pendingModelRef.current) {
              const queuedModel = pendingModelRef.current;
              const queuedContext = pendingModelContextRef.current;
              pendingModelRef.current = null;
              pendingModelContextRef.current = null;
              try {
                injectModel(queuedModel, queuedContext ?? undefined);
              } catch (error) {
                pendingModelRef.current = queuedModel;
                pendingModelContextRef.current = queuedContext;
                throw error;
              }
            } else {
              const replayed = requeueLastModel?.();
              if (!replayed) {
                logger.debug('No stored MLP model available to replay after WebView reload');
              } else {
                logger.info('Replaying stored MLP model after WebView reload');
              }
            }
          } else if (eventName === 'mlp_transfer_complete' || eventName === 'mlp_transfer_skipped') {
            markTransferComplete();
            onModelUpdateStatus?.('complete');
          } else if (eventName === 'mlp_transfer_failed') {
            markTransferComplete();
            onModelUpdateStatus?.('error');
            setWebviewError(PREDICTION_ERROR_TEXT);
            setIsCameraPromptVisible(false);
          } else if (eventName === 'cleanup_done') {
            mlpReadyRef.current = false;
            resetTransferState?.();
            onCameraStateChange?.('cleanup_done');
            setCameraPromptMessage(TAP_TO_START_TEXT);
            setIsCameraPromptVisible(true);
          } else if (eventName === 'gesture_processing_error') {
            setWebviewError(GESTURE_PROCESSING_ERROR_TEXT);
            setIsCameraPromptVisible(false);
          } else if (eventName === 'camera_started' || eventName === 'camera_start_hook_success') {
            clearCameraStartRetryTimeout();
            cameraStartRetryRef.current.attempts = 0;
            setWebviewError(null);
            setIsCameraPromptVisible(false);
            onCameraStateChange?.(eventName);
          } else if (eventName === 'dom_ready') {
            setWebviewError(null);
            setCameraPromptMessage(TAP_TO_START_TEXT);
            setIsCameraPromptVisible(true);
            scheduleCameraStartAttempt('dom_ready', true);
            onCameraStateChange?.('dom_ready');
          } else if (eventName === 'camera_start_failed' || eventName === 'camera_start_hook_error') {
            setWebviewError(null);
            setCameraPromptMessage(CAMERA_RETRY_PROMPT_TEXT);
            setIsCameraPromptVisible(true);
            scheduleCameraStartAttempt('dom_ready_retry');
            onCameraStateChange?.(eventName);
          }
        } else if (data.type === 'error') {
          const errorMessage = typeof data.message === 'string' ? data.message : 'gesture_processing_error';
          logger.error('WebView error', {
            message: errorMessage,
            code: (data as { code?: string }).code,
          });
          setWebviewError(GESTURE_PROCESSING_ERROR_TEXT);
          setIsCameraPromptVisible(false);
          onError(errorMessage);
        }
      } catch (err) {
        const rawPayloadString =
          typeof event?.nativeEvent?.data === 'string' ? event.nativeEvent.data : '';
        const snippet = rawPayloadString
          .trim()
          .replace(/[\r\n\t]+/g, ' ')
          .slice(0, MAX_ERROR_PAYLOAD_SNIPPET_LENGTH);
        logger.error('Error parsing WebView message', {
          error: err,
          payloadSnippet: snippet || undefined,
        });
        setWebviewError(GESTURE_PROCESSING_ERROR_TEXT);
        setIsCameraPromptVisible(false);
        const baseMessage =
          err instanceof Error && err.message ? err.message : 'gesture_processing_error';
        const errorMessage = snippet ? `${baseMessage}: ${snippet}` : baseMessage;
        onError(errorMessage);
      }
    },
    [
      clearCameraStartRetryTimeout,
      deliverGestureMessage,
      forwardFrameBatch,
      forwardLandmarks,
      injectModel,
      markTransferComplete,
      mlpReadyRef,
      onError,
      onModelUpdateStatus,
      onWebViewEvent,
      pendingModelRef,
      pendingModelContextRef,
      requeueLastModel,
      resetTransferState,
      scheduleCameraStartAttempt,
      onCameraStateChange,
    ],
  );

  const handleWebviewError = useCallback(
    (nativeEvent: unknown, type: 'runtime' | 'http') => {
      logger.warn(type === 'runtime' ? 'WebView runtime error' : 'WebView HTTP error', nativeEvent);
      setWebviewError(WEBVIEW_UNAVAILABLE_TEXT);
      setIsCameraPromptVisible(false);
      onError(type === 'runtime' ? 'webview_load_error' : 'webview_http_error');
    },
    [onError],
  );

  return (
    <View style={styles.container}>
      <GestureWebView
        ref={webviewRef}
        htmlContent={htmlContent}
        onMessage={handleMessage}
        onError={(e: any) => handleWebviewError(e?.nativeEvent, 'runtime')}
        onHttpError={(e: any) => handleWebviewError(e?.nativeEvent, 'http')}
        onConsoleMessage={(e: any) => logger.debug('WebView console message', e.nativeEvent?.message)}
        onPermissionRequest={handlePermissionRequest}
      />

      {isCameraPromptVisible && (
        <Pressable
          pointerEvents="auto"
          accessibilityRole="button"
          accessibilityLabel={TAP_TO_START_ACCESSIBILITY_LABEL}
          accessibilityHint={TAP_TO_START_ACCESSIBILITY_HINT}
          onPress={handleTapToStartPress}
          style={styles.errorOverlay}
        >
          <Text style={styles.errorText}>{cameraPromptMessage}</Text>
        </Pressable>
      )}

      {webviewError && (
        <View pointerEvents="none" style={styles.errorOverlay}>
          <Text style={styles.errorText}>{webviewError}</Text>
        </View>
      )}
    </View>
  );
});

function createStyles<T extends Record<string, any>>(sheet: T): T {
  if (StyleSheet && typeof StyleSheet.create === 'function') {
    return StyleSheet.create(sheet) as T;
  }
  return sheet;
}

const absoluteFill =
  StyleSheet && StyleSheet.absoluteFillObject
    ? StyleSheet.absoluteFillObject
    : {
      position: 'absolute' as const,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    };

const styles = createStyles({
  container: {
    flex: 1,
  },
  errorOverlay: {
    ...absoluteFill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(17, 24, 39, 0.75)',
    paddingHorizontal: 24,
  },
  errorText: {
    color: '#f9fafb',
    fontSize: 16,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  },
});
