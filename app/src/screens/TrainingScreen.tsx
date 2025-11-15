import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import * as FileSystem from 'expo-file-system';
// Camera preview replaced by MediaPipe WebView detector
import {
  saveTrainingSample,
  loadProfile,
  loadTrainingSamples,
  Profile,
  TrainingFrame,
  TrainingSample,
  createTrainingSample,
} from '../storage';
import { gestureModel } from '../model';
import { useAccessibility } from '../components/AccessibilityContext';
import { audioService } from '../services';
import { validateLandmarkSequence } from '../services/TrainingDataValidator';
// Local landmark detection removed; relies on server fallback below.
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import BottomNav from '../components/BottomNav';
import { useMessage } from '../context/MessageContext';
import { logger } from '../utils/logger';
import {
  getClipCaptureErrorMessage,
  persistClipToDirectory,
  persistImageDataUrlToDirectory,
  type ExpoFileSystemCompat,
  canUseClipStorage,
} from '../utils/clipPersistence';
import {
  MediaPipeGestureDetector,
  MediaPipeGestureDetectorHandle,
  CameraStateEvent,
  MediaPipeErrorDetails,
} from '../components/MediaPipeGestureDetector';
import { cloneLandmarks, adjustHandednessForMirror } from '../utils/landmarkUtils';
import { logHIPEvent } from '../services/hipEvents';

import { createButtonStyles } from '../styles/buttonStyles';
import { hapticFeedback } from '../utils/hapticUtils';
import { childFriendlyStyles } from '../styles/touchTargets';
import type { ClipReadyPayload, FrameBatchPayload } from '../types/frames';
import ScreenBackground from '../components/ScreenBackground';
import { AmyLoopTimeline } from '../components/AmyLoopTimeline';
import type { WorkflowRouteName } from '../constants/workflow';
import {
  CAMERA_TOGGLE_COPY,
  getCameraFacingText,
  getCameraStatusText,
  getNextCameraFacingMode,
} from '../constants/cameraToggle';
import { APP_TAB_ROUTES, ROOT_STACK_ROUTES } from '../navigation/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const UNSUPPORTED_CLIP_REASONS = new Set([
  'media_recorder_unavailable',
  'media_recorder_not_supported',
  'orchestrator_unavailable',
  'no_camera_stream',
  'recorder_init_failed',
  'recorder_start_failed',
  'clip_directory_unavailable',
]);

const expoFs = FileSystem as ExpoFileSystemCompat;

