
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import * as FileSystem from 'expo-file-system';
import Svg, { Circle } from 'react-native-svg';
import {
  saveTrainingSample,
  loadProfile,
  Profile,
  TrainingFrame,
  createTrainingSample,
} from '../storage';
import { gestureModel } from '../model';
import { useAccessibility } from '../components/AccessibilityContext';
import { audioService } from '../services';
import { validateLandmarkSequence } from '../services/TrainingDataValidator';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import { useMessage } from '../context/MessageContext';
import { logger } from '../utils/logger';
import {
  MediaPipeGestureDetector,
  MediaPipeGestureDetectorHandle,
  CameraStateEvent,
} from '../components/MediaPipeGestureDetector';
import { cloneLandmarks, adjustHandednessForMirror } from '../utils/landmarkUtils';
import { logHIPEvent } from '../services/hipEvents';
import DgsVideoPlayer from '../components/DgsVideoPlayer';
import { createButtonStyles } from '../styles/buttonStyles';
import { hapticFeedback } from '../utils/hapticUtils';
import { childFriendlyStyles } from '../styles/touchTargets';
import type { ClipReadyPayload, FrameBatchPayload } from '../types/frames';
import ScreenBackground from '../components/ScreenBackground';
import {
  CAMERA_TOGGLE_COPY,
  getCameraFacingText,
  getCameraStatusText,
  getCameraToggleActionText,
  getNextCameraFacingMode,
} from '../constants/cameraToggle';

const CLIP_RECORDING_ERROR_TEXT = 'Videoclip konnte nicht gespeichert werden. Versuch es nochmal!';
const MIN_PREVIEW_SIZE = 200;
const MAX_PREVIEW_SIZE = 420;
const PANEL_HORIZONTAL_PADDING = SPACING.lg * 2;

type ExpoFileSystemCompat = typeof FileSystem & {
  cacheDirectory?: string;
  documentDirectory?: string;
  EncodingType?: { Base64: string };
};

const expoFs = FileSystem as ExpoFileSystemCompat;

