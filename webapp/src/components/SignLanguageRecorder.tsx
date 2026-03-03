import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSignLanguageDetector } from '../hooks/useSignLanguageDetector';
import { useAppState } from '../hooks/useAppState';
import { useApiConfig } from '../hooks/useApiConfig';
import { resolveApiUrl } from '../utils/resolveApiUrl';
import { useMlpModelInjection } from '../hooks/useMlpModelInjection';
import { audioService } from '../services/audioService';
import { gestureMeaningService } from '../services/gestureMeaningService';
import { apiRetryManager } from '../services/apiRetryManager';
import { getActiveProfile } from '../services/profileRegistry';
import { MEDIAPIPE_BASELINE_GESTURES, MLP_NULL_LABEL } from '../gesture/core/ProcessingSteps';

const TRAILING_UUID_SUFFIX_PATTERN = /[-_][0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const TRAILING_PUNCTUATION_WITH_OPTIONAL_UUID_PATTERN = /[.,!?;:]+(?=(?:[-_][0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})?$)/i;

const RECORDER_MLP_CONFIDENCE_FALLBACK = 0.4;
const UNKNOWN_GESTURE_LABEL = 'Unbekannte Gebärde';


function formatStatusLabel(status: string): string {
  switch (status) {
    case 'initializing':
      return 'Kamera wird vorbereitet…';
    case 'running':
      return 'Ich höre zu…';
    case 'stopped':
      return 'Kamera pausiert';
    case 'error':
      return 'Kamera nicht bereit';
    default:
      return 'Bereit für die Kamera';
  }
}

function toTitleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeSignLabel(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

  const withoutUuidSuffix = normalized.replace(TRAILING_UUID_SUFFIX_PATTERN, '').trim();
  return withoutUuidSuffix.replace(/[.,!?;:]+$/g, '').trim();
}

function canonicalizeRecordedSign(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(TRAILING_PUNCTUATION_WITH_OPTIONAL_UUID_PATTERN, '')
    .trim();
}

function resolveDisplayLabel(rawLabel: string | undefined, fallbackValue: string): string {
  const trimmedRawLabel = rawLabel?.trim();
  if (trimmedRawLabel) {
    return trimmedRawLabel;
  }

  const fallbackLabel = toTitleCase(fallbackValue).trim();
  return fallbackLabel || UNKNOWN_GESTURE_LABEL;
}

function resolveSpeechLabel(
  preferredSpeech: string | undefined,
  preferredDisplayLabel: string | undefined,
  fallbackValue: string,
): string {
  const trimmedSpeech = preferredSpeech?.trim();
  if (trimmedSpeech) {
    return trimmedSpeech;
  }

  return resolveDisplayLabel(preferredDisplayLabel, fallbackValue);
}

function parseCustomSigns(raw: unknown): CustomSignResponse[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }

  const signs = (raw as { signs?: unknown }).signs;
  if (!Array.isArray(signs)) {
    return [];
  }

  return signs.filter((item): item is CustomSignResponse => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const candidate = item as Record<string, unknown>;
    return typeof candidate['id'] === 'string' && typeof candidate['label'] === 'string';
  });
}

type SuggestedMlpChoice = {
  label: string;
  normalizedLabel: string;
  score: number;
};

type TrainedLabelDescriptor = {
  id: string;
  normalizedId: string;
  displayLabel: string;
  emoji: string | null;
  isCustom: boolean;
};

type CustomSignResponse = {
  id: string;
  label: string;
  emoji?: string | null;
  isReady?: boolean;
};

type MlpCandidateButtonsProps = {
  choices: SuggestedMlpChoice[];
  normalizedTrainedSignLabels: Set<string>;
  labelDescriptorByNormalizedId: Map<string, TrainedLabelDescriptor>;
  onSelect: (label: string) => void;
  keyPrefix: string;
};

function MlpCandidateButtons({
  choices,
  normalizedTrainedSignLabels,
  labelDescriptorByNormalizedId,
  onSelect,
  keyPrefix,
}: MlpCandidateButtonsProps) {
  return (
    <>
      {choices.map((candidate) => {
        const confidencePercent = Math.round(candidate.score * 100);
        const hasKnownTrainingSet = normalizedTrainedSignLabels.size > 0;
        const isTrainedCandidate =
          !hasKnownTrainingSet || normalizedTrainedSignLabels.has(candidate.normalizedLabel);
        return (
          <button
            key={`${keyPrefix}${candidate.normalizedLabel}-${confidencePercent}`}
            type="button"
            className="secondary-button"
            onClick={() => {
              if (!isTrainedCandidate) return;
              onSelect(candidate.label);
            }}
            disabled={!isTrainedCandidate}
            title={isTrainedCandidate
              ? 'Diese Gebärde als aktuelle Ausgabe übernehmen'
              : 'Nicht trainiert – zur Nutzung bitte erst im Profil trainieren'}
          >
            {(() => {
              const descriptor = labelDescriptorByNormalizedId.get(candidate.normalizedLabel);
              const displayLabel = resolveDisplayLabel(descriptor?.displayLabel, candidate.label);
              const displayEmoji = descriptor?.emoji ? `${descriptor.emoji} ` : '';
              return `${displayEmoji}${displayLabel}`;
            })()} · {confidencePercent}%{hasKnownTrainingSet
              ? (isTrainedCandidate ? ' · trainiert' : ' · nicht trainiert')
              : ' · Modellvorschlag'}
          </button>
        );
      })}
    </>
  );
}

