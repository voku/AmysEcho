import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as FileSystem from 'expo-file-system';
// Camera preview replaced by MediaPipe WebView detector
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
// Local landmark detection removed; relies on server fallback below.
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import BottomNav from '../components/BottomNav';
import { useMessage } from '../context/MessageContext';
import { logger } from '../utils/logger';
import {
  MediaPipeGestureDetector,
  MediaPipeGestureDetectorHandle,
} from '../components/MediaPipeGestureDetector';
import { cloneLandmarks, adjustHandednessForMirror } from '../utils/landmarkUtils';
import { logHIPEvent } from '../services/hipEvents';
import DgsVideoPlayer from '../components/DgsVideoPlayer';

import { createButtonStyles } from '../styles/buttonStyles';
import { hapticFeedback } from '../utils/hapticUtils';
import { childFriendlyStyles } from '../styles/touchTargets';
import type { ClipReadyPayload, FrameBatchPayload } from '../types/frames';
import ScreenBackground from '../components/ScreenBackground';
import { AmyLoopTimeline } from '../components/AmyLoopTimeline';
import type { WorkflowRouteName } from '../constants/workflow';

const CLIP_RECORDING_ERROR_TEXT = 'Videoclip konnte nicht gespeichert werden. Versuch es nochmal!';

type ExpoFileSystemCompat = typeof FileSystem & {
  cacheDirectory?: string;
  documentDirectory?: string;
  EncodingType?: { Base64: string };
};

const expoFs = FileSystem as ExpoFileSystemCompat;

