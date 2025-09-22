import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
import { fetchMlpModel, getCachedMlpModel } from '../services/dgsModelClient';
import { loadActiveProfileId, onActiveProfileChange } from '../storage';

interface Props {
  onGestureDetected: (
    gesture: string | null,
    confidence: number,
    landmarks: number[][][],
    handedness: string[],
  ) => void;
  onError: (error: string) => void;
  onWebViewEvent?: (telemetry: any) => void;
  onModelUpdateStatus?: (status: 'idle' | 'updating' | 'complete' | 'error') => void;
  facingMode?: 'user' | 'environment';
}

const WEBVIEW_UNAVAILABLE_TEXT = 'Ich brauche einen Moment. Lass uns gleich weitermachen!';
const TAP_TO_START_TEXT = 'Tippe, um die Kamera zu starten';
const RECOGNIZER_INIT_FAILED_TEXT = 'Ich bin gleich bereit. Versuch\'s nochmal!';
const PREDICTION_ERROR_TEXT = 'Das hat nicht geklappt. Lass es uns nochmal versuchen!';
const CAMERA_ERROR_TEXT = 'Die Kamera braucht einen Moment. Lass uns weitermachen!';
const GESTURE_PROCESSING_ERROR_TEXT = 'Das hat nicht geklappt. Probier\'s einfach nochmal!';

const escapeJs = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/'/g, "\\'");

export const MediaPipeGestureDetector: React.FC<Props> = ({
  onGestureDetected,
  onError,
  onWebViewEvent,
  onModelUpdateStatus,
  facingMode = 'user',
}) => {
  const webviewRef = useRef<any>(null);
  const [webviewError, setWebviewError] = useState<string | null>(null);

  const { injectModel, mlpReadyRef, pendingModelRef, markTransferComplete } = useModelInjection(
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

      onGestureDetected(gesture, confidence, landmarks, handedness);
      return true;
    },
    [onGestureDetected],
  );

  useEffect(() => {
    let cancelled = false;

    const loadModel = async () => {
      try {
        const profileId = await loadActiveProfileId().catch((err) => {
          logger.warn('Failed to load active profile ID, using global model', err);
          return null;
        });

        const cached = await getCachedMlpModel(profileId ?? undefined);
        if (!cancelled && cached) {
          pendingModelRef.current = cached;
          injectModel(cached);
        }

        const latest = await fetchMlpModel(profileId ?? undefined);
        if (!cancelled && latest && latest !== cached) {
          pendingModelRef.current = latest;
          injectModel(latest);
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
    };
  }, []);

  const inlineGestureDetectorSource = useMemo(
    () => `data:text/javascript;base64,${gestureDetectorBase64.replace(/\s+/g, '')}`,
    [],
  );

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
    window.__gestureSizeTolerance = 0.3;
    window.__autostartCamera = false;
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
  }, [facingMode, inlineGestureDetectorSource]);

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

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        if (data.type === 'gesture') {
          if (deliverGestureMessage(data)) {
            setWebviewError(null);
          }
        } else if (data.type === 'gesture_batch') {
          const messages = Array.isArray(data.messages) ? data.messages : [];
          let processedCount = 0;

          for (const message of messages) {
            if (deliverGestureMessage(message)) {
              processedCount += 1;
            }
          }

          if (processedCount > 0) {
            setWebviewError(null);
          }

          if (onWebViewEvent) {
            const messageCount =
              typeof data.messageCount === 'number' ? data.messageCount : messages.length;
            const telemetry: Record<string, unknown> = {
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
        } else if (data.type === 'telemetry') {
          onWebViewEvent?.(data);
          const eventName = data.event;

          if (eventName === 'mlp_ready') {
            mlpReadyRef.current = true;
            if (pendingModelRef.current) {
              injectModel(pendingModelRef.current);
            }
          } else if (eventName === 'mlp_transfer_complete' || eventName === 'mlp_transfer_skipped') {
            markTransferComplete();
            onModelUpdateStatus?.('complete');
          } else if (eventName === 'mlp_transfer_failed') {
            markTransferComplete();
            onModelUpdateStatus?.('error');
            setWebviewError(PREDICTION_ERROR_TEXT);
          } else if (eventName === 'gesture_processing_error') {
            setWebviewError(GESTURE_PROCESSING_ERROR_TEXT);
          } else if (eventName === 'camera_started' || eventName === 'dom_ready') {
            setWebviewError(null);
          }
        } else if (data.type === 'error') {
          const errorMessage = typeof data.message === 'string' ? data.message : 'gesture_processing_error';
          logger.error('WebView error', {
            message: errorMessage,
            code: (data as { code?: string }).code,
          });
          setWebviewError(GESTURE_PROCESSING_ERROR_TEXT);
          onError(errorMessage);
        }
      } catch (err) {
        logger.error('Error parsing WebView message', { error: err });
        setWebviewError(GESTURE_PROCESSING_ERROR_TEXT);
        const errorMessage = err instanceof Error && err.message ? err.message : 'gesture_processing_error';
        onError(errorMessage);
      }
    },
    [
      deliverGestureMessage,
      injectModel,
      markTransferComplete,
      mlpReadyRef,
      onError,
      onModelUpdateStatus,
      onWebViewEvent,
      pendingModelRef,
    ],
  );

  const handleWebviewError = useCallback(
    (nativeEvent: unknown, type: 'runtime' | 'http') => {
      logger.warn(type === 'runtime' ? 'WebView runtime error' : 'WebView HTTP error', nativeEvent);
      setWebviewError(WEBVIEW_UNAVAILABLE_TEXT);
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

      {webviewError && (
        <View pointerEvents="none" style={styles.errorOverlay}>
          <Text style={styles.errorText}>{webviewError}</Text>
        </View>
      )}
    </View>
  );
};

const createStyles =
  typeof StyleSheet?.create === 'function'
    ? StyleSheet.create.bind(StyleSheet)
    : (<T,>(sheet: T) => sheet);

const absoluteFill =
  StyleSheet?.absoluteFillObject ?? {
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.75)',
    paddingHorizontal: 24,
  },
  errorText: {
    color: '#f9fafb',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
