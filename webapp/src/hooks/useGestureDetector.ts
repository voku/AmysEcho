import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GestureRecognitionOrchestrator } from '../gesture/core/GestureRecognitionOrchestrator';
import { installReactNativeBridge, WEBVIEW_MESSAGE_EVENT } from '../utils/reactNativeBridge';
import {
  createHandLandmarkStabilizer,
  normalizeHandednessLabels,
  type HandLandmarkStabilizer,
} from '../utils/landmarkUtils';

export type GestureMessage = {
  type: string;
  summary: string;
  payload: unknown;
  receivedAt: number;
};

export type GestureHookOptions = {
  orchestratorFactory?: (
    video: HTMLVideoElement,
    overlay: HTMLCanvasElement,
  ) => GestureRecognitionOrchestrator;
};

export type GestureStatus = 'idle' | 'initializing' | 'running' | 'stopped' | 'error';

export type GestureHookResult = {
  start: () => Promise<boolean>;
  stop: () => Promise<void>;
  cleanup: () => Promise<void>;
  status: GestureStatus;
  error: string | null;
  lastGesture: string | null;
  lastLandmarks: number[][][];
  lastHandedness: string[];
  lastConfidence: number | null;
  messageLog: GestureMessage[];
};

function parseIncomingMessage(raw: string): GestureMessage {
  try {
    const parsed = JSON.parse(raw);
    const type = typeof parsed?.type === 'string' ? parsed.type : 'unbekannt';
    const gestureCandidate = parsed?.gesture ?? parsed?.messages?.[0]?.gesture;
    const summaryParts = [] as string[];

    if (gestureCandidate) {
      summaryParts.push(`Geste: ${String(gestureCandidate)}`);
    }

    if (parsed?.confidence !== undefined) {
      summaryParts.push(`Score: ${(parsed.confidence as number).toFixed?.(2) ?? parsed.confidence}`);
    }

    if (type === 'gesture_batch' && Array.isArray(parsed?.messages)) {
      summaryParts.push(`${parsed.messages.length} Meldungen gesammelt`);
    }

    return {
      type,
      summary: summaryParts.join(' · ') || 'Ereignis empfangen',
      payload: parsed,
      receivedAt: Date.now(),
    };
  } catch (error) {
    return {
      type: 'unbekannt',
      summary: 'Konnte Meldung nicht lesen',
      payload: raw,
      receivedAt: Date.now(),
    };
  }
}

