import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GestureRecognitionOrchestrator } from '../gesture/core/GestureRecognitionOrchestrator';
import { WEBVIEW_MESSAGE_EVENT } from '../utils/reactNativeBridge';
import {
  createHandLandmarkStabilizer,
  normalizeHandednessLabels,
  type HandLandmarkStabilizer,
} from '../utils/landmarkUtils';

export type SignLanguageMessage = {
  type: string;
  summary: string;
  payload: unknown;
  receivedAt: number;
  count: number;
};

export type SignLanguageHookOptions = {
  orchestratorFactory?: (
    video: HTMLVideoElement,
    overlay: HTMLCanvasElement,
  ) => GestureRecognitionOrchestrator;
};

export type SignLanguageStatus = 'idle' | 'initializing' | 'running' | 'stopped' | 'error';

export type SignLanguageHookResult = {
  start: () => Promise<boolean>;
  stop: () => Promise<void>;
  cleanup: () => Promise<void>;
  status: SignLanguageStatus;
  error: string | null;
  lastGesture: string | null;
  lastLandmarks: number[][][];
  lastHandedness: string[];
  lastConfidence: number | null;
  messageLog: SignLanguageMessage[];
};

const UNKNOWN_TYPE = 'unbekannt';

function parseIncomingMessage(raw: string): SignLanguageMessage | null {
  try {
    const parsed = JSON.parse(raw);
    const type = typeof parsed?.type === 'string' ? parsed.type : UNKNOWN_TYPE;
    const gestureCandidate = parsed?.gesture ?? parsed?.messages?.[0]?.gesture;
    const summaryParts = [] as string[];

    const hasGesture = Boolean(
      gestureCandidate || parsed?.messages?.some((m: { gesture?: string }) => m?.gesture),
    );

    // Check if this is a "no hands detected" scenario
    const hasLandmarks =
      parsed?.landmarks?.length > 0 ||
      parsed?.messages?.some((m: { landmarks?: unknown[] }) => (m?.landmarks?.length ?? 0) > 0);

    const isGesturePayload = type === 'gesture_batch' || type === 'gesture' || type === 'landmarks';
    if (isGesturePayload && !hasGesture && !hasLandmarks) {
      return null;
    }

    if (gestureCandidate) {
      summaryParts.push(`Gebärde: ${String(gestureCandidate)}`);
    } else if (!hasLandmarks && type !== UNKNOWN_TYPE) {
      // No gesture and no landmarks = no hands detected
      summaryParts.push('Keine Hand erkannt');
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
      count: 1,
    };
  } catch {
    return {
      type: UNKNOWN_TYPE,
      summary: 'Konnte Meldung nicht lesen',
      payload: raw,
      receivedAt: Date.now(),
      count: 1,
    };
  }
}

export function useSignLanguageDetector(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  overlayRef: React.RefObject<HTMLCanvasElement | null>,
  options: SignLanguageHookOptions = {},
): SignLanguageHookResult {
  const [status, setStatus] = useState<SignLanguageStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastGesture, setLastGesture] = useState<string | null>(null);
  const [lastLandmarks, setLastLandmarks] = useState<number[][][]>([]);
  const [lastHandedness, setLastHandedness] = useState<string[]>([]);
  const [lastConfidence, setLastConfidence] = useState<number | null>(null);
  const [messageLog, setMessageLog] = useState<SignLanguageMessage[]>([]);
  const orchestratorRef = useRef<GestureRecognitionOrchestrator | null>(null);
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
    const handleBridgeMessage = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (!detail) return;
      const parsed = parseIncomingMessage(detail);
      if (!parsed) return;
      setMessageLog((prev) => {
        const previousFirst = prev[0];
        if (previousFirst && previousFirst.summary === parsed.summary && previousFirst.type === parsed.type) {
          const updated = {
            ...previousFirst,
            payload: parsed.payload,
            receivedAt: parsed.receivedAt,
            count: previousFirst.count + 1,
          };
          return [updated, ...prev.slice(1, 10)];
        }

        return [parsed, ...prev].slice(0, 10);
      });

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
