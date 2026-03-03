import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GestureRecognitionOrchestrator } from '../gesture/core/GestureRecognitionOrchestrator';
import { WEBVIEW_MESSAGE_EVENT } from '../utils/reactNativeBridge';
import {
  createHandLandmarkStabilizer,
  normalizeHandednessLabels,
  type HandLandmarkStabilizer,
} from '../utils/landmarkUtils';
import { stripTrailingUuidSuffix } from '../utils/gestureLabel';

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

export type VariationMetrics = {
  dominantCluster: string;
  variationDiversity?: number;
  activeClusters?: number;
  recommendTraining?: boolean;
  reason?: string;
};

export type SignLanguageHookResult = {
  start: () => Promise<boolean>;
  stop: () => Promise<void>;
  cleanup: () => Promise<void>;
  audioMuted: boolean;
  toggleAudioMuted: () => void;
  status: SignLanguageStatus;
  error: string | null;
  lastSign: string | null;
  lastLandmarks: number[][][];
  lastHandedness: string[];
  lastConfidence: number | null;
  lastDetectionMethod: string | null;
  lastUsedFallback: boolean;
  lastMlpLabel: string | null;
  lastMlpScore: number | null;
  lastMlpThreshold: number | null;
  lastMlpCandidates: Array<{ label: string; score: number }>;
  messageLog: SignLanguageMessage[];
  getVariationMetrics: (gesture: string) => VariationMetrics | undefined;
};

const UNKNOWN_TYPE = 'unbekannt';
function formatGestureLabelForSummary(label: string): string {
  return stripTrailingUuidSuffix(label);
}

function isMeaningfulGestureLabel(label: unknown): label is string {
  if (typeof label !== 'string') return false;
  const normalized = label.trim().toLowerCase();
  return normalized.length > 0 && normalized !== 'none' && normalized !== '_null_';
}

/**
 * Shared shape for individual messages within a gesture_batch payload.
 * Mirrors the fields of GestureMessagePayload produced by the orchestrator.
 */
type BatchMessageEntry = {
  gesture?: string;
  confidence?: number;
  landmarks?: unknown[];
  handednesses?: string[];
  detectionMethod?: string;
  isFallback?: boolean;
  metadata?: { method?: string };
  mlpDecision?: {
    selected: boolean;
    reason: string;
    threshold?: number;
    margin?: number;
    score?: number;
    selectedConfidenceBeforeMlp?: number;
    selectedGestureBeforeMlp?: string | null;
  };
  mlp?: { label: string; score: number; candidates?: Array<{ label: string; score: number }> } | null;
  thresholds?: { mlp?: number };
};

/**
 * Return the best message with a meaningful gesture label, or null.
 * Prefers highest-confidence message; falls back to the latest meaningful entry
 * when confidences are missing or equal.
 */
function findSignMessage(messages: BatchMessageEntry[] | undefined): BatchMessageEntry | null {
  if (!Array.isArray(messages)) return null;

  let selected: BatchMessageEntry | null = null;
  let selectedConfidence = Number.NEGATIVE_INFINITY;

  messages.forEach((message) => {
    if (!isMeaningfulGestureLabel(message?.gesture)) {
      return;
    }

    const confidence = typeof message.confidence === 'number' && Number.isFinite(message.confidence)
      ? message.confidence
      : Number.NEGATIVE_INFINITY;

    if (confidence >= selectedConfidence) {
      selected = message;
      selectedConfidence = confidence;
    }
  });

  return selected;
}