export default function TrainingScreen({ navigation, route }: any) {
  const { largeText, highContrast } = useAccessibility();
  const { gestureLabel, isPractice, targetSamples } = route.params || {};
  const gestures = Array.isArray(gestureModel.gestures) ? gestureModel.gestures : [];
  const TARGET_SAMPLES = isPractice ? (typeof targetSamples === 'number' ? targetSamples : 5) : 5;
  // No camera ref needed; WebView handles its own camera
  const [gestureId, setGestureId] = useState<string | null>(gestureLabel || null);
  const [count, setCount] = useState(0);
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'processing'>('idle');
  const isRecording = recordingState === 'recording';
  const isProcessingRecording = recordingState === 'processing';
  const [recordedFrames, setRecordedFrames] = useState<TrainingFrame[]>([]);
  const [framesCaptured, setFramesCaptured] = useState(0);
  const [stillPreviewUri, setStillPreviewUri] = useState<string | null>(null);
  const [referenceStill, setReferenceStill] = useState<{ uri: string; capturedAt?: string } | null>(null);
  const [lastDetection, setLastDetection] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useMessage();
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const detectorRef = useRef<MediaPipeGestureDetectorHandle | null>(null);
  const clipRequestIdRef = useRef<string | null>(null);
  const clipFileRef = useRef<string | null>(null);
  const stillFileRef = useRef<string | null>(null);
  const lastStillFrameRef = useRef<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [clipCaptureMode, setClipCaptureMode] = useState<'enabled' | 'fallback'>(() =>
    canUseClipStorage(expoFs) ? 'enabled' : 'fallback',
  );
  const clipSupportReasonRef = useRef<string | null>(
    canUseClipStorage(expoFs) ? null : 'clip_directory_unavailable',
  );
  const clipFallbackToastShownRef = useRef(false);
  const stillPreviewUriRef = useRef<string | null>(null);
  useEffect(() => {
    stillPreviewUriRef.current = stillPreviewUri;
  }, [stillPreviewUri]);
  const announceClipFallback = useCallback(() => {
    if (clipFallbackToastShownRef.current) {
      return;
    }
    clipFallbackToastShownRef.current = true;
    showToast({
      message: 'Videoaufnahmen funktionieren auf diesem Gerät nicht. Amy speichert trotzdem deine Handbewegungen.',
      tone: 'info',
    });
  }, [showToast]);
  const insets = useSafeAreaInsets();
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    if (clipCaptureMode === 'fallback') {
      announceClipFallback();
    }
  }, [announceClipFallback, clipCaptureMode]);

  const persistFallbackIfUnsupported = useCallback(
    (reason: string | null | undefined) => {
      if (!reason) {
        return false;
      }
      if (UNSUPPORTED_CLIP_REASONS.has(reason)) {
        clipSupportReasonRef.current = reason;
        if (clipCaptureMode !== 'fallback') {
          setClipCaptureMode('fallback');
        }
        return true;
      }
      return false;
    },
    [clipCaptureMode],
  );

  const enterClipFallback = useCallback(
    (reason: string) => {
      clipSupportReasonRef.current = reason;
      const alreadyHandled = persistFallbackIfUnsupported(reason);
      if (!alreadyHandled && clipCaptureMode !== 'fallback') {
        setClipCaptureMode('fallback');
      }
      announceClipFallback();
    },
    [announceClipFallback, clipCaptureMode, persistFallbackIfUnsupported],
  );

  const ensureClipCaptureMode = useCallback(
    (mode: typeof clipCaptureMode): typeof clipCaptureMode => {
      if (mode !== 'enabled') {
        return mode;
      }

      if (!canUseClipStorage(expoFs)) {
        enterClipFallback('clip_directory_unavailable');
        return 'fallback';
      }

      if (persistFallbackIfUnsupported(clipSupportReasonRef.current)) {
        return 'fallback';
      }

      return 'enabled';
    },
    [enterClipFallback, persistFallbackIfUnsupported],
  );

  const persistClip = useCallback(async (clip: ClipReadyPayload): Promise<string> => {
    const targetUri = await persistClipToDirectory({
      fs: expoFs,
      clip,
      directoryName: 'amy-training-clips',
      filePrefix: 'amy-training',
      logger,
    });
    clipFileRef.current = targetUri;
    return targetUri;
  }, []);

  const cleanupTrainingFiles = useCallback(async () => {
    const cleanupRef = async (fileRef: React.MutableRefObject<string | null>, type: string) => {
      if (fileRef.current) {
        try {
          await expoFs.deleteAsync(fileRef.current, { idempotent: true });
        } catch (error) {
          logger.warn(`Failed to clean up training ${type}`, error);
        } finally {
          fileRef.current = null;
        }
      }
    };

    await cleanupRef(clipFileRef, 'clip file');
    await cleanupRef(stillFileRef, 'still image');

    lastStillFrameRef.current = null;
  }, []);

  useEffect(() => {
    if (!error) {
      return;
    }
    showToast({ message: error, tone: 'error' });
  }, [error, showToast]);
  const isRecordingRef = useRef(isRecording);
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // No-op: local landmark model removed.

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const maybeProfile = loadProfile();
    if (!maybeProfile || typeof (maybeProfile as Promise<Profile | null>).then !== 'function') {
      logger.warn('loadProfile returned no promise for training screen');
      return;
    }
    maybeProfile
      .then(setProfile)
      .catch((e) => {
        logger.error('Failed to load profile', e);
        setError('Profil konnte nicht geladen werden.');
      });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const resolveLatestStill = (samples: TrainingSample[], label: string): { uri: string; capturedAt?: string } | null => {
      const matching = samples.filter(
        (sample) => sample.label === label && typeof sample.stillUri === 'string' && sample.stillUri.trim().length > 0,
      );
      if (matching.length === 0) {
        return null;
      }
      const latest = matching.reduce((acc, current) => {
        const accTime = Date.parse(acc.capturedAt ?? acc.createdAt ?? '1970-01-01T00:00:00.000Z');
        const currentTime = Date.parse(current.capturedAt ?? current.createdAt ?? '1970-01-01T00:00:00.000Z');
        if (Number.isNaN(currentTime)) {
          return acc;
        }
        if (Number.isNaN(accTime)) {
          return current;
        }
        return currentTime > accTime ? current : acc;
      });
      return { uri: latest.stillUri.trim(), capturedAt: latest.capturedAt ?? latest.createdAt };
    };

    const hydrate = async () => {
      if (!gestureId || !profile?.id) {
        if (!cancelled) {
          setReferenceStill(null);
          if (!stillPreviewUriRef.current) {
            setStillPreviewUri(null);
          }
        }
        return;
      }

      try {
        const samples = await loadTrainingSamples(profile.id);
        if (cancelled) {
          return;
        }
        const latest = resolveLatestStill(samples, gestureId);
        setReferenceStill(latest);
        if (!stillPreviewUriRef.current && latest?.uri) {
          setStillPreviewUri(latest.uri);
        }
      } catch (loadError) {
        logger.warn('Failed to load stored gesture still image', loadError);
        if (!cancelled) {
          setReferenceStill(null);
        }
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [gestureId, profile?.id]);

  const detectionActive = now - lastDetection < 1000;

  const trainingLoopStage = useMemo<WorkflowRouteName>(() => {
    if (error) {
      return APP_TAB_ROUTES.Recognition;
    }
    if (!gestureId) {
      return APP_TAB_ROUTES.Lernen;
    }
    if (isRecording) {
      return APP_TAB_ROUTES.Recognition;
    }
    if (framesCaptured > 0 && !isRecording) {
      return APP_TAB_ROUTES.History;
    }
    if (count > 0) {
      return APP_TAB_ROUTES.Lernen;
    }
    return APP_TAB_ROUTES.Recognition;
  }, [count, error, framesCaptured, gestureId, isRecording]);

  // Local frame processor removed; remote fallback below now drives landmark updates.

  // Detection is handled by the MediaPipe WebView detector, which also falls back to server.

  const handleFrameBatch = useCallback(
    (payload: FrameBatchPayload) => {
      if (!isRecordingRef.current || !payload || payload.landmarks.length === 0) {
        return;
      }

      const mirrored = facingMode === 'user';
      const framesToAppend: TrainingFrame[] = [];
      const handednessBatches = Array.isArray(payload.handednesses) ? payload.handednesses : [];
      const frameImages = Array.isArray(payload.frames)
        ? payload.frames.filter((frame): frame is string => typeof frame === 'string')
        : [];

      if (frameImages.length > 0) {
        const lastFrame = frameImages[frameImages.length - 1];
        if (typeof lastFrame === 'string' && lastFrame.trim().length > 0) {
          lastStillFrameRef.current = lastFrame;
          setStillPreviewUri(lastFrame);
        }
      }

      payload.landmarks.forEach((frame, index) => {
        const cloned = cloneLandmarks(frame as number[][][]);
        if (!cloned.some((hand) => hand.length > 0)) {
          return;
        }
        const fallbackLabels: Array<string | undefined> = new Array(cloned.length).fill(undefined);
        const handedness = adjustHandednessForMirror(
          handednessBatches[index] ?? fallbackLabels,
          mirrored,
        );
        framesToAppend.push({
          landmarks: cloned,
          handedness,
        });
      });

      if (framesToAppend.length === 0) {
        return;
      }

      const lastFrame = framesToAppend[framesToAppend.length - 1];
      if (!lastFrame) {
        return;
      }
      setLastDetection(Date.now());

      setRecordedFrames((prev) => {
        const combined = [...prev, ...framesToAppend];
        const MAX_BUFFERED_FRAMES = 240;
        return combined.length > MAX_BUFFERED_FRAMES
          ? combined.slice(-MAX_BUFFERED_FRAMES)
          : combined;
      });
      setFramesCaptured((count) => count + framesToAppend.length);
    },
    [facingMode],
  );

  const toggleFacingMode = useCallback(() => {
    void hapticFeedback.light();
    setFacingMode((current) => getNextCameraFacingMode(current));
    setLastDetection(0);
    setCameraReady(false);
  }, []);

  const handleResetGesture = useCallback(() => {
    if (isRecordingRef.current) {
      return;
    }
    setShowInstructions(false);
    setRecordingState('idle');
    setGestureId(null);
    setCount(0);
    setRecordedFrames([]);
    setFramesCaptured(0);
    setLastDetection(0);
    setStillPreviewUri(null);
    setReferenceStill(null);
    setCameraReady(false);
    clipRequestIdRef.current = null;
    detectorRef.current?.cancelClipCapture();
    void cleanupTrainingFiles();
  }, [cleanupTrainingFiles]);

  const handleCameraStateChange = useCallback(
    (state: CameraStateEvent) => {
      const readyStates: CameraStateEvent[] = ['camera_started', 'camera_start_hook_success'];
      const notReadyStates: CameraStateEvent[] = ['dom_ready', 'cleanup_done'];
      const errorStates: CameraStateEvent[] = ['camera_start_failed', 'camera_start_hook_error'];

      if (readyStates.includes(state)) {
        setCameraReady(true);
      } else if (notReadyStates.includes(state)) {
        setCameraReady(false);
      } else if (errorStates.includes(state)) {
        setCameraReady(false);
        showToast({
          message: 'Die Kamera ist noch nicht bereit. Bitte versuch es gleich noch einmal.',
          tone: 'info',
        });
      }
    },
    [showToast],
  );

  const startRecording = useCallback(async () => {
    if (recordingState !== 'idle') {
      return;
    }
    if (!gestureId || !cameraReady) {
      return;
    }
    setError(null);
    setRecordedFrames([]);
    setFramesCaptured(0);
    setLastDetection(0);
    setStillPreviewUri(null);
    await cleanupTrainingFiles();

    let clipId: string | null = null;
    let clipMode: typeof clipCaptureMode = ensureClipCaptureMode(clipCaptureMode);

    if (clipMode === 'enabled' && detectorRef.current) {
      try {
        clipId = await detectorRef.current.startClipCapture();
      } catch (error) {
        const reason = error instanceof Error ? error.message ?? 'clip_start_failed' : String(error ?? 'clip_start_failed');
        logger.warn('Failed to start clip capture, falling back to landmarks-only mode', error);
        const message = getClipCaptureErrorMessage(reason);
        const tone: 'error' | 'info' = reason === 'clip_directory_unavailable' ? 'info' : 'error';
        showToast({ message, tone });
        clipMode = 'fallback';
        enterClipFallback(reason);
      }
    }

    clipRequestIdRef.current = clipId;
    setRecordingState('recording');

    // HIP 2 or 4: sample start
    void logHIPEvent(isPractice ? 'HIP_4' : 'HIP_2', 'sample_start', { gestureId });
  }, [
    cameraReady,
    cleanupTrainingFiles,
    clipCaptureMode,
    ensureClipCaptureMode,
    enterClipFallback,
    gestureId,
    isPractice,
    recordingState,
  ]);

  const stopRecording = useCallback(async () => {
    setRecordingState('processing');
    try {
      if (!gestureId || !cameraReady) {
        return;
      }

      let clipUri: string | null = null;
      let clipFailure: unknown = null;
      let clipMode: typeof clipCaptureMode = ensureClipCaptureMode(clipCaptureMode);
      const clipCaptureId = clipRequestIdRef.current;
      let clipResult: ClipReadyPayload | null = null;
      let stillUri: string | null = null;

      if (clipMode === 'enabled' && clipRequestIdRef.current && detectorRef.current) {
        try {
          clipResult = await detectorRef.current.stopClipCapture();
          if (!clipResult?.base64) {
            throw new Error('clip_payload_empty');
          }
          clipUri = await persistClip(clipResult);
        } catch (error) {
          clipFailure = error;
          const reason =
            error instanceof Error ? error.message ?? 'clip_stop_failed' : String(error ?? 'clip_stop_failed');
          logger.warn('Failed to stop clip capture, switching to fallback mode', error);
          const message = getClipCaptureErrorMessage(error);
          const tone: 'error' | 'info' = reason === 'clip_directory_unavailable' ? 'info' : 'error';
          showToast({ message, tone });
          clipMode = 'fallback';
          enterClipFallback(reason);
          clipUri = '';
          try {
            detectorRef.current?.cancelClipCapture();
          } catch (cancelError) {
            logger.warn('Failed to cancel clip capture after stop error', cancelError);
          }
        } finally {
          clipRequestIdRef.current = null;
        }
      } else {
        detectorRef.current?.cancelClipCapture();
        clipRequestIdRef.current = null;
        if (clipMode === 'fallback') {
          clipUri = '';
        }
      }

      if (clipMode === 'enabled' && !clipUri) {
        showToast({ message: getClipCaptureErrorMessage(clipFailure), tone: 'error' });
        return;
      }

      const validation = validateLandmarkSequence(recordedFrames.map((f) => f.landmarks));
      if (!validation.ok) {
        await cleanupTrainingFiles();
        const msg = `Aufnahme muss verbessert werden: ${validation.suggestions.join(' ')}`;
        setError(msg);
        return;
      }

      const capturedAt = new Date().toISOString();
      const stillSource = lastStillFrameRef.current;
      if (stillSource) {
        const tokenBasis =
          clipResult?.id ?? clipCaptureId ?? `${gestureId ?? 'gesture'}-${Date.now().toString(36)}`;
        const sanitizedToken = tokenBasis.replace(/[^a-zA-Z0-9_-]/g, '');
        const stillPrefix = sanitizedToken.length > 0 ? `still-${sanitizedToken}` : `still-${Date.now().toString(36)}`;
        try {
          const stillPath = await persistImageDataUrlToDirectory({
            fs: expoFs,
            dataUrl: stillSource,
            directoryName: 'amy-training-stills',
            filePrefix: stillPrefix,
            logger,
          });
          stillUri = stillPath;
          stillFileRef.current = stillPath;
          setStillPreviewUri(stillPath);
          setReferenceStill({ uri: stillPath, capturedAt });
        } catch (stillError) {
          logger.warn('Failed to persist training still image', stillError);
          stillUri = '';
        }
      } else {
        stillUri = '';
      }

      const sample = createTrainingSample({
        profileId: profile?.id ?? 'default',
        label: gestureId,
        frames: recordedFrames,
        clipUri: clipUri ?? '',
        stillUri: stillUri ?? '',
        source: isPractice ? 'HIP_4' : 'HIP_2',
        capturedAt,
      });

      try {
        await saveTrainingSample(sample);
        clipFileRef.current = null;
        stillFileRef.current = null;
        lastStillFrameRef.current = null;
        setRecordedFrames([]);
        setCount((c) => c + 1);
        setFramesCaptured(0);
        setError(null);
        setLastDetection(0);

        // HIP 2 or 4: sample saved
        void logHIPEvent(isPractice ? 'HIP_4' : 'HIP_2', 'sample_saved', {
          gestureId,
          frames: framesCaptured,
        });

        if (isPractice) {
          await audioService.playEncouragement(gestureId);
        }
      } catch (e) {
        logger.error('Failed to save training sample', e);
        // Amy First: Show encouraging message instead of technical error
        setError(null); // Don't show technical errors
        showToast({ message: 'Das hat nicht geklappt. Lass es uns nochmal versuchen!', tone: 'warning' });
        // Log for caregiver analytics
        void logHIPEvent(isPractice ? 'HIP_4' : 'HIP_2', 'training_save_failed', {
          error: String(e).substring(0, 100),
          gestureId,
          framesCaptured,
        });
        clipRequestIdRef.current = null;
        // Clean up orphaned files when save fails
        await cleanupTrainingFiles();
      }
    } finally {
      setRecordingState('idle');
    }
  }, [
    audioService,
    cameraReady,
    cleanupTrainingFiles,
    clipCaptureMode,
    ensureClipCaptureMode,
    enterClipFallback,
    framesCaptured,
    gestureId,
    isPractice,
    persistClip,
    profile?.id,
    recordedFrames,
    showToast,
  ]);

  const handleFinish = () => {
    setShowInstructions(false);
    navigation.goBack();
  };

  const formatGestureName = useCallback(
    (
      gesture?: {
        label?: string;
        emoji?: string;
        id?: string;
      } | null,
    ) => {
      if (!gesture) {
        return '';
      }
      if (gesture.emoji && gesture.label?.startsWith(gesture.emoji)) {
        const stripped = gesture.label.slice(gesture.emoji.length).trim();
        return stripped.length > 0 ? stripped : gesture.label;
      }
      return gesture.label ?? gesture.id ?? '';
    },
    [],
  );

  const handleTimelineStagePress = useCallback(
    (route: WorkflowRouteName) => {
      navigation.navigate(ROOT_STACK_ROUTES.App, { screen: route });
    },
    [navigation],
  );

  const selectedGesture = useMemo(
    () => gestures.find((gesture) => gesture.id === gestureId) ?? null,
    [gestures, gestureId],
  );

  const selectedGestureEmoji = selectedGesture?.emoji ?? '🤲';
  const selectedGestureName = formatGestureName(selectedGesture);

  const displayGestureName = selectedGestureName || gestureId || 'diese Geste';

  const subtitleText = gestureId
    ? isPractice
      ? `Übe ${displayGestureName} in deinem Tempo und beobachte die Fortschrittsanzeige.`
      : `Nimm ${TARGET_SAMPLES} klare Beispiele auf, damit Amy ${displayGestureName} sicher erkennt.`
    : 'Wähle eine Geste, um das Training zu starten.';
  const trainingSteps = useMemo(
    () => [
      'Wähle eine bekannte Geste oder starte über „Neue Geste beibringen“ einen neuen Eintrag.',
      'Stell dich mit gut beleuchteter Hand in die Kamera – alle Finger sollen sichtbar sein.',
      'Drücke „Kamera starten“ und nimm mindestens 5 kurze, klare Beispiele auf.',
      'Variiere Abstand und Tempo leicht, damit Amy die Bewegung sicher erkennt.',
    ],
    [],
  );

  const progressDots = useMemo(
    () =>
      Array.from({ length: TARGET_SAMPLES }, (_, index) => {
        if (index < count) {
          return 'done' as const;
        }
        if (index === count && (isRecording || isProcessingRecording)) {
          return 'active' as const;
        }
        return 'pending' as const;
      }),
    [TARGET_SAMPLES, count, isProcessingRecording, isRecording],
  );

  const progressLabel = `${Math.min(count, TARGET_SAMPLES)}/${TARGET_SAMPLES} Beispiele`;
  const nextSampleNumber = Math.min(count + 1, TARGET_SAMPLES);
  const captureDisabled = (!cameraReady && recordingState === 'idle') || isProcessingRecording;

  const captureMessaging = useMemo(
    () => {
      if (isProcessingRecording) {
        return {
          hint: 'Clip wird gespeichert …',
          detectionStatus: 'Clip wird gespeichert …',
          accessibilityLabel: 'Aufnahme wird verarbeitet',
          accessibilityHint: 'Bitte warte, bis die aktuelle Aufnahme gespeichert wurde.',
        } as const;
      }

      if (isRecording) {
        return {
          hint: 'Aufnahme läuft …',
          detectionStatus: detectionActive ? 'Aufnahme läuft …' : 'Keine Hand erkannt',
          accessibilityLabel: 'Aufnahme stoppen',
          accessibilityHint: 'Tippe, um die aktuelle Aufnahme zu beenden.',
        } as const;
      }

      if (clipCaptureMode === 'fallback') {
        return {
          hint: 'Video wird nicht gespeichert – die Handbewegung zählt trotzdem als Beispiel.',
          detectionStatus: detectionActive ? 'Hand im Bild' : 'Keine Hand',
          accessibilityLabel: 'Beispiel ohne Video aufnehmen',
          accessibilityHint: 'Tippe, um ein Beispiel aufzuzeichnen. Das Video wird nicht gespeichert.',
        } as const;
      }

      if (!cameraReady) {
        return {
          hint: 'Tippe, um die Kamera zu starten.',
          detectionStatus: detectionActive ? 'Hand im Bild' : 'Keine Hand',
          accessibilityLabel: 'Kamera starten',
          accessibilityHint: 'Tippe, um die Kamera zu starten.',
        } as const;
      }

      return {
        hint: `Tippe für Beispiel ${nextSampleNumber} von ${TARGET_SAMPLES}`,
        detectionStatus: detectionActive ? 'Hand im Bild' : 'Keine Hand',
        accessibilityLabel: `Beispiel ${nextSampleNumber} / ${TARGET_SAMPLES} aufnehmen`,
        accessibilityHint: 'Tippe, um ein neues Beispiel aufzuzeichnen.',
      } as const;
    },
    [cameraReady, clipCaptureMode, detectionActive, isProcessingRecording, isRecording, nextSampleNumber],
  );

  const captureHint = captureMessaging.hint;
  const detectionStatusText = captureMessaging.detectionStatus;
  const captureAccessibilityLabel = captureMessaging.accessibilityLabel;
  const captureAccessibilityHint = captureMessaging.accessibilityHint;

  const activeStillUri = !isRecording ? stillPreviewUri ?? referenceStill?.uri ?? null : null;
  const summaryStillUri = stillPreviewUri ?? referenceStill?.uri ?? null;
  const referenceCapturedAt = referenceStill?.capturedAt;
  const referenceCapturedLabel = useMemo(() => {
    if (!referenceCapturedAt) {
      return null;
    }
    const date = new Date(referenceCapturedAt);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    try {
      return date.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (formatError) {
      logger.warn('Failed to format still capture timestamp', formatError);
      return null;
    }
  }, [referenceCapturedAt]);

  const progressTop = insets.top + SPACING.lg;
  const statusTop = progressTop + SPACING.xl;
  const captureBottom = insets.bottom + SPACING.xl;
  const cameraSafeAreaStyle = useMemo(
    () => ({
      top: insets.top,
      right: insets.right,
      bottom: insets.bottom,
      left: insets.left,
    }),
    [insets.bottom, insets.left, insets.right, insets.top],
  );
  const topControlsSafeAreaStyle = useMemo(
    () => ({
      top: Math.max(insets.top + SPACING.sm, SPACING.lg),
      left: insets.left + SPACING.md,
      right: insets.right + SPACING.md,
    }),
    [insets.left, insets.right, insets.top],
  );
  const captureAreaSafeAreaStyle = useMemo(
    () => ({
      bottom: captureBottom,
      left: insets.left,
      right: insets.right,
    }),
    [captureBottom, insets.left, insets.right],
  );
  const instructionsOverlayPaddingStyle = useMemo(
    () => ({
      paddingTop: insets.top + SPACING.xl,
      paddingBottom: insets.bottom + SPACING.xl,
      paddingLeft: insets.left + SPACING.xl,
      paddingRight: insets.right + SPACING.xl,
    }),
    [insets.bottom, insets.left, insets.right, insets.top],
  );

  const handleCapturePress = useCallback(() => {
    void hapticFeedback.light();
    if (isRecording) {
      void stopRecording();
      return;
    }

    if (!captureDisabled) {
      void startRecording();
    }
  }, [captureDisabled, isRecording, startRecording, stopRecording]);

  const panelBackground = highContrast ? COLORS.highContrastBackground : 'rgba(255, 255, 255, 0.97)';
  const panelBorderColor = highContrast ? COLORS.highContrastText : 'rgba(255, 255, 255, 0.45)';

  const buttonStyles = createButtonStyles();
  const topButtonBackground = highContrast ? COLORS.highContrastText : 'rgba(0, 0, 0, 0.65)';
  const topButtonDisabledBackground = highContrast ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.25)';
  const topButtonPressedOverlay = highContrast ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)';
  const topButtonTextColor = highContrast ? COLORS.highContrastBackground : '#ffffff';
  const overlaySurface = highContrast ? COLORS.highContrastText : 'rgba(0, 0, 0, 0.65)';
  const overlaySurfaceMuted = highContrast ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.45)';
  const overlayTextColor = highContrast ? COLORS.highContrastBackground : '#ffffff';
  const captureBorderColor = highContrast ? COLORS.highContrastText : 'rgba(255, 255, 255, 0.65)';
  const capturePressedOverlay = highContrast ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.12)';
  const captureInnerColor = highContrast ? COLORS.highContrastBackground : '#ffffff';
  const captureInnerRecordingColor = highContrast ? COLORS.highContrastText : '#ef4444';
  const instructionsBackground = highContrast ? COLORS.highContrastBackground : '#ffffff';
  const instructionsTextColor = highContrast ? COLORS.highContrastText : COLORS.text;
  const instructionsActionBackground = highContrast ? COLORS.highContrastText : COLORS.primaryAccent;
  const instructionsActionPressedBackground = highContrast ? COLORS.highContrastPressed : COLORS.actionSecondaryPressed;
  const instructionsActionTextColor = highContrast ? COLORS.highContrastBackground : COLORS.highContrastText;

  const styles = StyleSheet.create({
    cameraScreen: {
      flex: 1,
      backgroundColor: '#000000',
    },
    cameraFeedWrapper: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: '#000000',
    },
    topControls: {
      position: 'absolute',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    topButtonGroup: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    topButton: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: topButtonBackground,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topButtonDisabled: {
      backgroundColor: topButtonDisabledBackground,
    },
    topButtonPressed: {
      backgroundColor: topButtonPressedOverlay,
    },
    topButtonText: {
      color: topButtonTextColor,
      fontSize: largeText ? 22 : 18,
      fontWeight: '700',
    },
    progressIndicator: {
      position: 'absolute',
      alignSelf: 'center',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    progressDots: {
      flexDirection: 'row',
      gap: SPACING.xs,
    },
    progressDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: 'rgba(255, 255, 255, 0.28)',
    },
    progressDotFilled: {
      backgroundColor: COLORS.success,
    },
    progressDotActive: {
      backgroundColor: highContrast ? COLORS.highContrastText : COLORS.warning,
      transform: [{ scale: 1.1 }],
    },
    progressLabel: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      borderRadius: 18,
      backgroundColor: overlaySurface,
      color: overlayTextColor,
      fontSize: largeText ? 16 : 14,
      fontWeight: '700',
    },
    progressGesture: {
      color: overlayTextColor,
      fontSize: largeText ? 20 : 18,
      fontWeight: '700',
      textShadowColor: 'rgba(0, 0, 0, 0.6)',
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 6,
    },
    cameraStatusText: {
      color: overlayTextColor,
      fontSize: largeText ? 14 : 12,
      opacity: 0.85,
    },
    statusPill: {
      position: 'absolute',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      backgroundColor: overlaySurface,
      borderRadius: 24,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    statusText: {
      color: overlayTextColor,
      fontSize: largeText ? 16 : 14,
      fontWeight: '600',
    },
    recordingIndicator: {
      position: 'absolute',
      top: '45%',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      backgroundColor: overlaySurface,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      borderRadius: 999,
    },
    recordingDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: '#ef4444',
    },
    recordingText: {
      color: overlayTextColor,
      fontSize: largeText ? 18 : 16,
      fontWeight: '600',
    },
    captureArea: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      gap: SPACING.sm,
    },
    captureButton: {
      width: 96,
      height: 96,
      borderRadius: 48,
      borderWidth: 4,
      borderColor: captureBorderColor,
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    captureButtonActive: {
      borderColor: '#ef4444',
      backgroundColor: 'rgba(239, 68, 68, 0.28)',
    },
    captureButtonDisabled: {
      opacity: 0.45,
    },
    captureButtonPressed: {
      backgroundColor: capturePressedOverlay,
    },
    captureButtonInner: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: captureInnerColor,
    },
    captureButtonInnerRecording: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: captureInnerRecordingColor,
    },
    captureHint: {
      color: overlayTextColor,
      fontSize: largeText ? 16 : 14,
      fontWeight: '700',
      textAlign: 'center',
      textShadowColor: 'rgba(0, 0, 0, 0.6)',
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 6,
    },
    captureSubHint: {
      color: overlayTextColor,
      opacity: 0.75,
      fontSize: largeText ? 14 : 12,
      textAlign: 'center',
    },
    stillPreview: {
      marginTop: SPACING.sm,
      width: '100%',
      maxWidth: 360,
      alignItems: 'center',
      gap: SPACING.xs,
    },
    stillPreviewImage: {
      width: '100%',
      aspectRatio: 4 / 3,
      borderRadius: DEFAULT_RADIUS * 1.2,
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
    stillPreviewMeta: {
      color: overlayTextColor,
      fontSize: largeText ? 13 : 11,
      textAlign: 'center',
      opacity: 0.75,
    },
    stillPreviewCaption: {
      color: overlayTextColor,
      fontSize: largeText ? 14 : 12,
      textAlign: 'center',
      opacity: 0.85,
    },
    exitButton: {
      marginTop: SPACING.sm,
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.sm,
      borderRadius: DEFAULT_RADIUS * 1.5,
      backgroundColor: overlaySurface,
    },
    exitButtonPressed: {
      backgroundColor: overlaySurfaceMuted,
    },
    exitButtonText: {
      color: overlayTextColor,
      fontWeight: '600',
      fontSize: largeText ? 16 : 14,
    },
    instructionsOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.xl,
    },
    instructionsCard: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: instructionsBackground,
      borderRadius: DEFAULT_RADIUS * 2,
      padding: SPACING.xl,
      gap: SPACING.md,
    },
    instructionsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    instructionsTitle: {
      fontSize: largeText ? 24 : 20,
      fontWeight: '700',
      color: instructionsTextColor,
    },
    instructionsClose: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: highContrast ? 'rgba(0, 0, 0, 0.12)' : 'rgba(0, 0, 0, 0.08)',
    },
    instructionsClosePressed: {
      backgroundColor: highContrast ? 'rgba(0, 0, 0, 0.22)' : 'rgba(0, 0, 0, 0.16)',
    },
    instructionsCloseText: {
      color: instructionsTextColor,
      fontSize: 28,
      fontWeight: '700',
    },
    instructionsGesture: {
      fontSize: largeText ? 20 : 18,
      fontWeight: '600',
      color: instructionsTextColor,
    },
    instructionsStep: {
      fontSize: largeText ? 18 : 16,
      lineHeight: largeText ? 26 : 22,
      color: instructionsTextColor,
    },
    instructionsAction: {
      marginTop: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: DEFAULT_RADIUS * 1.5,
      backgroundColor: instructionsActionBackground,
      alignItems: 'center',
    },
    instructionsActionPressed: {
      backgroundColor: instructionsActionPressedBackground,
    },
    instructionsActionText: {
      color: instructionsActionTextColor,
      fontWeight: '700',
      fontSize: largeText ? 18 : 16,
    },
    screen: { flex: 1 },
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    scrollContent: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingTop: SPACING.md,
      paddingBottom: SPACING.xxl * 3,
    },
    loopWrapper: {
      width: '100%',
      maxWidth: 520,
      marginBottom: SPACING.md,
      alignItems: 'flex-start',
      alignSelf: 'center',
    },
    content: {
      width: '100%',
      maxWidth: 520,
      alignItems: 'stretch',
      gap: SPACING.lg,
      alignSelf: 'center',
    },
    panel: {
      width: '100%',
      padding: SPACING.lg,
      borderRadius: DEFAULT_RADIUS * 2,
      backgroundColor: panelBackground,
      borderWidth: highContrast ? 2 : StyleSheet.hairlineWidth,
      borderColor: panelBorderColor,
      shadowColor: highContrast ? 'transparent' : COLORS.shadow,
      shadowOpacity: highContrast ? 0 : 0.18,
      shadowRadius: highContrast ? 0 : 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: highContrast ? 0 : 8,
      alignItems: 'center',
      gap: SPACING.md,
    },
    title: {
      fontSize: largeText ? 28 : 24,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: largeText ? 18 : 16,
      color: highContrast ? COLORS.highContrastText : COLORS.textSecondary,
      textAlign: 'center',
    },
    trainingInfoCard: {
      width: '100%',
      borderRadius: DEFAULT_RADIUS * 1.5,
      padding: SPACING.md,
      backgroundColor: highContrast ? COLORS.highContrastBackground : 'rgba(16, 36, 63, 0.08)',
      borderWidth: highContrast ? 2 : StyleSheet.hairlineWidth,
      borderColor: highContrast ? COLORS.highContrastText : 'rgba(16, 36, 63, 0.16)',
      gap: SPACING.sm,
    },
    trainingInfoTitle: {
      fontSize: largeText ? 18 : 16,
      fontWeight: '600',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    trainingInfoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.xs,
    },
    trainingInfoNumber: {
      fontSize: largeText ? 16 : 14,
      fontWeight: '600',
      color: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
      marginTop: 1,
    },
    trainingInfoText: {
      flex: 1,
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    gestureGrid: {
      width: '100%',
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: SPACING.md,
    },
    gestureCard: {
      width: '46%',
      minWidth: 140,
      borderRadius: DEFAULT_RADIUS * 1.5,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.sm,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
      borderWidth: highContrast ? 2 : StyleSheet.hairlineWidth,
      borderColor: highContrast ? COLORS.highContrastText : 'rgba(16, 36, 63, 0.1)',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    gestureCardPressed: {
      transform: [{ scale: 0.98 }],
    },
    gestureEmoji: {
      fontSize: largeText ? 40 : 36,
    },
    gestureName: {
      fontSize: largeText ? 18 : 16,
      fontWeight: '600',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      textAlign: 'center',
    },
    gestureHint: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.textSecondary,
      textAlign: 'center',
    },
    summaryContainer: {
      width: '100%',
      alignItems: 'center',
      gap: SPACING.md,
    },
    summaryStillCard: {
      width: '100%',
      maxWidth: 360,
      borderRadius: DEFAULT_RADIUS * 1.5,
      padding: SPACING.md,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
      borderWidth: highContrast ? 2 : StyleSheet.hairlineWidth,
      borderColor: highContrast ? COLORS.highContrastText : 'rgba(16, 36, 63, 0.16)',
      gap: SPACING.sm,
      alignItems: 'center',
    },
    summaryStillTitle: {
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      fontWeight: '700',
      fontSize: largeText ? 18 : 16,
      textAlign: 'center',
    },
    summaryStillImage: {
      width: '100%',
      aspectRatio: 4 / 3,
      borderRadius: DEFAULT_RADIUS * 1.2,
      backgroundColor: highContrast ? COLORS.highContrastBackground : 'rgba(16, 36, 63, 0.08)',
    },
    summaryStillMeta: {
      color: highContrast ? COLORS.highContrastText : COLORS.textSecondary,
      fontSize: largeText ? 14 : 12,
      textAlign: 'center',
    },
    summaryStillCaption: {
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      fontSize: largeText ? 15 : 13,
      textAlign: 'center',
    },
    summaryStillPlaceholder: {
      width: '100%',
      maxWidth: 360,
      borderRadius: DEFAULT_RADIUS * 1.5,
      padding: SPACING.md,
      backgroundColor: highContrast ? COLORS.highContrastBackground : 'rgba(16, 36, 63, 0.08)',
      borderWidth: highContrast ? 2 : StyleSheet.hairlineWidth,
      borderColor: highContrast ? COLORS.highContrastText : 'rgba(16, 36, 63, 0.1)',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    summaryStillPlaceholderText: {
      color: highContrast ? COLORS.highContrastText : COLORS.textSecondary,
      fontSize: largeText ? 16 : 14,
      textAlign: 'center',
    },
    summaryText: {
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      fontSize: largeText ? 18 : 16,
      textAlign: 'center',
    },
    summaryTextSpacing: {
      marginBottom: SPACING.sm,
    },
    ...buttonStyles,
    primaryButton: {
      alignSelf: 'stretch',
    },
    secondaryButton: {
      backgroundColor: COLORS.secondaryAccent,
      padding: SPACING.sm,
      borderRadius: DEFAULT_RADIUS,
      alignItems: 'center',
      alignSelf: 'stretch',
      marginTop: SPACING.sm,
    },
    secondaryButtonHC: {
      backgroundColor: COLORS.highContrastText,
    },
    secondaryButtonPressed: {
      backgroundColor: COLORS.pressed,
    },
    secondaryButtonPressedHC: {
      backgroundColor: COLORS.highContrastPressed,
    },
    secondaryButtonText: {
      color: COLORS.text,
      fontSize: 14,
      fontWeight: 'bold',
    },
    secondaryButtonTextLarge: {
      fontSize: 18,
    },
    secondaryButtonTextHC: {
      color: COLORS.highContrastBackground,
    },
  });

  // Camera permission handled by WebView context.

  if (gestureId && count < TARGET_SAMPLES) {
    return (
      <View style={styles.cameraScreen}>
        <View style={[styles.cameraFeedWrapper, cameraSafeAreaStyle]}>
          <MediaPipeGestureDetector
            ref={detectorRef}
            onWebViewEvent={(telemetry) => {
              logger.info('Training WebView telemetry:', telemetry);
            }}
            onFrameBatch={handleFrameBatch}
            onLandmarks={() => {
              setLastDetection(Date.now());
            }}
            onGestureDetected={() => {
              if (isRecordingRef.current) {
                setLastDetection(Date.now());
              }
            }}
            onError={(message, details?: MediaPipeErrorDetails) => {
              if (message === 'clip_error') {
                const reason = details?.reason ?? 'unknown';
                setRecordingState('idle');
                clipRequestIdRef.current = null;

                const unsupported = persistFallbackIfUnsupported(reason);
                detectorRef.current?.cancelClipCapture();
                void cleanupTrainingFiles();

                if (unsupported) {
                  clipSupportReasonRef.current = reason;
                  announceClipFallback();
                  void logHIPEvent(isPractice ? 'HIP_4' : 'HIP_2', 'clip_capture_unsupported', {
                    reason,
                  });
                } else if (reason === 'video_not_ready') {
                  // Transient error - video might become ready, don't switch to permanent fallback
                  logger.info('Video not ready for clip capture, user can retry', { reason });
                  void logHIPEvent(isPractice ? 'HIP_4' : 'HIP_2', 'clip_capture_video_not_ready', {
                    reason,
                  });
                  showToast({ message: getClipCaptureErrorMessage(reason), tone: 'info' });
                } else {
                  // Other errors indicate clip capture won't work - switch to fallback mode
                  logger.warn('TrainingScreen clip error received', { reason });
                  clipSupportReasonRef.current = reason;
                  if (clipCaptureMode !== 'fallback') {
                    setClipCaptureMode('fallback');
                  }
                  announceClipFallback();
                  void logHIPEvent(isPractice ? 'HIP_4' : 'HIP_2', 'clip_capture_failed', {
                    reason,
                  });
                  showToast({ message: getClipCaptureErrorMessage(reason), tone: 'error' });
                }
                return;
              }

              logger.warn('TrainingScreen detector error:', message);
              showToast({
                message: 'Die Erkennung wurde angehalten. Bitte versuch es erneut.',
                tone: 'warning',
              });
            }}
            facingMode={facingMode}
            onCameraStateChange={handleCameraStateChange}
          />
        </View>

        <View
          style={[
            styles.topControls,
            topControlsSafeAreaStyle,
          ]}
        >
          <View style={styles.topButtonGroup}>
            <Pressable
              onPress={handleResetGesture}
              disabled={isRecording}
              accessibilityRole="button"
              accessibilityLabel="Zurück zur Gestenliste"
              accessibilityHint="Nur verfügbar, wenn keine Aufnahme läuft."
              style={({ pressed }) => [
                childFriendlyStyles.minTouchTarget,
                styles.topButton,
                isRecording && styles.topButtonDisabled,
                pressed && !isRecording && styles.topButtonPressed,
              ]}
            >
              <Text style={styles.topButtonText}>←</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowInstructions(true)}
              accessibilityRole="button"
              accessibilityLabel="Schnellanleitung anzeigen"
              style={({ pressed }) => [
                childFriendlyStyles.minTouchTarget,
                styles.topButton,
                pressed && styles.topButtonPressed,
              ]}
            >
              <Text style={styles.topButtonText}>?</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={toggleFacingMode}
            accessibilityRole="button"
            accessibilityLabel={CAMERA_TOGGLE_COPY.accessibilityLabel}
            accessibilityHint={CAMERA_TOGGLE_COPY.accessibilityHint}
            accessibilityValue={{ text: getCameraFacingText(facingMode) }}
            style={({ pressed }) => [
              childFriendlyStyles.minTouchTarget,
              styles.topButton,
              pressed && styles.topButtonPressed,
            ]}
          >
            <Text style={styles.topButtonText}>⇆</Text>
          </Pressable>
        </View>

        <View style={[styles.progressIndicator, { top: progressTop }]}>
          <View style={styles.progressDots}>
            {progressDots.map((status, index) => (
              <View
                key={`progress-${index}`}
                style={[
                  styles.progressDot,
                  status === 'done' && styles.progressDotFilled,
                  status === 'active' && styles.progressDotActive,
                ]}
              />
            ))}
          </View>
          <Text style={styles.progressLabel}>{progressLabel}</Text>
          <Text style={styles.progressGesture}>{`${selectedGestureEmoji} ${displayGestureName}`}</Text>
          <Text style={styles.cameraStatusText}>{getCameraStatusText(facingMode)}</Text>
        </View>

        <View
          style={[
            styles.statusPill,
            {
              top: statusTop,
            },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: detectionActive ? COLORS.success : COLORS.warning },
            ]}
          />
          <Text style={styles.statusText}>{detectionStatusText}</Text>
        </View>

        {isRecording && (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>{`Aufnahme läuft … ${framesCaptured}`}</Text>
          </View>
        )}

        <View
          style={[
            styles.captureArea,
            captureAreaSafeAreaStyle,
          ]}
        >
          <Pressable
            onPress={handleCapturePress}
            accessibilityRole="button"
            accessibilityLabel={captureAccessibilityLabel}
            accessibilityHint={captureAccessibilityHint}
            disabled={captureDisabled && !isRecording}
            style={({ pressed }) => [
              childFriendlyStyles.minTouchTarget,
              styles.captureButton,
              isRecording && styles.captureButtonActive,
              captureDisabled && !isRecording && styles.captureButtonDisabled,
              pressed && !captureDisabled && styles.captureButtonPressed,
            ]}
          >
            <View
              style={[
                styles.captureButtonInner,
                isRecording && styles.captureButtonInnerRecording,
              ]}
            />
          </Pressable>
          <Text style={styles.captureHint}>{captureHint}</Text>
          {!isRecording && framesCaptured > 0 ? (
            <Text style={styles.captureSubHint}>
              Länge der letzten Aufnahme: {framesCaptured} Frames
            </Text>
          ) : null}
          {activeStillUri ? (
            <View style={styles.stillPreview}>
              <Image
                source={{ uri: activeStillUri }}
                style={styles.stillPreviewImage}
                accessibilityLabel="Standbild der letzten Aufnahme"
              />
              {referenceCapturedLabel ? (
                <Text style={styles.stillPreviewMeta}>{`Zuletzt aktualisiert am ${referenceCapturedLabel}`}</Text>
              ) : null}
              <Text style={styles.stillPreviewCaption}>
                Dieses Standbild speichert Amys Handform und steht allen Betreuungspersonen im Trainingsbereich zur Verfügung.
              </Text>
            </View>
          ) : null}
          <Pressable
            onPress={handleFinish}
            accessibilityRole="button"
            accessibilityLabel={
              isPractice ? 'Übung beenden und zurück zur Übersicht' : 'Training beenden und zurück'
            }
            style={({ pressed }) => [
              childFriendlyStyles.minTouchTarget,
              styles.exitButton,
              pressed && styles.exitButtonPressed,
            ]}
          >
            <Text style={styles.exitButtonText}>
              {isPractice ? 'Übung beenden' : 'Training beenden'}
            </Text>
          </Pressable>
        </View>

        {showInstructions && (
          <View
            style={[
              styles.instructionsOverlay,
              instructionsOverlayPaddingStyle,
            ]}
          >
            <View style={styles.instructionsCard}>
              <View style={styles.instructionsHeader}>
                <Text style={styles.instructionsTitle}>Schnellanleitung</Text>
                <Pressable
                  onPress={() => setShowInstructions(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Anleitung schließen"
                  style={({ pressed }) => [
                    childFriendlyStyles.minTouchTarget,
                    styles.instructionsClose,
                    pressed && styles.instructionsClosePressed,
                  ]}
                >
                  <Text style={styles.instructionsCloseText}>×</Text>
                </Pressable>
              </View>
              <Text style={styles.instructionsGesture}>{`${selectedGestureEmoji} ${displayGestureName}`}</Text>
              {trainingSteps.map((step, index) => (
                <Text key={`${index}-${step}`} style={styles.instructionsStep}>
                  {`${index + 1}. ${step}`}
                </Text>
              ))}
              <Pressable
                onPress={handleFinish}
                accessibilityRole="button"
                accessibilityLabel="Training beenden"
                style={({ pressed }) => [
                  childFriendlyStyles.minTouchTarget,
                  styles.instructionsAction,
                  pressed && styles.instructionsActionPressed,
                ]}
              >
                <Text style={styles.instructionsActionText}>
                  {isPractice ? 'Übung beenden' : 'Training abschließen'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenBackground
        scrollable
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.loopWrapper}>
          <AmyLoopTimeline
            activeStage={trainingLoopStage}
            layout="inline"
            compact
            hideDescriptions
            showIcons={false}
            onStagePress={handleTimelineStagePress}
          />
        </View>
        <View style={styles.content}>
          <View style={styles.panel}>
            <Text style={styles.title}>
            {isPractice
              ? gestureId
                ? `Übung ${gestureId}`
                : 'Übungsmodus'
              : gestureId
                ? `Training für ${gestureId}`
                : 'Trainingsmodus'}
            </Text>
            <Text style={styles.subtitle}>{subtitleText}</Text>
            {!gestureId ? (
              <>
                <View style={styles.trainingInfoCard}>
                  <Text style={styles.trainingInfoTitle}>So trainierst du neue Gesten</Text>
                  {trainingSteps.map((step, index) => (
                    <View key={`${index}-${step}`} style={styles.trainingInfoRow}>
                      <Text style={styles.trainingInfoNumber}>{index + 1}.</Text>
                      <Text style={styles.trainingInfoText}>{step}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.gestureGrid}>
                  {gestures.map((g) => {
                    const emoji = g?.emoji ?? '🤲';
                    const gestureName = formatGestureName(g) || g?.id || 'Geste';
                    return (
                      <Pressable
                        key={g.id}
                        style={({ pressed }) => [
                          childFriendlyStyles.minTouchTarget,
                          styles.gestureCard,
                          pressed && styles.gestureCardPressed,
                        ]}
                        onPress={() => {
                          void hapticFeedback.light();
                          setShowInstructions(false);
                          setGestureId(g.id);
                          setCount(0);
                          setRecordedFrames([]);
                          setFramesCaptured(0);
                          setLastDetection(0);
                          setError(null);
                          setStillPreviewUri(null);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Geste ${gestureName} auswählen`}
                        accessibilityHint="Starte das Training für diese Bewegung"
                      >
                        <Text style={styles.gestureEmoji}>{emoji}</Text>
                        <Text style={styles.gestureName}>{gestureName}</Text>
                        <Text style={styles.gestureHint}>5 klare Beispiele helfen Amy beim Lernen.</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : (
          <View style={styles.summaryContainer}>
              {summaryStillUri ? (
                <View style={styles.summaryStillCard}>
                  <Text style={styles.summaryStillTitle}>Gespeichertes Gestenbild</Text>
                  <Image
                    source={{ uri: summaryStillUri }}
                    style={styles.summaryStillImage}
                    accessibilityLabel={`Gespeichertes Gestenbild für ${gestureId}`}
                  />
                  {referenceCapturedLabel ? (
                    <Text style={styles.summaryStillMeta}>{`Zuletzt aktualisiert am ${referenceCapturedLabel}`}</Text>
                  ) : null}
                  <Text style={styles.summaryStillCaption}>
                    Dieses Bild hilft allen Betreuungspersonen, die Handform für {gestureId} nachzuvollziehen.
                  </Text>
                </View>
              ) : (
                <View style={styles.summaryStillPlaceholder}>
                  <Text style={styles.summaryStillPlaceholderText}>
                    Für diese Geste wurde noch kein Bild gespeichert. Nimm beim nächsten Training eine Aufnahme auf.
                  </Text>
                </View>
              )}
              <Text style={[styles.summaryText, styles.summaryTextSpacing]}>
                {`Alle ${TARGET_SAMPLES} Beispiele wurden aufgenommen. Du kannst die Sitzung jetzt abschließen.`}
              </Text>
              <Pressable
                style={({ pressed }) => [
                  childFriendlyStyles.minTouchTarget,
                  styles.button,
                  styles.primaryButton,
                  highContrast && styles.buttonHC,
                  pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
                ]}
                onPress={() => {
                  void hapticFeedback.light();
                  handleFinish();
                }}
                accessibilityRole="button"
                accessibilityLabel="Training abschließen und zurück"
              >
                <Text
                  style={[
                    styles.buttonText,
                    largeText && styles.buttonTextLarge,
                    highContrast && styles.buttonTextHC,
                  ]}
                >
                  {isPractice ? 'Übung beenden' : 'Training abschließen'}
                </Text>
              </Pressable>
            </View>
          )}
          </View>
        </View>
      </ScreenBackground>
      {profile && <BottomNav active="training" profileId={profile.id} />}
    </View>
  );
}