export function SignLanguageRecorder() {
  const navigate = useNavigate();
  const { apiBaseUrl, apiToken } = useApiConfig();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showRawVideo, setShowRawVideo] = useState(true);
  const [demoMode] = useState(false);
  const [hasTrainedSigns, setHasTrainedSigns] = useState<boolean | null>(() => {
    try {
      const cached = window.localStorage.getItem('webapp:has-trained-signs');
      return cached ? cached === 'true' : null;
    } catch {
      return null;
    }
  });
  const [trainedSignLabels, setTrainedSignLabels] = useState<string[]>(() => {
    try {
      const cached = window.localStorage.getItem('webapp:trained-sign-labels');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [trainedLabelDescriptors, setTrainedLabelDescriptors] = useState<TrainedLabelDescriptor[]>(() => {
    try {
      const cached = window.localStorage.getItem('webapp:trained-label-descriptors');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(() => {
    try {
      const persisted = window.localStorage.getItem('cameraFacingMode');
      return persisted === 'user' || persisted === 'environment' ? persisted : 'user';
    } catch {
      return 'user';
    }
  });
  const isMirroredPreview = facingMode === 'user';
  const [cameraSwitchFeedback, setCameraSwitchFeedback] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [allowGlobalFallbackOutput, setAllowGlobalFallbackOutput] = useState(false);
  const [manualSuggestionLabel, setManualSuggestionLabel] = useState<string | null>(null);
  const cameraSupported = useMemo(
    () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    [],
  );

  // No longer using window globals - configuration persisted via localStorage

  const {
    start,
    stop,
    status,
    error,
    lastSign,
    lastConfidence,
    lastDetectionMethod,
    lastUsedFallback,
    lastMlpLabel,
    lastMlpScore,
    lastMlpThreshold,
    lastMlpCandidates,
    lastLandmarks,
    messageLog,
    audioMuted,
    toggleAudioMuted,
  } = useSignLanguageDetector(videoRef, overlayRef);
  const { profileId, recordSign } = useAppState();
  const { notice: modelNotice, status: modelStatus, lastMeta: modelMeta } = useMlpModelInjection(profileId);
  const hasAttemptedAutoStart = useRef(false);
  const latestProfileIdRef = useRef<string | null>(profileId);
  const lastProfileModelLogRef = useRef<string>('');
  const lastFilteredPredictionLogRef = useRef<string>('');

  useEffect(() => {
    latestProfileIdRef.current = profileId;
  }, [profileId]);

  useEffect(() => {
    setAllowGlobalFallbackOutput(false);
    setManualSuggestionLabel(null);
  }, [profileId]);

  // Check if profile has trained signs
  useEffect(() => {
    let isActive = true;

    async function checkSigns() {
      if (!profileId) {
        setIsLoadingProfile(false);
        return;
      }

      const requestedProfileId = profileId;
      const shouldApplyResult = () =>
        isActive && latestProfileIdRef.current === requestedProfileId;

      const parseLabelsFromResponse = async (response: Response): Promise<{ labels: string[]; descriptors: TrainedLabelDescriptor[] } | null> => {
        if (!response.ok) {
          return null;
        }
        const data = await response.json() as { trainedLabels?: unknown; labelDescriptors?: unknown };
        const labels = Array.isArray(data.trainedLabels)
          ? data.trainedLabels.filter((label: unknown): label is string => typeof label === 'string')
          : [];
        const descriptors = Array.isArray(data.labelDescriptors)
          ? data.labelDescriptors.filter((descriptor: unknown): descriptor is TrainedLabelDescriptor => {
            if (!descriptor || typeof descriptor !== 'object') {
              return false;
            }
            const candidate = descriptor as Record<string, unknown>;
            return typeof candidate['id'] === 'string'
              && typeof candidate['normalizedId'] === 'string'
              && typeof candidate['displayLabel'] === 'string'
              && (typeof candidate['emoji'] === 'string' || candidate['emoji'] === null)
              && typeof candidate['isCustom'] === 'boolean';
          })
          : labels.map((label) => ({
            id: label,
            normalizedId: normalizeSignLabel(label),
            displayLabel: toTitleCase(label),
            emoji: null,
            isCustom: false,
          }));
        return { labels, descriptors };
      };

      const applyLabels = (labels: string[], descriptors: TrainedLabelDescriptor[]) => {
        if (!shouldApplyResult()) {
          return;
        }
        setTrainedSignLabels(labels);
        setTrainedLabelDescriptors(descriptors);
        const hasAny = labels.length > 0;
        setHasTrainedSigns(hasAny);
        try {
          window.localStorage.setItem('webapp:trained-sign-labels', JSON.stringify(labels));
          window.localStorage.setItem('webapp:trained-label-descriptors', JSON.stringify(descriptors));
          window.localStorage.setItem('webapp:has-trained-signs', String(hasAny));
        } catch {
          // ignore quota errors
        }
      };

      const clearLabelCache = () => {
        if (!shouldApplyResult()) {
          return;
        }
        setTrainedSignLabels([]);
        setTrainedLabelDescriptors([]);
        setHasTrainedSigns(false);
        try {
          window.localStorage.setItem('webapp:trained-sign-labels', JSON.stringify([]));
          window.localStorage.setItem('webapp:trained-label-descriptors', JSON.stringify([]));
          window.localStorage.setItem('webapp:has-trained-signs', 'false');
        } catch {
          // ignore quota errors
        }
      };

      const buildTrainedLabelsUrl = (id: string) =>
        resolveApiUrl(`/api/v1/dgs/trained-labels?profileId=${encodeURIComponent(id)}`, apiBaseUrl);

      const syncCustomSignMeanings = async (id: string) => {
        const customSignsUrl = resolveApiUrl(`/api/v1/dgs/signs?profileId=${encodeURIComponent(id)}`, apiBaseUrl);
        const headers: HeadersInit = apiToken.trim().length > 0
          ? { Authorization: `Bearer ${apiToken}` }
          : {};
        const response = await fetch(customSignsUrl, { headers });
        if (!response.ok) {
          return;
        }

        const signs = parseCustomSigns(await response.json());
        for (const sign of signs) {
          const normalizedId = normalizeSignLabel(sign.id);
          if (!normalizedId) {
            continue;
          }

          const displayLabel = sign.label.trim();
          const isReady = sign.isReady !== false;
          if (!displayLabel || !isReady) {
            continue;
          }

          const emoji = typeof sign.emoji === 'string' && sign.emoji.trim().length > 0 ? sign.emoji.trim() : '🖐️';
          gestureMeaningService.setMeaning({
            gestureId: normalizedId,
            label: displayLabel,
            emoji,
            category: 'eigene',
            color: '#9B6DFF',
            audioText: displayLabel,
            priority: 2,
          });
        }
      };
      
      try {
        const requestOptions: RequestInit = apiToken.trim().length > 0
          ? { headers: { Authorization: `Bearer ${apiToken}` } }
          : {};

        let response = await apiRetryManager.fetch(buildTrainedLabelsUrl(requestedProfileId), requestOptions);
        let labelsProfileId = requestedProfileId;

        if (!shouldApplyResult()) {
          return;
        }

        if (response.status === 403) {
          const activeProfile = await getActiveProfile().catch(() => null);
          if (!shouldApplyResult()) {
            return;
          }
          const activeProfileId = activeProfile?.profileId?.trim();
          if (activeProfileId && activeProfileId !== requestedProfileId) {
            response = await apiRetryManager.fetch(buildTrainedLabelsUrl(activeProfileId), requestOptions);
            labelsProfileId = activeProfileId;
            if (!shouldApplyResult()) {
              return;
            }
          }
        }

        const parsedResult = await parseLabelsFromResponse(response);
        if (parsedResult) {
          applyLabels(parsedResult.labels, parsedResult.descriptors);
          await syncCustomSignMeanings(labelsProfileId).catch((customSignError) => {
            console.warn('Failed to sync custom sign meanings:', customSignError);
          });
        } else if (response.status === 401 || response.status === 403) {
          // Access denied after retry; clear stale data so UI and auth state stay aligned.
          clearLabelCache();
        } else {
          // Endpoint failed; keep cached values to maintain consistent state
          console.warn('trained-labels endpoint returned non-ok status; using cached data');
        }
      } catch (err) {
        if (!shouldApplyResult()) {
          return;
        }
        console.warn('Failed to check profile signs:', err);
        // On network error, prefer the cached value if it exists
        const cached = window.localStorage.getItem('webapp:has-trained-signs');
        if (cached !== null) {
          setHasTrainedSigns(cached === 'true');
        } else {
          // If no cache, default to false to be safe but allow Demo mode
          setHasTrainedSigns(false);
        }
      } finally {
        if (shouldApplyResult()) {
          setIsLoadingProfile(false);
        }
      }
    }

    checkSigns();

    return () => {
      isActive = false;
    };
  }, [profileId, apiBaseUrl, apiToken]);

  // Auto-start camera when component mounts and camera is supported AND we have trained signs
  useEffect(() => {
    if (cameraSupported && status === 'idle' && !hasAttemptedAutoStart.current && hasTrainedSigns === true) {
      start().then((success) => {
        if (success) {
          hasAttemptedAutoStart.current = true;
        }
      });
    }
  }, [cameraSupported, status, start, hasTrainedSigns]);

  const normalizedTrainedSignLabels = useMemo(
    () => new Set(trainedSignLabels.map(label => normalizeSignLabel(label)).filter(Boolean)),
    [trainedSignLabels]
  );
  const labelDescriptorByNormalizedId = useMemo(
    () => new Map(trainedLabelDescriptors.map((descriptor) => [descriptor.normalizedId, descriptor])),
    [trainedLabelDescriptors],
  );

  const profileModelRequired = Boolean(profileId && trainedSignLabels.length > 0 && !demoMode);
  const isProfileModelActive = modelStatus === 'ready' && modelMeta?.source === 'profile';
  const canUseProfileRecognition = !profileModelRequired || isProfileModelActive || allowGlobalFallbackOutput;

  useEffect(() => {
    if (!profileModelRequired) {
      return;
    }

    const transitionSignature = [
      profileId ?? 'none',
      modelStatus,
      modelMeta?.source ?? 'none',
      modelMeta?.version ?? 'none',
      String(allowGlobalFallbackOutput),
      String(isProfileModelActive),
    ].join('|');

    if (lastProfileModelLogRef.current === transitionSignature) {
      return;
    }
    lastProfileModelLogRef.current = transitionSignature;

    console.info('[Recorder] Profile model status', {
      profileId,
      modelStatus,
      modelSource: modelMeta?.source ?? null,
      modelVersion: modelMeta?.version ?? null,
      trainedSignCount: trainedSignLabels.length,
      isProfileModelActive,
      allowGlobalFallbackOutput,
    });
  }, [
    allowGlobalFallbackOutput,
    isProfileModelActive,
    modelMeta?.source,
    modelMeta?.version,
    modelStatus,
    profileId,
    profileModelRequired,
    trainedSignLabels.length,
  ]);

  const shouldPreferMlpTrainedLabel = useMemo(() => {
    if (!lastSign || !lastMlpLabel) {
      return false;
    }

    if (lastDetectionMethod !== 'mediapipe') {
      return false;
    }

    const normalizedMlpLabel = normalizeSignLabel(lastMlpLabel);
    const normalizedDetectedLabel = normalizeSignLabel(lastSign);
    if (!normalizedMlpLabel || normalizedMlpLabel === normalizedDetectedLabel) {
      return false;
    }

    if (normalizedTrainedSignLabels.has(normalizedDetectedLabel)) {
      return false;
    }

    if (!MEDIAPIPE_BASELINE_GESTURES.has(normalizedDetectedLabel)) {
      return false;
    }

    if (!normalizedTrainedSignLabels.has(normalizedMlpLabel)) {
      return false;
    }

    const threshold = typeof lastMlpThreshold === 'number' ? lastMlpThreshold : RECORDER_MLP_CONFIDENCE_FALLBACK;
    return typeof lastMlpScore === 'number' && lastMlpScore >= threshold;
  }, [lastDetectionMethod, lastMlpLabel, lastMlpScore, lastMlpThreshold, lastSign, normalizedTrainedSignLabels]);

  const suggestedMlpChoices = useMemo(() => {
    let candidateSource = lastMlpCandidates;
    if (candidateSource.length === 0 && lastMlpLabel && typeof lastMlpScore === 'number') {
      candidateSource = [{ label: lastMlpLabel, score: lastMlpScore }];
    }

    return candidateSource
      .filter(candidate => candidate.label !== MLP_NULL_LABEL)
      .map(candidate => ({
        ...candidate,
        normalizedLabel: normalizeSignLabel(candidate.label),
      }))
      .filter(candidate => candidate.normalizedLabel.length > 0)
      .sort((left, right) => right.score - left.score);
  }, [lastMlpCandidates, lastMlpLabel, lastMlpScore]);

  const effectiveSign = manualSuggestionLabel ?? (shouldPreferMlpTrainedLabel ? lastMlpLabel : lastSign);

  useEffect(() => {
    if (!manualSuggestionLabel) {
      return;
    }

    const normalizedManual = normalizeSignLabel(manualSuggestionLabel);
    const stillAvailable = suggestedMlpChoices.some(candidate => candidate.normalizedLabel === normalizedManual);
    if (!stillAvailable) {
      setManualSuggestionLabel(null);
    }
  }, [manualSuggestionLabel, suggestedMlpChoices]);

  useEffect(() => {
    if (effectiveSign) {
      const normalizedEffectiveSign = normalizeSignLabel(effectiveSign);
      // Only record if it's a trained label and profile output is currently allowed
      if (
        normalizedTrainedSignLabels.has(normalizedEffectiveSign)
        && canUseProfileRecognition
      ) {
        recordSign(canonicalizeRecordedSign(effectiveSign));
        if (manualSuggestionLabel) {
          setManualSuggestionLabel(null);
        }
      }
    }
  }, [
    canUseProfileRecognition,
    effectiveSign,
    manualSuggestionLabel,
    recordSign,
    normalizedTrainedSignLabels,
  ]);

  const normalizedGesture = effectiveSign?.trim() ?? '';
  const gestureKey = normalizedGesture ? normalizeSignLabel(normalizedGesture) : '';
  
  // Prefer trained labels, but allow direct MLP output when profile model is active
  // and the trained-label catalog is temporarily unavailable.
  const isTrained = useMemo(() => {
    if (!gestureKey) return false;
    return normalizedTrainedSignLabels.has(gestureKey);
  }, [gestureKey, normalizedTrainedSignLabels]);
  const hasKnownTrainedCatalog = normalizedTrainedSignLabels.size > 0;
  const hasManualSuggestion = Boolean(manualSuggestionLabel && normalizeSignLabel(manualSuggestionLabel));
  const canUseUnfilteredFallbackOutput =
    Boolean(gestureKey)
    && !hasKnownTrainedCatalog
    && canUseProfileRecognition;
  const canUseDirectMlpOutput =
    Boolean(gestureKey) &&
    isProfileModelActive &&
    !hasKnownTrainedCatalog &&
    (lastDetectionMethod === 'mlp' || hasManualSuggestion);
  const shouldShowGestureOutput =
    (isTrained && canUseProfileRecognition)
    || canUseDirectMlpOutput
    || canUseUnfilteredFallbackOutput;

  const selectedLabelDescriptor = gestureKey ? labelDescriptorByNormalizedId.get(gestureKey) : undefined;
  const gestureMeaning = (gestureKey && shouldShowGestureOutput)
    ? gestureMeaningService.getMeaning(gestureKey)
    : undefined;
  const gestureLabel = (gestureKey && shouldShowGestureOutput)
    ? resolveDisplayLabel(gestureMeaning?.label ?? selectedLabelDescriptor?.displayLabel, normalizedGesture)
    : null;
  const gestureSpeech = gestureKey
    ? resolveSpeechLabel(
      gestureMeaning?.audioText,
      gestureMeaning?.label ?? selectedLabelDescriptor?.displayLabel ?? gestureLabel ?? undefined,
      normalizedGesture,
    )
    : '';
  const audioToggleLabel = audioMuted ? '🔊 Audio aktivieren' : '🔇 Audio stumm';
  const hasDetectedHands = status === 'running' && lastLandmarks.length > 0;

  useEffect(() => {
    if (!lastSign || !profileModelRequired) {
      return;
    }

    const reason = !canUseProfileRecognition
      ? 'profile_model_not_ready'
      : !shouldShowGestureOutput
        ? 'prediction_not_in_trained_labels'
        : null;

    if (!reason) {
      return;
    }

    const signature = `${reason}|${normalizeSignLabel(lastSign)}|${modelStatus}|${modelMeta?.source ?? 'none'}`;
    if (lastFilteredPredictionLogRef.current === signature) {
      return;
    }
    lastFilteredPredictionLogRef.current = signature;

    console.info('[Recorder] Prediction suppressed', {
      reason,
      predictedLabel: lastSign,
      normalizedPrediction: normalizeSignLabel(lastSign),
      effectiveLabel: effectiveSign,
      mlpCandidateLabel: lastMlpLabel ?? null,
      mlpCandidateScore: lastMlpScore,
      mlpCandidateThreshold: lastMlpThreshold,
      mlpCandidatesPreview: suggestedMlpChoices.slice(0, 5).map(c => ({ label: c.normalizedLabel, score: c.score })),
      lastConfidence,
      detectionMethod: lastDetectionMethod ?? null,
      modelStatus,
      modelSource: modelMeta?.source ?? null,
      modelVersion: modelMeta?.version ?? null,
      isProfileModelActive,
      profileId,
      normalizedTrainedLabelsPreview: trainedSignLabels.slice(0, 10).map(l => normalizeSignLabel(l)),
      trainedSignCount: trainedSignLabels.length,
      allowGlobalFallbackOutput,
    });
  }, [
    allowGlobalFallbackOutput,
    canUseProfileRecognition,
    isProfileModelActive,
    shouldShowGestureOutput,
    lastConfidence,
    lastDetectionMethod,
    lastMlpLabel,
    lastMlpScore,
    lastMlpThreshold,
    suggestedMlpChoices,
    lastSign,
    modelMeta?.source,
    modelMeta?.version,
    modelStatus,
    profileId,
    profileModelRequired,
    trainedSignLabels,
    effectiveSign,
  ]);

  const handleStart = async () => {
    await start();
  };

  const handleSwitchCamera = useCallback(async () => {
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    
    // Persist to localStorage
    try {
      window.localStorage.setItem('cameraFacingMode', newFacingMode);
    } catch {
      // localStorage might be disabled
    }
    
    // Update component state, which will trigger an effect to update window globals
    setFacingMode(newFacingMode);
    
    // Stop and restart camera with new facing mode if it's currently running
    if (status === 'running') {
      setCameraSwitchFeedback('Kamera wird gewechselt…');
      
      // Stop the current camera first
      await stop();
      
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Start with new facing mode
      const started = await start();
      if (started) {
        setCameraSwitchFeedback(
          newFacingMode === 'user' 
            ? 'Frontkamera aktiviert' 
            : 'Rückkamera aktiviert'
        );
        // Clear feedback after 3 seconds
        setTimeout(() => setCameraSwitchFeedback(''), 3000);
      } else {
        setCameraSwitchFeedback('Kamera konnte nicht gewechselt werden. Bitte versuche es erneut.');
        // Revert facing mode if switch failed
        try {
          window.localStorage.setItem('cameraFacingMode', facingMode);
        } catch {
          // localStorage might be disabled
        }
        setFacingMode(facingMode);
      }
    }
  }, [facingMode, start, stop, status]);

  const handleConfirm = useCallback(async () => {
    if (!gestureSpeech) return;
    await audioService.speak(gestureSpeech);
  }, [gestureSpeech]);

  const handleLearn = useCallback(() => {
    navigate('/lernen');
  }, [navigate]);

  const needsCameraStart = status === 'idle' || status === 'stopped' || status === 'error';
  const latestMessageSummary = messageLog[0]?.summary ?? null;

  const modelStatusLabel = useMemo(() => {
    if (!profileId) {
      return 'Kein Profil aktiv';
    }
    if (modelStatus === 'loading') {
      return 'Modell wird geladen…';
    }
    if (modelStatus === 'ready' && modelMeta?.source === 'profile') {
      return 'Profilmodell aktiv';
    }
    if (modelStatus === 'ready' && modelMeta?.source === 'global') {
      return 'Globales Ersatzmodell aktiv';
    }
    if (modelStatus === 'error') {
      return 'Modellfehler – Standarderkennung aktiv';
    }
    return 'Standarderkennung aktiv';
  }, [modelMeta?.source, modelStatus, profileId]);

  const recognitionModeLabel = useMemo(() => {
    if (lastUsedFallback) {
      return 'Fallback-Erkennung aktiv';
    }
    if (!lastDetectionMethod) {
      return 'Noch keine Messung';
    }

    if (lastDetectionMethod === 'mlp') {
      return 'MLP-Modell';
    }
    if (lastDetectionMethod === 'mlp_audio_only') {
      return 'MLP (nur Audio)';
    }
    if (lastDetectionMethod === 'mediapipe') {
      return 'MediaPipe';
    }
    if (lastDetectionMethod === 'none') {
      return 'Keine eindeutige Erkennung';
    }
    console.debug('[SignLanguageRecorder] Unknown detection method', { lastDetectionMethod });
    return 'Unbekannte Erkennung';
  }, [lastDetectionMethod, lastUsedFallback]);

  const liveRecognitionStatus = useMemo(() => {
    const modelVersion = modelMeta?.version ? ` v${modelMeta.version}` : '';
    const modelPart = `Modell: ${modelStatusLabel}${modelVersion}`;
    const recognitionPart = `Erkennung: ${recognitionModeLabel}`;
    const communicationPart = canUseProfileRecognition
      ? 'Kommunikation freigegeben'
      : 'Kommunikation wartet auf Profilmodell';
    return `${modelPart} · ${recognitionPart} · ${communicationPart}`;
  }, [canUseProfileRecognition, modelMeta?.version, modelStatusLabel, recognitionModeLabel]);

  const diagnostics = useMemo(() => {
    if (demoMode) {
      return {
        severity: 'info' as const,
        title: 'Demo-Modus aktiv',
        hint: 'Im Demo-Modus ist die echte Erkennung deaktiviert.',
      };
    }

    if (status === 'error' || error) {
      return {
        severity: 'error' as const,
        title: 'Kamera oder Erkennung hat ein Problem',
        hint: 'Bitte Kamera neu starten und Berechtigungen prüfen.',
      };
    }

    if (status !== 'running') {
      return {
        severity: 'warning' as const,
        title: 'Erkennung läuft noch nicht',
        hint: 'Tippe auf „Kamera starten“, damit Gesten erkannt werden können.',
      };
    }

    if (!hasDetectedHands) {
      return {
        severity: 'warning' as const,
        title: 'Keine Hand erkannt',
        hint: 'Halte beide Hände gut sichtbar ins Bild und achte auf Licht.',
      };
    }

    if (profileModelRequired && !isProfileModelActive && !allowGlobalFallbackOutput) {
      return {
        severity: 'warning' as const,
        title: 'Persönliches Modell wird vorbereitet',
        hint: 'Du kannst warten oder vorübergehend mit dem Ersatzmodell fortfahren.',
      };
    }

    if (!effectiveSign) {
      const confidencePercent =
        typeof lastConfidence === 'number' ? `${Math.round(lastConfidence * 100)}%` : null;
      return {
        severity: 'warning' as const,
        title: 'Hand erkannt, aber keine passende Gebärde',
        hint: confidencePercent
          ? `Aktuelle Sicherheit ist zu niedrig (${confidencePercent}). Bitte Gebärde klarer und langsamer zeigen.`
          : 'Bitte Gebärde klarer und langsamer zeigen oder die Kamera etwas weiter weg positionieren.',
      };
    }

    const isTrainedSign = normalizedTrainedSignLabels.has(normalizeSignLabel(effectiveSign));
    if (trainedSignLabels.length > 0 && !isTrainedSign) {
      return {
        severity: 'warning' as const,
        title: 'Gebärde erkannt, aber nicht im trainierten Profil',
        hint: 'Trainiere diese Gebärde im aktuellen Profil oder wechsle zum passenden Profil.',
      };
    }

    return {
      severity: 'success' as const,
      title: 'Erkennung arbeitet stabil',
      hint: 'Die aktuelle Gebärde passt zu deinem trainierten Profil.',
    };
  }, [
    demoMode,
    error,
    hasDetectedHands,
    isProfileModelActive,
    lastConfidence,
    effectiveSign,
    normalizedTrainedSignLabels,
    allowGlobalFallbackOutput,
    profileModelRequired,
    status,
    trainedSignLabels,
  ]);

  // Loading state
  if (isLoadingProfile) {
    return (
      <section className="gesture-screen gesture-screen--loading">
        <div className="gesture-screen__placeholder">Profil wird geladen…</div>
      </section>
    );
  }

  return (
    <section className="gesture-screen">
      <div className="video-wrapper gesture-fullscreen">
        <video
          ref={videoRef}
          className={['video', isMirroredPreview && 'mirrored', !showRawVideo && 'video-hidden']
            .filter(Boolean)
            .join(' ')}
          playsInline
          muted
          autoPlay
        />
        <canvas
          ref={overlayRef}
          className={`overlay${showOverlay ? '' : ' overlay-hidden'}`}
          aria-hidden={!showOverlay}
        />
        <div className={['video-veil', !showRawVideo && 'video-veil-hidden'].filter(Boolean).join(' ')} aria-hidden="true" />

        <div className="gesture-screen__hud">
          <div className="gesture-screen__status">
            <div className="gesture-screen__status-pill" data-state={status}>
              <span className="gesture-screen__status-dot" />
              <span>{formatStatusLabel(status)}</span>
            </div>
            {modelNotice && <span className="gesture-screen__pill">{modelNotice}</span>}
          </div>
          <div className="gesture-screen__status-meta">
            <p>
              Profil <strong>{profileId || '…'}</strong>
            </p>
          </div>
        </div>
      </div>

      <div className="gesture-screen__controls">
        {hasTrainedSigns === false && (
          <div className="gesture-screen__empty-card">
            <span className="gesture-screen__empty-icon">🖐️</span>
            <h2>Basiserkennung ist aktiv</h2>
            <p className="gesture-screen__empty-body">
              Du kannst die Kamera direkt nutzen. Für zuverlässigere Ergebnisse empfehlen wir,
              mindestens eine Gebärde im aktuellen Profil zu trainieren.
            </p>
            <div className="gesture-screen__empty-actions">
              <Link to="/beibringen" className="primary-button">
                Jetzt Gebärde beibringen
              </Link>
            </div>
          </div>
        )}

        <div className="gesture-screen__banner">
          {gestureLabel ? (
            <div className="gesture-screen__result">
              <span className="gesture-screen__result-label">{gestureLabel}</span>
              {lastConfidence != null && (
                <span className="gesture-screen__result-confidence">
                  {Math.round(lastConfidence * 100)}% Sicherheit
                </span>
              )}
            </div>
          ) : (
            <span className="gesture-screen__placeholder">
              {demoMode
                ? 'Demo-Modus: Gestenerkennung deaktiviert'
                : profileModelRequired && !isProfileModelActive && !allowGlobalFallbackOutput
                  ? 'Profilmodell wird geladen – Ausgaben sind kurz pausiert.'
                : hasDetectedHands
                  ? 'Hand erkannt – ich suche nach einer passenden Gebärde…'
                  : 'Zeige eine Gebärde in die Kamera…'}
            </span>
          )}
        </div>


        {needsCameraStart && (
          <button
            className="gesture-screen__start"
            onClick={handleStart}
            disabled={!cameraSupported}
            title="Kamera starten"
          >
            Kamera starten
          </button>
        )}

        <div className="gesture-screen__actions">
          <button
            className="gesture-screen__action gesture-screen__action--confirm"
            onClick={handleConfirm}
            disabled={!gestureLabel}
            title="Gebärde aussprechen"
          >
            Aussprechen
          </button>
          <button
            className="gesture-screen__action gesture-screen__action--learn"
            onClick={handleLearn}
            title="Zum Lernen wechseln"
          >
            Lernen
          </button>
        </div>

        <div className="gesture-screen__meta">
          <div className="gesture-screen__meta-actions">
            <button
              className="ghost-inline"
              onClick={handleSwitchCamera}
              disabled={!cameraSupported}
              title={facingMode === 'user' ? 'Zur Rückkamera wechseln' : 'Zur Frontkamera wechseln'}
            >
              {facingMode === 'user' ? '🔄 Rückkamera' : '🔄 Frontkamera'}
            </button>
            <button
              className="ghost-inline"
              onClick={toggleAudioMuted}
              type="button"
              title={audioMuted ? 'Audioaufnahme wieder einschalten' : 'Audioaufnahme stummschalten'}
            >
              {audioToggleLabel}
            </button>
            <label
              className="toggle ghost-inline"
              title={showOverlay ? 'Overlay ausblenden' : 'Overlay anzeigen'}
            >
              <input
                id="overlay-toggle"
                type="checkbox"
                checked={showOverlay}
                onChange={(event) => setShowOverlay(event.target.checked)}
              />
              <span>Overlay</span>
            </label>
            <label
              className="toggle ghost-inline"
              htmlFor="raw-video-toggle"
              title={showRawVideo ? 'Rohvideo ausblenden' : 'Rohvideo anzeigen'}
            >
              <input
                id="raw-video-toggle"
                type="checkbox"
                checked={showRawVideo}
                onChange={(event) => setShowRawVideo(event.target.checked)}
              />
              <span>Rohvideo</span>
            </label>
            <button
              className="ghost-inline"
              type="button"
              onClick={() => setShowDiagnostics((current) => !current)}
              aria-expanded={showDiagnostics}
              aria-controls="gesture-diagnostics-panel"
              title={showDiagnostics ? 'Diagnose ausblenden' : 'Diagnose anzeigen'}
            >
              {showDiagnostics ? '🛠️ Diagnose ausblenden' : '🛠️ Diagnose anzeigen'}
            </button>
          </div>

          {cameraSwitchFeedback && (
            <div className="gesture-screen__meta-note">{cameraSwitchFeedback}</div>
          )}
          <div className="gesture-screen__meta-note">{liveRecognitionStatus}</div>
          {profileModelRequired && !isProfileModelActive && (
            <div className="gesture-screen__meta-warning">
              Persönliches Profilmodell noch nicht aktiv. Bitte warte kurz oder öffne „Lernen“, um das Training zu prüfen.
              {!allowGlobalFallbackOutput && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="ghost-inline"
                    onClick={() => setAllowGlobalFallbackOutput(true)}
                    title="Vorübergehend mit dem Ersatzmodell fortfahren"
                  >
                    Vorübergehend mit Ersatzmodell fortfahren
                  </button>
                </>
              )}
              {allowGlobalFallbackOutput && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="ghost-inline"
                    onClick={() => setAllowGlobalFallbackOutput(false)}
                    title="Wieder auf Profilmodell warten"
                  >
                    Wieder auf Profilmodell warten
                  </button>
                </>
              )}
            </div>
          )}
          {audioMuted && (
            <div className="gesture-screen__meta-note">
              <strong>Audio stummgeschaltet.</strong> So stören Umgebungsgeräusche die Erkennung nicht.
            </div>
          )}
          {!cameraSupported && (
            <div className="gesture-screen__meta-warning">
              Kamera nicht verfügbar. Bitte erlaube den Kamerazugriff oder nutze ein Gerät mit Webcam.
            </div>
          )}
          {error && <div className="gesture-screen__meta-error">{error}</div>}

          {showDiagnostics && (
            <div
              id="gesture-diagnostics-panel"
              className="gesture-screen__diagnostics"
              data-severity={diagnostics.severity}
            >
              <p className="gesture-screen__diagnostics-title">{diagnostics.title}</p>
              <p className="gesture-screen__diagnostics-hint">{diagnostics.hint}</p>
              <ul>
                <li>Status: <strong>{formatStatusLabel(status)}</strong></li>
                <li>Hände im Bild: <strong>{hasDetectedHands ? 'Ja' : 'Nein'}</strong></li>
                <li>
                  Letzte Sicherheit:{' '}
                  <strong>{lastConfidence != null ? `${Math.round(lastConfidence * 100)}%` : 'Keine Messung'}</strong>
                </li>
                <li>
                  Trainierte Gebärden im Profil:{' '}
                  <strong>{trainedSignLabels.length > 0 ? trainedSignLabels.length : 'Keine'}</strong>
                </li>
                <li>
                  Letzte Systemmeldung:{' '}
                  <strong>{latestMessageSummary ?? 'Noch keine Meldung'}</strong>
                </li>
                <li>
                  Aktives Modell:{' '}
                  <strong>
                    {modelStatusLabel}
                    {modelMeta?.version ? ` (Version ${modelMeta.version})` : ''}
                  </strong>
                </li>
                <li>
                  Letzter Erkennungsweg:{' '}
                  <strong>{recognitionModeLabel}</strong>
                </li>
                <li>
                  Ausgabe-Freigabe:{' '}
                  <strong>{canUseProfileRecognition ? 'Aktiv' : 'Pausiert (wartet auf Profilmodell)'}</strong>
                </li>
              </ul>
            {suggestedMlpChoices.length > 0 && (
              <div className="gesture-screen__diagnostics-hint">
                <p>Aktuelle Modellwerte (beste Übereinstimmung zuerst):</p>
                <div className="gesture-screen__empty-actions">
                  <MlpCandidateButtons
                    choices={suggestedMlpChoices}
                    normalizedTrainedSignLabels={normalizedTrainedSignLabels}
                    labelDescriptorByNormalizedId={labelDescriptorByNormalizedId}
                    onSelect={setManualSuggestionLabel}
                    keyPrefix="diagnostics-"
                  />
                </div>
              </div>
            )}
            {trainedSignLabels.length > 0 && (
              <p className="gesture-screen__diagnostics-hint">
                Trainierte Beispiele: {trainedSignLabels.slice(0, 6).join(', ')}
                {trainedSignLabels.length > 6 ? ' …' : ''}
              </p>
            )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
