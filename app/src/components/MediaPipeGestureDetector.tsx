import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import {
  API_TOKEN,
  ANALYTICS_TELEMETRY_ENDPOINT,
  MLP_CONFIDENCE_THRESHOLD,
  FALLBACK_CONFIDENCE_THRESHOLD,
} from '../constants';
import { fetchMlpModel, getCachedMlpModel } from '../services/dgsModelClient';
import { loadActiveProfileId, onActiveProfileChange } from '../storage';
import { LanguageManager } from '../services/LanguageManager';
// Avoid pulling the module at import time. Use dynamic require below.
import type { WebViewMessageEvent } from 'react-native-webview/lib/WebViewTypes';

export type WebViewTelemetryEvent =
  | 'dom_ready'
  | 'tap_start'
  | 'camera_started'
  | 'recognizer_init'
  | 'frame_latency'
  | (string & {});

export interface WebViewTelemetry {
  event: WebViewTelemetryEvent;
  ms?: number;
  tracks?: string[];
}

interface Props {
  onGestureDetected: (
    gesture: string | null,
    confidence: number,
    landmarks: number[][][],
    handedness: string[],
  ) => void;
  onError: (error: string) => void;
  onWebViewEvent?: (telemetry: WebViewTelemetry) => void;
  facingMode?: 'user' | 'environment';
}

// Optional require to avoid crashing when native WebView module is not in the binary
let WebViewImpl: React.ComponentType<any> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebViewImpl = require('react-native-webview').WebView as unknown as React.ComponentType<any>;
} catch (e) {
  WebViewImpl = null;
}