export function useGestureDetector(
  videoRef: React.RefObject<HTMLVideoElement>,
  overlayRef: React.RefObject<HTMLCanvasElement>,
  options: GestureHookOptions = {},
): GestureHookResult {
  const [status, setStatus] = useState<GestureStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastGesture, setLastGesture] = useState<string | null>(null);
  const [lastLandmarks, setLastLandmarks] = useState<number[][][]>([]);
  const [lastHandedness, setLastHandedness] = useState<string[]>([]);
  const [lastConfidence, setLastConfidence] = useState<number | null>(null);
  const [messageLog, setMessageLog] = useState<GestureMessage[]>([]);
  const orchestratorRef = useRef<GestureRecognitionOrchestrator | null>(null);
  const bridgeCleanupRef = useRef<(() => void) | null>(null);
  const handStabilizerRef = useRef<HandLandmarkStabilizer>(
    createHandLandmarkStabilizer({ ttlMs: 250, maxHands: 2 }),
  );

  const orchestratorFactory = useMemo(
    () =>
      options.orchestratorFactory ??
      ((video: HTMLVideoElement, overlay: HTMLCanvasElement) =>
        new GestureRecognitionOrchestrator(video, overlay)),
    [options.orchestratorFactory],
  );

  useEffect(() => {
    bridgeCleanupRef.current = installReactNativeBridge();

    const handleBridgeMessage = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (!detail) return;
      const parsed = parseIncomingMessage(detail);
      setMessageLog((prev) => [parsed, ...prev].slice(0, 10));

      if (parsed.payload && typeof parsed.payload === 'object') {
        const payload = parsed.payload as {
          gesture?: string;
          type?: string;
          messages?: Array<{ gesture?: string; landmarks?: unknown; handednesses?: string[]; handedness?: string[] }>;
          confidence?: number;
          landmarks?: unknown;
          handednesses?: string[];
          handedness?: string[];
        };
        if (payload.gesture) {
          setLastGesture(payload.gesture);
          setLastConfidence(typeof payload.confidence === 'number' ? payload.confidence : null);
        } else if (Array.isArray(payload.messages)) {
          const gestureMessage = payload.messages.find((msg) => typeof msg?.gesture === 'string');
          if (gestureMessage?.gesture) {
            setLastGesture(gestureMessage.gesture);
          }
        }

        const landmarksCandidate = Array.isArray(payload.landmarks)
          ? (payload.landmarks as number[][][])
          : payload.messages?.find((msg) => Array.isArray(msg?.landmarks))?.landmarks;
        if (landmarksCandidate && Array.isArray(landmarksCandidate)) {
          const handednessCandidate = Array.isArray(payload.handednesses)
            ? payload.handednesses
            : Array.isArray(payload.handedness)
            ? payload.handedness
            : payload.messages?.find((msg) => Array.isArray(msg?.handednesses) || Array.isArray(msg?.handedness))
                ?.handednesses ?? payload.messages?.find((msg) => Array.isArray(msg?.handedness))?.handedness ?? [];

          const stabilizer = handStabilizerRef.current;
          const normalizedHandedness = normalizeHandednessLabels(
            Array.isArray(handednessCandidate) ? (handednessCandidate as string[]) : [],
          );
          const stabilized = stabilizer.update(landmarksCandidate as number[][][], normalizedHandedness);
          setLastLandmarks(stabilized.landmarks);
          setLastHandedness(stabilized.handedness);
        }
      }
    };

    window.addEventListener(WEBVIEW_MESSAGE_EVENT, handleBridgeMessage as EventListener);
    return () => {
      window.removeEventListener(WEBVIEW_MESSAGE_EVENT, handleBridgeMessage as EventListener);
      bridgeCleanupRef.current?.();
    };
  }, []);

  const ensureOrchestrator = useCallback(async () => {
    if (orchestratorRef.current) {
      return orchestratorRef.current;
    }

    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) {
      throw new Error('Video- oder Overlay-Element fehlt');
    }

    const orchestrator = orchestratorFactory(video, overlay);
    orchestratorRef.current = orchestrator;
    await orchestrator.initialize();
    return orchestrator;
  }, [videoRef, overlayRef, orchestratorFactory]);

  const start = useCallback(async () => {
    try {
      setStatus('initializing');
      setError(null);
      const orchestrator = await ensureOrchestrator();
      await orchestrator.start();
      if ('vibrate' in navigator) {
        navigator.vibrate?.(30);
      }
      setStatus('running');
      return true;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      setError(reason);
      setStatus('error');
      return false;
    }
  }, [ensureOrchestrator]);

  const stop = useCallback(async () => {
    if (!orchestratorRef.current) {
      setStatus('stopped');
      return;
    }
    await orchestratorRef.current.stop();
    setStatus('stopped');
  }, []);

  const cleanup = useCallback(async () => {
    try {
      if (orchestratorRef.current) {
        await orchestratorRef.current.cleanup();
      }
    } finally {
      orchestratorRef.current = null;
      handStabilizerRef.current.reset();
      setStatus('idle');
      setLastGesture(null);
      setLastLandmarks([]);
      setLastHandedness([]);
      setLastConfidence(null);
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    start,
    stop,
    cleanup,
    status,
    error,
    lastGesture,
    lastLandmarks,
    lastHandedness,
    lastConfidence,
    messageLog,
  };
}