export default function TrainingScreen({ navigation, route }: any) {
  const { largeText, highContrast } = useAccessibility();
  const PREVIEW_SIZE = 200;
  const { gestureLabel, isPractice, targetSamples } = route.params || {};
  const TARGET_SAMPLES = isPractice ? (typeof targetSamples === 'number' ? targetSamples : 5) : 5;
  // No camera ref needed; WebView handles its own camera
  const [gestureId, setGestureId] = useState<string | null>(gestureLabel || null);
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

  // No-op: local landmark model removed.

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    loadProfile()
      .then(setProfile)
      .catch((e) => {
        logger.error('Failed to load profile', e);
        setError('Profil konnte nicht geladen werden.');
      });
  }, []);

  const detectionActive = now - lastDetection < 1000;

  const trainingLoopStage = useMemo<WorkflowRouteName>(() => {
    if (error) {
      return 'Recognition';
    }
    if (!gestureId) {
      return 'Lernen';
    }
    if (isRecording) {
      return 'Recognition';
    }
    if (framesCaptured > 0 && !isRecording) {
      return 'History';
    }
    if (count > 0) {
      return 'Lernen';
    }
    return 'Recognition';
  }, [count, error, framesCaptured, gestureId, isRecording]);

  // Local frame processor removed; remote fallback below now drives landmark updates.

  // Detection is handled by the MediaPipe WebView detector, which also falls back to server.

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
    setFacingMode((current) => (current === 'user' ? 'environment' : 'user'));
    setLandmarks([]);
    setLastDetection(0);
  }, []);

  const startRecording = useCallback(async () => {
    if (!gestureId) return;
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

    // HIP 2 or 4: sample start
    void logHIPEvent(isPractice ? 'HIP_4' : 'HIP_2', 'sample_start', { gestureId });
  }, [
    cleanupClipFile,
    gestureId,
    isPractice,
  ]);

  const stopRecording = useCallback(async () => {
    setIsRecording(false);
    if (!gestureId) return;

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
    }
  }, [
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

  const subtitleText = gestureId
    ? isPractice
      ? 'Übe die Geste in deinem Tempo und beobachte die Fortschrittsanzeige.'
      : `Nimm ${TARGET_SAMPLES} klare Beispiele auf, damit Amy zuverlässiger reagiert.`
    : 'Wähle eine Geste, um das Training zu starten.';
  const panelBackground = highContrast ? COLORS.highContrastBackground : 'rgba(255, 255, 255, 0.92)';
  const panelBorderColor = highContrast ? COLORS.highContrastText : 'rgba(255, 255, 255, 0.45)';

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
      justifyContent: 'center',
      paddingBottom: SPACING.lg,
    },
    loopWrapper: {
      width: '100%',
      marginBottom: SPACING.lg,
      alignItems: 'center',
    },
    content: {
      width: '100%',
      maxWidth: 520,
      alignItems: 'stretch',
      gap: SPACING.lg,
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
    cameraContainer: {
      width: PREVIEW_SIZE,
      height: PREVIEW_SIZE,
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
      backgroundColor: highContrast ? COLORS.highContrastBackground : 'rgba(255, 255, 255, 0.82)',
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: DEFAULT_RADIUS,
    },
    progressBar: {
      width: '100%',
      maxWidth: PREVIEW_SIZE,
      height: 10,
      backgroundColor: highContrast ? COLORS.borderDark : COLORS.border,
      borderRadius: DEFAULT_RADIUS,
      overflow: 'hidden',
      alignSelf: 'center',
    },
    progressFill: {
      height: '100%',
      backgroundColor: COLORS.success,
    },
    summaryContainer: {
      width: '100%',
      alignItems: 'center',
      gap: SPACING.md,
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

  // Camera permission handled by WebView context.

  return (
    <View style={styles.screen}>
      <ScreenBackground
        scrollable
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.loopWrapper}>
          <AmyLoopTimeline activeStage={trainingLoopStage} />
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
            gestureModel.gestures.map((g: { id: string; label: string }) => (
              <Pressable
                key={g.id}
                style={({ pressed }) => [
                  childFriendlyStyles.minTouchTarget,
                  styles.button,
                  styles.primaryButton,
                  highContrast && styles.buttonHC,
                  pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
                ]}
                onPress={() => {
                  void hapticFeedback.light();
                  setGestureId(g.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Trainiere Geste ${g.label}`}
              >
                <Text
                  style={[
                    styles.buttonText,
                    largeText && styles.buttonTextLarge,
                    highContrast && styles.buttonTextHC,
                  ]}
                >
                  {g.label}
                </Text>
              </Pressable>
            ))
          ) : count < TARGET_SAMPLES ? (
            <>
              {/* Optional DGS demo video if available */}
              {gestureId &&
                (() => {
                  const entry = gestureModel.gestures.find((g) => g.id === gestureId);
                  const videoSource = entry?.dgsVideoUri ? { uri: entry.dgsVideoUri } : undefined;
                  return videoSource ? (
                    <View
                      style={{
                        width: PREVIEW_SIZE,
                        height: PREVIEW_SIZE,
                        marginBottom: SPACING.sm,
                      }}
                    >
                      <DgsVideoPlayer videoSource={videoSource} shouldPlay={true} />
                    </View>
                  ) : null;
                })()}
              <View style={styles.cameraHeader}>
                <Text style={styles.cameraLabel}>
                  {`Aktive Kamera: ${facingMode === 'user' ? 'Vorderseite' : 'Rückseite'}`}
                </Text>
                <Pressable
                  onPress={toggleFacingMode}
                  accessibilityRole="button"
                  accessibilityLabel="Kamera wechseln"
                  accessibilityHint="Zwischen Vorder- und Rückkamera umschalten"
                  style={({ pressed }) => [
                    childFriendlyStyles.minTouchTarget,
                    styles.cameraToggle,
                    pressed && styles.cameraTogglePressed,
                  ]}
                >
                  <Text style={styles.cameraToggleText}>
                    {facingMode === 'user' ? 'Zur Rückkamera' : 'Zur Frontkamera'}
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
                />
                {landmarks.length > 0 && (
                  <Svg
                    style={StyleSheet.absoluteFill}
                    viewBox={`0 0 ${PREVIEW_SIZE} ${PREVIEW_SIZE}`}
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
                            cx={x * PREVIEW_SIZE}
                            cy={y * PREVIEW_SIZE}
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
                  !gestureId && styles.buttonDisabled,
                  pressed &&
                    gestureId &&
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
                accessibilityLabel={
                  isRecording
                    ? 'Gestenaufnahme stoppen'
                    : `Beispiel ${count + 1} / ${TARGET_SAMPLES} aufnehmen`
                }
                disabled={!gestureId}
              >
                <Text
                  style={[
                    styles.buttonText,
                    largeText && styles.buttonTextLarge,
                    highContrast && styles.buttonTextHC,
                  ]}
                >
                  {isRecording
                    ? 'Aufnahme stoppen'
                    : `Beispiel ${count + 1} / ${TARGET_SAMPLES} aufnehmen`}
                </Text>
              </Pressable>
              {!isRecording && framesCaptured > 0 && (
                <Text style={styles.helperText}>
                  Länge der letzten Aufnahme: {framesCaptured} Frames
                </Text>
              )}
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
            </>
          ) : (
            <View style={styles.summaryContainer}>
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