export const MediaPipeGestureDetector: React.FC<Props> = ({ onGestureDetected, onError, onWebViewEvent, facingMode = 'user' }) => {
  // Minimal shape we rely on; keeps optional semantics and strict-mode help.
  type WebViewLike = { injectJavaScript: (src: string) => void } | null;
  const webviewRef = useRef<WebViewLike>(null);
  const pendingModelRef = useRef<string | null>(null);
  const mlpReadyRef = useRef(false);
  const modelTransferLock = useRef(false);
  const queuedModelRef = useRef(false);
  const transferWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setLangTick] = useState(0);

  const injectModel = (b64: string | null) => {
    if (!b64 || !webviewRef.current || !mlpReadyRef.current) return;
    if (modelTransferLock.current) {
      console.warn('Model transfer in progress; queueing new model.');
      pendingModelRef.current = b64;
      queuedModelRef.current = true;
      return;
    }
    modelTransferLock.current = true;
    queuedModelRef.current = false;
    const CHUNK = 64 * 1024;
    // Remove any non-base64 characters to keep the payload safe for injection
    const normalized = b64.replace(/[^A-Za-z0-9+/=]/g, '');
    webviewRef.current.injectJavaScript(
      'window.__beginMlpTransfer&&window.__beginMlpTransfer();',
    );
    for (let i = 0; i < normalized.length; i += CHUNK) {
      const part = normalized.slice(i, i + CHUNK);
      webviewRef.current.injectJavaScript(
        'window.__pushMlpChunk&&window.__pushMlpChunk(' + JSON.stringify(part) + ');',
      );
    }
    webviewRef.current.injectJavaScript(
      '(async()=>{window.__commitMlpTransfer&&await window.__commitMlpTransfer();})();',
    );
    if (transferWatchdogRef.current) clearTimeout(transferWatchdogRef.current);
    transferWatchdogRef.current = setTimeout(() => {
      console.warn('Model transfer timed out — unlock and retry if needed.');
      modelTransferLock.current = false;
      if (queuedModelRef.current && pendingModelRef.current) {
        injectModel(pendingModelRef.current);
      }
    }, 15000);
  };

  useEffect(() => {
    const unsubscribe = LanguageManager.subscribe(() => setLangTick((v) => v + 1));
    return unsubscribe;
  }, []);

  const escapeJs = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/`/g, '\\`').replace(/\n/g, '\\n');
  const tapToStartText = escapeJs(LanguageManager.t('mediapipe.tapToStart'));
  const recognizerInitFailed = escapeJs(LanguageManager.t('mediapipe.recognizerInitFailed'));
  const predictionError = escapeJs(LanguageManager.t('mediapipe.predictionError'));
  const cameraError = escapeJs(LanguageManager.t('mediapipe.cameraError'));

  useEffect(() => {
    const loadModel = async () => {
      try {
        const pid = await loadActiveProfileId().catch((err) => {
          console.warn('Failed to load active profile ID; falling back to global model.', err);
          return null;
        });

        const cached = await getCachedMlpModel(pid ?? undefined);
        if (cached) {
          pendingModelRef.current = cached;
          injectModel(cached);
        }

        const latest = await fetchMlpModel(pid ?? undefined);
        if (latest && latest !== cached) {
          pendingModelRef.current = latest;
          injectModel(latest);
        }
      } catch (e) {
        console.warn('Failed to load or inject MLP model:', e);
      }
    };
    loadModel();
    const unsubscribe = onActiveProfileChange(() => {
      loadModel();
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    return () => {
      if (transferWatchdogRef.current) {
        clearTimeout(transferWatchdogRef.current);
        transferWatchdogRef.current = null;
      }
      try {
        webviewRef.current?.injectJavaScript(
          'window.__cleanupGestureDetector&&window.__cleanupGestureDetector();',
        );
      } catch (e) {
        console.warn('Failed to inject WebView cleanup script:', e);
      }
    };
  }, []);

  if (!WebViewImpl) {
    // Provide a non-crashing fallback with a clear developer hint
    console.warn('react-native-webview unavailable; showing fallback UI');
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text accessibilityRole="alert" style={{ textAlign: 'center' }}>
          {LanguageManager.t('mediapipe.webviewUnavailable')}
        </Text>
      </View>
    );
  }

  const gestureDetectorJs = require('../assets/gestureDetector.js');
  const videoTransform = facingMode === 'user' ? 'transform: scaleX(-1);' : '';
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body { margin: 0; padding: 0; background: #000; }
    video { position: absolute; inset: 0; width: 100vw; height: 100vh; object-fit: cover; ${videoTransform} }
    canvas#overlay { position: absolute; inset: 0; width: 100vw; height: 100vh; pointer-events: none; }
    #tapToStart { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; background: rgba(0,0,0,0.4); font-family: sans-serif; }
    #tapToStart.hidden { display: none; }
  </style>
  <script>
    window.__facingMode = '${facingMode}';
    window.__mirrorOverlay = ${facingMode === 'user' ? 'true' : 'false'};
    window.__tapToStart = '${tapToStartText}';
    window.__recognizerInitFailed = '${recognizerInitFailed}';
    window.__predictionError = '${predictionError}';
    window.__cameraError = '${cameraError}';
    window.__mlpThreshold = ${MLP_CONFIDENCE_THRESHOLD};
    window.__fallbackThreshold = ${FALLBACK_CONFIDENCE_THRESHOLD};
  </script>
  <script src="${gestureDetectorJs}"></script>
</head>
<body></body>
</html>`;
  const handleMessage = async (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === 'gesture') {
        const g = data.gesture;
        let gesture: string | null;
        if (Array.isArray(g)) {
          gesture = g.every((x: unknown) => typeof x === 'string')
            ? (g as string[]).join('+')
            : null;
        } else if (g && typeof g === 'object') {
          const { left, right } = g as { left?: unknown; right?: unknown };
          const l = typeof left === 'string' ? left : null;
          const r = typeof right === 'string' ? right : null;
          gesture = l && r ? `${l}+${r}` : (l ?? r ?? null);
        } else if (typeof g === 'string' || g === null) {
          gesture = g as string | null;
        } else {
          gesture = null;
        }
        onGestureDetected(
          gesture,
          data.confidence,
          data.landmarks,
          data.handednesses || [],
        );
      } else if (data.type === 'error') {
        console.error('WebView error:', data.message);
        onError(data.message);
      } else if (data.type === 'warn') {
        // Optionally forward warning to analytics if needed
      } else if (data.type === 'telemetry') {
        const eventStr = String(data.event || '');
        try {
          onWebViewEvent?.({
            event: eventStr,
            ms: typeof data.ms === 'number' ? data.ms : undefined,
            ...(Array.isArray(data.tracks) ? { tracks: data.tracks as string[] } : {}),
          });
        } catch (e) {
          console.warn('Error in onWebViewEvent handler:', e);
        }
        if (eventStr === 'mlp_ready') {
          mlpReadyRef.current = true;
          injectModel(pendingModelRef.current);
        } else if (eventStr === 'mlp_transfer_complete' || eventStr === 'mlp_transfer_skipped') {
          if (transferWatchdogRef.current) {
            clearTimeout(transferWatchdogRef.current);
            transferWatchdogRef.current = null;
          }
          modelTransferLock.current = false;
          if (queuedModelRef.current && pendingModelRef.current) {
            injectModel(pendingModelRef.current);
          }
        }
        try {
          // Fire-and-forget telemetry to avoid backpressure in onMessage (skip in dev)
          if (API_TOKEN && API_TOKEN !== 'demo-token') {
            void fetch(ANALYTICS_TELEMETRY_ENDPOINT, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${API_TOKEN}`,
              },
              body: JSON.stringify({
                latencyMs: typeof data.ms === 'number' ? data.ms : 0,
                timestamp: Date.now(),
                event: eventStr || 'unknown',
                source: 'webview-gesture-detector',
                ...(Array.isArray(data.tracks) ? { tracks: data.tracks } : {}),
              }),
            });
          }
        } catch (e) {
          console.warn('Failed to send telemetry:', e);
        }
      }
    } catch (error) {
      onError(LanguageManager.t('mediapipe.gestureProcessingError'));
    }
  };

  return (
    <View style={styles.container}>
      <WebViewImpl
        key={LanguageManager.getLanguage()}
        ref={webviewRef}
        source={{ html: htmlContent, baseUrl: 'https://camera.local' }}
        style={styles.webview}
        onMessage={handleMessage}
        mediaPlaybackRequiresUserAction={false}
        domStorageEnabled={true}
        javaScriptEnabled={true}
        allowsInlineMediaPlayback={true}
        originWhitelist={['*']}
        // On Android, auto-grant media capture permissions if app holds CAMERA
        mediaCapturePermissionGrantType={'grant'}
        androidLayerType={'hardware'}
        mixedContentMode={'always'}
        onError={(e: any) => {
          console.error('WebView runtime error', e.nativeEvent);
          onError(LanguageManager.t('mediapipe.gestureProcessingError'));
        }}
        onConsoleMessage={(e: any) => {
          if (e?.nativeEvent?.message) {
            console.log('WV:', e.nativeEvent.message);
          }
        }}
        onPermissionRequest={(event: any) => {
          const resources = event?.nativeEvent?.resources;
          const grant = event?.nativeEvent?.grant;
          if (resources && typeof grant === 'function') {
            try {
              const videoOnly = resources.filter((r: string) => r === 'VIDEO_CAPTURE');
              grant(videoOnly);
            } catch (err) {
              console.warn('Failed to grant permissions:', err);
            }
          }
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
});