function parseIncomingMessage(raw: string): SignLanguageMessage | null {
  try {
    const parsed = JSON.parse(raw);
    const type = typeof parsed?.type === 'string' ? parsed.type : UNKNOWN_TYPE;
    const nestedSignMessage = findSignMessage(parsed?.messages);
    const signCandidate = isMeaningfulGestureLabel(parsed?.gesture)
      ? parsed.gesture
      : nestedSignMessage?.gesture ?? null;
    const summaryParts = [] as string[];

    const hasSign = Boolean(signCandidate);

    // Check if this is a "no hands detected" scenario
    const hasLandmarks =
      parsed?.landmarks?.length > 0 ||
      parsed?.messages?.some((m: { landmarks?: unknown[] }) => (m?.landmarks?.length ?? 0) > 0);

    const isSignPayload = type === 'gesture_batch' || type === 'gesture' || type === 'landmarks';
    if (isSignPayload && !hasSign && !hasLandmarks) {
      return null;
    }

    if (signCandidate) {
      summaryParts.push(`Gebärde: ${formatGestureLabelForSummary(String(signCandidate))}`);
    } else if (!hasLandmarks && type !== UNKNOWN_TYPE) {
      // No sign and no landmarks = no hands detected
      summaryParts.push('Keine Hand erkannt');
    }

    if (parsed?.confidence !== undefined) {
      summaryParts.push(`Score: ${(parsed.confidence as number).toFixed?.(2) ?? parsed.confidence}`);
    } else if (nestedSignMessage && typeof nestedSignMessage.confidence === 'number') {
      summaryParts.push(`Score: ${nestedSignMessage.confidence.toFixed(2)}`);
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
  const [lastSign, setLastSign] = useState<string | null>(null);
  const [lastLandmarks, setLastLandmarks] = useState<number[][][]>([]);
  const [lastHandedness, setLastHandedness] = useState<string[]>([]);
  const [lastConfidence, setLastConfidence] = useState<number | null>(null);
  const [lastDetectionMethod, setLastDetectionMethod] = useState<string | null>(null);
  const [lastUsedFallback, setLastUsedFallback] = useState(false);
  const [lastMlpLabel, setLastMlpLabel] = useState<string | null>(null);
  const [lastMlpScore, setLastMlpScore] = useState<number | null>(null);
  const [lastMlpThreshold, setLastMlpThreshold] = useState<number | null>(null);
  const [lastMlpCandidates, setLastMlpCandidates] = useState<Array<{ label: string; score: number }>>([]);
  const [messageLog, setMessageLog] = useState<SignLanguageMessage[]>([]);
  const [audioMuted, setAudioMuted] = useState(false);
  const audioMutedRef = useRef(false);
  const orchestratorRef = useRef<GestureRecognitionOrchestrator | null>(null);
  const lastMlpDecisionLogRef = useRef<string>('');
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
          messages?: BatchMessageEntry[];
          confidence?: number;
          landmarks?: unknown;
          handednesses?: string[];
          detectionMethod?: string;
          isFallback?: boolean;
          metadata?: { method?: string };
          mlpDecision?: BatchMessageEntry['mlpDecision'];
          mlp?: BatchMessageEntry['mlp'];
          thresholds?: { mlp?: number };
        };

        const payloadMessages = Array.isArray(payload.messages) ? payload.messages : [];

        const findLastMessageWithMlpDecision = () => {
          for (let index = payloadMessages.length - 1; index >= 0; index -= 1) {
            const message = payloadMessages[index];
            if (message && typeof message === 'object' && 'mlpDecision' in message) {
              return message;
            }
          }
          return null;
        };

        const findLastMessageWithMlp = () => {
          for (let index = payloadMessages.length - 1; index >= 0; index -= 1) {
            const message = payloadMessages[index];
            if (message && typeof message === 'object' && 'mlp' in message) {
              return message;
            }
          }
          return null;
        };

        const findLastMessageWithThresholds = () => {
          for (let index = payloadMessages.length - 1; index >= 0; index -= 1) {
            const message = payloadMessages[index];
            if (message && typeof message === 'object' && 'thresholds' in message) {
              return message;
            }
          }
          return null;
        };

        const nestedMlpDecisionMessage = findLastMessageWithMlpDecision();
        const nestedMlpDecision = nestedMlpDecisionMessage?.mlpDecision;
        const mlpDecision = payload.mlpDecision ?? nestedMlpDecision ?? null;

        if (mlpDecision && mlpDecision.selected === false) {
          const decisionSignature = [
            mlpDecision.reason,
            String(mlpDecision.score ?? 'na'),
            String(mlpDecision.threshold ?? 'na'),
            String(payload.gesture ?? nestedMlpDecisionMessage?.gesture ?? 'none'),
            String(payload.detectionMethod ?? payload.metadata?.method ?? nestedMlpDecisionMessage?.detectionMethod ?? 'none'),
          ].join('|');

          if (lastMlpDecisionLogRef.current !== decisionSignature) {
            lastMlpDecisionLogRef.current = decisionSignature;
            console.info('[Detector] MLP prediction rejected', {
              reason: mlpDecision.reason,
              score: mlpDecision.score ?? null,
              threshold: mlpDecision.threshold ?? null,
              margin: mlpDecision.margin ?? null,
              selectedGestureBeforeMlp: mlpDecision.selectedGestureBeforeMlp ?? null,
              selectedConfidenceBeforeMlp: mlpDecision.selectedConfidenceBeforeMlp ?? null,
              finalDetectionMethod: payload.detectionMethod ?? payload.metadata?.method ?? nestedMlpDecisionMessage?.detectionMethod ?? null,
              finalGesture: payload.gesture ?? nestedMlpDecisionMessage?.gesture ?? null,
              finalConfidence: typeof payload.confidence === 'number' ? payload.confidence : null,
            });
          }
        }

        const resolveDetectionMethod = () => {
          const topLevelMethod = payload.detectionMethod?.trim();
          if (topLevelMethod) {
            return topLevelMethod;
          }
          const topLevelMetaMethod = payload.metadata?.method?.trim();
          if (topLevelMetaMethod) {
            return topLevelMetaMethod;
          }

          if (payload.messages) {
            for (let index = payload.messages.length - 1; index >= 0; index -= 1) {
              const message = payload.messages[index];
              if (!message) {
                continue;
              }
              const messageMethod = message.detectionMethod?.trim();
              if (messageMethod) {
                return messageMethod;
              }
              const messageMetaMethod = message.metadata?.method?.trim();
              if (messageMetaMethod) {
                return messageMetaMethod;
              }
            }
          }

          return null;
        };

        const resolvedMethod = resolveDetectionMethod();

        const nestedMlpMessage = findLastMessageWithMlp();
        const hasMlpMetadata =
          Object.prototype.hasOwnProperty.call(payload, 'mlp') ||
          nestedMlpMessage !== null;

        if (hasMlpMetadata) {
          const mlpMetadata = Object.prototype.hasOwnProperty.call(payload, 'mlp')
            ? payload.mlp
            : nestedMlpMessage?.mlp;
          if (mlpMetadata && typeof mlpMetadata.label === 'string') {
            setLastMlpLabel(mlpMetadata.label);
            setLastMlpScore(typeof mlpMetadata.score === 'number' ? mlpMetadata.score : null);
            setLastMlpCandidates(
              Array.isArray(mlpMetadata.candidates)
                ? mlpMetadata.candidates.filter((candidate): candidate is { label: string; score: number } =>
                    typeof candidate?.label === 'string' && typeof candidate?.score === 'number',
                  )
                : [],
            );
          } else {
            setLastMlpLabel(null);
            setLastMlpScore(null);
            setLastMlpCandidates([]);
          }
        } else if (resolvedMethod && resolvedMethod !== 'mlp') {
          setLastMlpLabel(null);
          setLastMlpScore(null);
          setLastMlpCandidates([]);
        }

        const nestedThresholdMessage = findLastMessageWithThresholds();
        const mlpThresholdFromDecision =
          typeof mlpDecision?.threshold === 'number'
            ? mlpDecision.threshold
            : null;
        const mlpThresholdFromPayload =
          typeof payload.thresholds?.mlp === 'number'
            ? payload.thresholds.mlp
            : typeof nestedThresholdMessage?.thresholds?.mlp === 'number'
              ? nestedThresholdMessage.thresholds.mlp
              : null;

        setLastMlpThreshold(mlpThresholdFromDecision ?? mlpThresholdFromPayload);

        const resolveFallbackUsage = () => {
          if (payload.isFallback === true) {
            return true;
          }
          return payload.messages?.some((msg) => msg.isFallback === true) ?? false;
        };

        const resolvedFallback = resolveFallbackUsage();
        const nestedSignMsg = findSignMessage(payload.messages);
        const hasGesturePayload =
          isMeaningfulGestureLabel(payload.gesture) ||
          nestedSignMsg !== null;

        if (resolvedMethod !== null || hasGesturePayload) {
          setLastDetectionMethod(resolvedMethod);
        }

        if (resolvedFallback || hasGesturePayload) {
          setLastUsedFallback(resolvedFallback);
        }

        if (isMeaningfulGestureLabel(payload.gesture)) {
          setLastSign(payload.gesture);
          setLastConfidence(typeof payload.confidence === 'number' ? payload.confidence : null);
        } else if (nestedSignMsg?.gesture) {
          setLastSign(nestedSignMsg.gesture);
          const batchConfidence = typeof payload.confidence === 'number' ? payload.confidence : null;
          const messageConfidence = typeof nestedSignMsg.confidence === 'number' ? nestedSignMsg.confidence : null;
          setLastConfidence(batchConfidence ?? messageConfidence);
        }

        const messageWithLandmarks = payload.messages
          ? [...payload.messages].reverse().find((msg) => Array.isArray(msg?.landmarks))
          : undefined;
        const landmarksCandidate = Array.isArray(payload.landmarks)
          ? (payload.landmarks as number[][][])
          : messageWithLandmarks?.landmarks;
        if (landmarksCandidate && Array.isArray(landmarksCandidate)) {
          const handednessCandidate = Array.isArray(payload.handednesses)
            ? payload.handednesses
            : messageWithLandmarks?.handednesses ?? [];

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
    await orchestrator.setAudioMuted(audioMutedRef.current);
    return orchestrator;
  }, [videoRef, overlayRef, orchestratorFactory]);

  const applyAudioMuted = useCallback(async (muted: boolean) => {
    audioMutedRef.current = muted;
    setAudioMuted(muted);
    if (orchestratorRef.current) {
      await orchestratorRef.current.setAudioMuted(muted);
    }
  }, []);

  const toggleAudioMuted = useCallback(() => {
    void applyAudioMuted(!audioMuted);
  }, [applyAudioMuted, audioMuted]);

  const start = useCallback(async () => {
    try {
      setStatus('initializing');
      setError(null);
      const orchestrator = await ensureOrchestrator();
      await orchestrator.setAudioMuted(audioMutedRef.current);
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
      setLastSign(null);
      setLastLandmarks([]);
      setLastHandedness([]);
      setLastConfidence(null);
      setLastDetectionMethod(null);
      setLastUsedFallback(false);
      setLastMlpLabel(null);
      setLastMlpScore(null);
      setLastMlpThreshold(null);
      setLastMlpCandidates([]);
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const getVariationMetrics = useCallback((gesture: string) => {
    const metrics = orchestratorRef.current?.getVariationMetrics(gesture);
    if (!metrics) return undefined;
    
    return {
      dominantCluster: metrics.dominantCluster,
      variationDiversity: metrics.variationDiversity,
      activeClusters: metrics.activeClusters,
      recommendTraining: metrics.recommendTraining,
      ...(metrics.reason !== undefined ? { reason: metrics.reason } : {}),
    };
  }, []);

  return {
    start,
    stop,
    cleanup,
    audioMuted,
    toggleAudioMuted,
    status,
    error,
    lastSign,
    lastLandmarks,
    lastHandedness,
    lastConfidence,
    lastDetectionMethod,
    lastUsedFallback,
    lastMlpLabel,
    lastMlpScore,
    lastMlpThreshold,
    lastMlpCandidates,
    messageLog,
    getVariationMetrics,
  };
}