export default function RecordingScreen({ navigation, route }: any) {
  const { largeText, highContrast } = useAccessibility();
  const { width: windowWidth } = useWindowDimensions();
  const previewSize = useMemo(() => {
    if (windowWidth <= 0) {
      return MIN_PREVIEW_SIZE;
    }
    const availableWidth = Math.max(windowWidth - PANEL_HORIZONTAL_PADDING, 0);
    const clampedMax = Math.min(MAX_PREVIEW_SIZE, availableWidth);
    const desired = windowWidth * 0.75;
    const size = Math.min(desired, clampedMax);
    const minConstraint = Math.min(clampedMax, MIN_PREVIEW_SIZE);
    return Math.max(size, minConstraint);
  }, [windowWidth]);
  const { gestureLabel, gestureId: passedGestureId, isPractice, targetSamples } = route.params || {};
  const gestures = Array.isArray(gestureModel.gestures) ? gestureModel.gestures : [];
  const initialGesture = (gestureLabel as string | undefined) ?? (passedGestureId as string | undefined) ?? null;
  const TARGET_SAMPLES = isPractice ? (typeof targetSamples === 'number' ? targetSamples : 5) : 5;
  const [gestureId, setGestureId] = useState<string | null>(initialGesture);
  const [count, setCount] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedFrames, setRecordedFrames] = useState<TrainingFrame[]>([]);
  const [framesCaptured, setFramesCaptured] = useState(0);
  const [lastDetection, setLastDetection] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [landmarks, setLandmarks] = useState<number[][][]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useMessage();
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const detectorRef = useRef<MediaPipeGestureDetectorHandle | null>(null);
  const clipRequestIdRef = useRef<string | null>(null);
  const clipFileRef = useRef<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    setGestureId(initialGesture);
  }, [initialGesture]);

  const persistClip = useCallback(async (clip: ClipReadyPayload): Promise<string> => {
    const directory = expoFs.cacheDirectory ?? expoFs.documentDirectory;
    if (!directory) {
      throw new Error('clip_directory_unavailable');
    }
    const extension = clip.mimeType.includes('webm') ? 'webm' : 'mp4';
    const targetUri = `${directory}amy-training-${clip.id}.${extension}`;
    await expoFs.writeAsStringAsync(targetUri, clip.base64, {
      encoding: (expoFs.EncodingType?.Base64 ?? 'base64') as any,
    });
    clipFileRef.current = targetUri;
    return targetUri;
  }, []);

  const cleanupClipFile = useCallback(async () => {
    if (!clipFileRef.current) return;
    try {
      await expoFs.deleteAsync(clipFileRef.current, { idempotent: true });
    } catch (error) {
      logger.warn('Failed to clean up training clip file', error);
    } finally {
      clipFileRef.current = null;
    }
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

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const maybeProfile = loadProfile();
    if (!maybeProfile || typeof (maybeProfile as Promise<Profile | null>).then !== 'function') {
      logger.warn('loadProfile returned no promise for recording screen');
      return;
    }
    maybeProfile
      .then(setProfile)
      .catch((e) => {
        logger.error('Failed to load profile', e);
        setError('Profil konnte nicht geladen werden.');
      });
  }, []);

  const detectionActive = now - lastDetection < 1000;

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

  const selectedGesture = useMemo(
    () => gestures.find((gesture) => gesture.id === gestureId) ?? null,
    [gestures, gestureId],
  );

  const selectedGestureEmoji = selectedGesture?.emoji ?? '🤲';
  const selectedGestureName = formatGestureName(selectedGesture);
  const displayGestureName = selectedGestureName || gestureId || 'diese Geste';

  const trainingSteps = useMemo(
    () => [
      'Wähle eine bekannte Geste oder starte über „Neue Geste beibringen“ einen neuen Eintrag.',
      'Stell dich mit gut beleuchteter Hand in die Kamera – alle Finger sollen sichtbar sein.',
      'Drücke „Kamera starten“ und nimm mindestens 5 kurze, klare Beispiele auf.',
      'Variiere Abstand und Tempo leicht, damit Amy die Bewegung sicher erkennt.',
    ],
    [],
  );

  const subtitleText = gestureId
    ? isPractice
      ? `Übe ${displayGestureName} in deinem Tempo und achte auf ruhige Bewegungen.`
      : `Nimm ${TARGET_SAMPLES} klare Beispiele auf, damit Amy ${displayGestureName} sicher erkennt.`
    : 'Wähle eine Geste aus, um mit der Aufnahme zu beginnen.';
  const primaryCtaLabel = useMemo(() => {
    if (isRecording) {
      return 'Aufnahme stoppen';
    }
    if (!gestureId) {
      return 'Geste auswählen';
    }
    if (!cameraReady) {
      return 'Kamera starten';
    }
    return `Beispiel ${count + 1} / ${TARGET_SAMPLES} aufnehmen`;
  }, [cameraReady, count, gestureId, isRecording, TARGET_SAMPLES]);
  const panelBackground = highContrast ? COLORS.highContrastBackground : COLORS.panelBackground;
  const panelBorderColor = highContrast ? COLORS.highContrastText : COLORS.panelBorder;

  useEffect(() => {
    if (!detectionActive) setLandmarks([]);
  }, [detectionActive]);

  const handleFrameBatch = useCallback(
    (payload: FrameBatchPayload) => {
      if (!isRecordingRef.current || !payload || payload.landmarks.length === 0) {
        return;
      }

      const mirrored = facingMode === 'user';
      const framesToAppend: TrainingFrame[] = [];
      const handednessBatches = Array.isArray(payload.handednesses) ? payload.handednesses : [];

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
      setLandmarks(cloneLandmarks(lastFrame.landmarks));
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
    setCameraReady(false);
    setLandmarks([]);
    setLastDetection(0);
  }, []);

  const startRecording = useCallback(async () => {
    if (!gestureId || !cameraReady) return;
    setError(null);
    setRecordedFrames([]);
    setFramesCaptured(0);
    setLastDetection(0);
    await cleanupClipFile();
    setIsRecording(true);

    try {
      clipRequestIdRef.current = detectorRef.current
        ? await detectorRef.current.startClipCapture()
        : null;
    } catch (error) {
      clipRequestIdRef.current = null;
      logger.warn('Failed to start clip capture', error);
    }

    void logHIPEvent(isPractice ? 'HIP_4' : 'HIP_2', 'sample_start', { gestureId });
  }, [cameraReady, cleanupClipFile, gestureId, isPractice]);

  const stopRecording = useCallback(async () => {
    setIsRecording(false);
    if (!gestureId || !cameraReady) return;

    let clipUri: string | null = null;
    if (clipRequestIdRef.current && detectorRef.current) {
      try {
        const clipResult = await detectorRef.current.stopClipCapture();
        clipUri = await persistClip(clipResult);
      } catch (error) {
        logger.warn('Failed to stop clip capture', error);
        detectorRef.current.cancelClipCapture();
        showToast({ message: CLIP_RECORDING_ERROR_TEXT, tone: 'error' });
      } finally {
        clipRequestIdRef.current = null;
      }
    } else {
      detectorRef.current?.cancelClipCapture();
      clipRequestIdRef.current = null;
    }

    if (!clipUri) {
      showToast({ message: CLIP_RECORDING_ERROR_TEXT, tone: 'error' });
      return;
    }

    const validation = validateLandmarkSequence(recordedFrames.map((f) => f.landmarks));
    if (!validation.ok) {
      const msg = `Aufnahme muss verbessert werden: ${validation.suggestions.join(' ')}`;
      setError(msg);
      return;
    }

    try {
      const capturedAt = new Date().toISOString();
      const sample = createTrainingSample({
        profileId: profile?.id ?? 'default',
        label: gestureId,
        frames: recordedFrames,
        clipUri,
        source: isPractice ? 'HIP_4' : 'HIP_2',
        capturedAt,
      });

      await saveTrainingSample(sample);
      setRecordedFrames([]);
      setCount((c) => c + 1);
      setError(null);

      void logHIPEvent(isPractice ? 'HIP_4' : 'HIP_2', 'sample_saved', {
        gestureId,
        frames: framesCaptured,
      });

      if (isPractice) {
        await audioService.playEncouragement(gestureId);
      }
    } catch (e) {
      logger.error('Failed to save training sample', e);
      setError(null);
      showToast({ message: 'Das hat nicht geklappt. Lass es uns nochmal versuchen!', tone: 'warning' });
      void logHIPEvent(isPractice ? 'HIP_4' : 'HIP_2', 'training_save_failed', {
        error: String(e).substring(0, 100),
        gestureId,
        framesCaptured,
      });
      clipRequestIdRef.current = null;
    }
  }, [
    cameraReady,
    detectorRef,
    framesCaptured,
    gestureId,
    isPractice,
    persistClip,
    profile?.id,
    recordedFrames,
    showToast,
  ]);

  const handleFinish = () => {
    navigation.goBack();
  };

  const buttonStyles = createButtonStyles();
  const styles = StyleSheet.create({
    screen: { flex: 1 },
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    scrollContent: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.xxl * 4,
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
    selectedGestureCard: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      padding: SPACING.md,
      borderRadius: DEFAULT_RADIUS * 1.5,
      backgroundColor: highContrast ? COLORS.highContrastBackground : 'rgba(16, 36, 63, 0.08)',
      borderWidth: highContrast ? 2 : StyleSheet.hairlineWidth,
      borderColor: highContrast ? COLORS.highContrastText : 'rgba(16, 36, 63, 0.16)',
    },
    selectedGestureEmoji: {
      fontSize: largeText ? 44 : 40,
    },
    selectedGestureText: {
      flex: 1,
      gap: SPACING.xs,
    },
    selectedGestureName: {
      fontSize: largeText ? 20 : 18,
      fontWeight: '700',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    selectedGestureInfo: {
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.textSecondary,
    },
    cameraContainer: {
      width: previewSize,
      height: previewSize,
      marginBottom: SPACING.sm,
      position: 'relative',
      alignSelf: 'center',
      borderRadius: DEFAULT_RADIUS * 2,
      overflow: 'hidden',
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
    },
    cameraHeader: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    cameraLabel: {
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      fontSize: largeText ? 16 : 14,
      flex: 1,
    },
    cameraToggle: {
      backgroundColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
      borderRadius: DEFAULT_RADIUS,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
    },
    cameraTogglePressed: {
      opacity: 0.85,
    },
    cameraToggleText: {
      color: highContrast ? COLORS.highContrastBackground : COLORS.highContrastText,
      fontSize: largeText ? 14 : 12,
      fontWeight: '600',
    },
    camera: {
      flex: 1,
    },
    detectionIndicator: {
      position: 'absolute',
      top: SPACING.sm,
      left: SPACING.sm,
      flexDirection: 'row',
      alignItems: 'center',
    },
    dot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      marginRight: SPACING.xs,
    },
    detectionText: {
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      fontSize: largeText ? 18 : 16,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.detectionTextBackground,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: DEFAULT_RADIUS,
    },
    progressBar: {
      width: '100%',
      maxWidth: previewSize,
      height: 10,
      backgroundColor: highContrast ? COLORS.borderDark : COLORS.border,
      borderRadius: DEFAULT_RADIUS,
      overflow: 'hidden',
      alignSelf: 'center',
    },
    trainingVideoWrapper: {
      width: previewSize,
      height: previewSize,
      marginBottom: SPACING.sm,
      alignSelf: 'center',
    },
    progressFill: {
      height: '100%',
      backgroundColor: COLORS.success,
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
      color: COLORS.highContrastText,
      fontSize: 14,
      fontWeight: 'bold',
    },
    secondaryButtonTextLarge: {
      fontSize: 18,
    },
    secondaryButtonTextHC: {
      color: COLORS.highContrastBackground,
    },
    helperText: {
      color: highContrast ? COLORS.highContrastText : COLORS.textSecondary,
      fontSize: largeText ? 16 : 14,
      textAlign: 'center',
    },
  });

  return (
    <View style={styles.screen}>
      <ScreenBackground
        scrollable
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
      >
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
            {count < TARGET_SAMPLES ? (
              <>
                {gestureId ? (
                  <View style={styles.selectedGestureCard}>
                    <Text style={styles.selectedGestureEmoji}>{selectedGestureEmoji}</Text>
                    <View style={styles.selectedGestureText}>
                      <Text style={styles.selectedGestureName}>{displayGestureName}</Text>
                      <Text style={styles.selectedGestureInfo}>
                        Wir sammeln {TARGET_SAMPLES} Beispiele, damit Amy diese Bewegung sicher erkennt.
                      </Text>
                    </View>
                  </View>
                ) : null}
                <View style={styles.trainingInfoCard}>
                  <Text style={styles.trainingInfoTitle}>So klappt das Gesten-Training</Text>
                  {trainingSteps.map((step, index) => (
                    <View key={`${index}-${step}`} style={styles.trainingInfoRow}>
                      <Text style={styles.trainingInfoNumber}>{index + 1}.</Text>
                      <Text style={styles.trainingInfoText}>{step}</Text>
                    </View>
                  ))}
                </View>
                {gestureId &&
                  (() => {
                    const entry = gestureModel.gestures.find((g) => g.id === gestureId);
                    const videoSource = entry?.dgsVideoUri ? { uri: entry.dgsVideoUri } : undefined;
                    return videoSource ? (
                      <View style={styles.trainingVideoWrapper}>
                        <DgsVideoPlayer videoSource={videoSource} shouldPlay={true} />
                      </View>
                    ) : null;
                  })()}
              <View style={styles.cameraHeader}>
                <Text style={styles.cameraLabel}>
                  {getCameraStatusText(facingMode)}
                </Text>
                <Pressable
                  onPress={toggleFacingMode}
                  accessibilityRole="button"
                  accessibilityLabel={CAMERA_TOGGLE_COPY.accessibilityLabel}
                  accessibilityHint={CAMERA_TOGGLE_COPY.accessibilityHint}
                  accessibilityValue={{ text: getCameraFacingText(facingMode) }}
                  style={({ pressed }) => [
                    childFriendlyStyles.minTouchTarget,
                    styles.cameraToggle,
                    pressed && styles.cameraTogglePressed,
                  ]}
                >
                  <Text style={styles.cameraToggleText}>
                    {getCameraToggleActionText(facingMode)}
                  </Text>
                </Pressable>
              </View>
              <View style={styles.cameraContainer}>
                <MediaPipeGestureDetector
                  ref={detectorRef}
                  onWebViewEvent={(telemetry) => {
                    logger.info('Training WebView telemetry:', telemetry);
                  }}
                  onFrameBatch={handleFrameBatch}
                  onLandmarks={(lm) => {
                    setLandmarks(cloneLandmarks(lm));
                    setLastDetection(Date.now());
                  }}
                  onGestureDetected={() => {
                    if (isRecordingRef.current) {
                      setLastDetection(Date.now());
                    }
                  }}
                  onError={(m) => {
                    logger.warn('TrainingScreen detector error:', m);
                    showToast({
                      message: 'Die Erkennung wurde angehalten. Bitte versuch es erneut.',
                      tone: 'warning',
                    });
                  }}
                  facingMode={facingMode}
                  onCameraStateChange={handleCameraStateChange}
                />
                {landmarks.length > 0 && (
                  <Svg
                    style={StyleSheet.absoluteFill}
                    viewBox={`0 0 ${previewSize} ${previewSize}`}
                    pointerEvents="none"
                  >
                    {landmarks.map((hand, handIdx) =>
                      hand.map((l, lmIdx) => {
                        const [x, y] = l ?? [];
                        if (typeof x !== 'number' || typeof y !== 'number') {
                          return null;
                        }
                        return (
                          <Circle
                            key={`${handIdx}-${lmIdx}`}
                            cx={x * previewSize}
                            cy={y * previewSize}
                            r={3}
                            fill={COLORS.warning}
                          />
                        );
                      }),
                    )}
                  </Svg>
                )}
                <View style={styles.detectionIndicator}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: detectionActive ? COLORS.success : COLORS.warning },
                    ]}
                  />
                  <Text style={styles.detectionText}>
                    {isRecording
                      ? detectionActive
                        ? `Aufnahme läuft … ${framesCaptured}`
                        : 'Keine Hand erkannt'
                      : detectionActive
                        ? 'Hand erkannt'
                        : 'Keine Hand'}
                  </Text>
                </View>
              </View>
              <View
                style={styles.progressBar}
                accessibilityRole="progressbar"
                accessibilityValue={{ now: count, min: 0, max: TARGET_SAMPLES }}
              >
                <View
                  style={[styles.progressFill, { width: `${(count / TARGET_SAMPLES) * 100}%` }]}
                />
              </View>
                <Pressable
                  style={({ pressed }) => [
                    childFriendlyStyles.minTouchTarget,
                    styles.button,
                    styles.primaryButton,
                    highContrast && styles.buttonHC,
                    (!gestureId || (!cameraReady && !isRecording)) && styles.buttonDisabled,
                    pressed &&
                      gestureId &&
                      (cameraReady || isRecording) &&
                      (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
                  ]}
                  onPress={() => {
                    void hapticFeedback.light();
                    if (isRecording) {
                      void stopRecording();
                    } else {
                      void startRecording();
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={primaryCtaLabel}
                  disabled={!gestureId || (!cameraReady && !isRecording)}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      largeText && styles.buttonTextLarge,
                      highContrast && styles.buttonTextHC,
                    ]}
                  >
                    {primaryCtaLabel}
                  </Text>
                </Pressable>
                {!isRecording && framesCaptured > 0 && (
                  <Text style={styles.helperText}>
                    Länge der letzten Aufnahme: {framesCaptured} Frames
                  </Text>
                )}

              </>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  childFriendlyStyles.minTouchTarget,
                  styles.secondaryButton,
                  highContrast && styles.secondaryButtonHC,
                  pressed && (highContrast ? styles.secondaryButtonPressedHC : styles.secondaryButtonPressed),
                ]}
                onPress={() => {
                  void hapticFeedback.light();
                  handleFinish();
                }}
                accessibilityRole="button"
                accessibilityLabel={
                  isPractice ? 'Übung beenden und zurück zur Übersicht' : 'Training beenden und zurück'
                }
              >
                <Text
                  style={[
                    styles.secondaryButtonText,
                    largeText && styles.secondaryButtonTextLarge,
                    highContrast && styles.secondaryButtonTextHC,
                  ]}
                >
                  {isPractice ? 'Übung beenden' : 'Training beenden'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

      </ScreenBackground>
    </View>
  );
}
