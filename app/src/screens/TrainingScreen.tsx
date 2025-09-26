import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import * as FileSystem from 'expo-file-system';
// Camera preview replaced by MediaPipe WebView detector
import Svg, { Circle } from 'react-native-svg';
import { saveTrainingSample, loadProfile, Profile, TrainingFrame, createTrainingSample } from '../storage';
import { gestureModel } from '../model';
import { useAccessibility } from '../components/AccessibilityContext';
import { audioService } from '../services';
import { validateLandmarkSequence } from '../services/TrainingDataValidator';
  // Local landmark detection removed; relies on server fallback below.
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import BottomNav from '../components/BottomNav';
import { useMessage } from '../context/MessageContext';
import { logger } from '../utils/logger';
import { MediaPipeGestureDetector, MediaPipeGestureDetectorHandle } from '../components/MediaPipeGestureDetector';
import { cloneLandmarks, adjustHandednessForMirror } from '../utils/landmarkUtils';
import { logHIPEvent } from '../services/hipEvents';
import DgsVideoPlayer from '../components/DgsVideoPlayer';

import { createButtonStyles } from '../styles/buttonStyles';
import { hapticFeedback } from '../utils/hapticUtils';
import { childFriendlyStyles } from '../styles/touchTargets';
import PerformanceAnalytics from '../components/PerformanceAnalytics';
import PracticeSessionManager from '../components/PracticeSessionManager';
import { positiveTelemetryService } from '../services/positiveTelemetryService';
import type { ClipReadyPayload, FrameBatchPayload } from '../types/frames';

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
  const { setMessage } = useMessage();
  const [showPerformanceAnalytics, setShowPerformanceAnalytics] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<{
    averageConfidence: number;
    totalFrames: number;
    successfulFrames: number;
    sessionDuration: number;
  } | null>(null);
  const [practiceMode, setPracticeMode] = useState(false);
  // Keep the facing mode in one place so overlays and recordings stay aligned if we add a toggle.
  const facingMode: 'user' | 'environment' = 'user';
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
    setMessage(error);
  }, [error, setMessage]);
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
        setError('Failed to load profile');
      });
  }, []);

  const detectionActive = now - lastDetection < 1000;

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
      const handednessBatches = Array.isArray(payload.handednesses)
        ? payload.handednesses
        : [];

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
      setLandmarks(cloneLandmarks(lastFrame.landmarks));
      setLastDetection(Date.now());

      setRecordedFrames((prev) => {
        const combined = [...prev, ...framesToAppend];
        const MAX_BUFFERED_FRAMES = 240;
        return combined.length > MAX_BUFFERED_FRAMES ? combined.slice(-MAX_BUFFERED_FRAMES) : combined;
      });
      setFramesCaptured((count) => count + framesToAppend.length);
    },
    [facingMode],
  );

  const startRecording = useCallback(async () => {
    if (!gestureId) return;
    setError(null);
    setRecordedFrames([]);
    setFramesCaptured(0);
    setLastDetection(0);
    await cleanupClipFile();
    setIsRecording(true);
    setSessionStartTime(Date.now());

    try {
      clipRequestIdRef.current = detectorRef.current
        ? await detectorRef.current.startClipCapture()
        : null;
    } catch (error) {
      clipRequestIdRef.current = null;
      logger.warn('Failed to start clip capture', error);
    }

    // Initialize performance tracking
    setPerformanceMetrics({
      averageConfidence: 0,
      totalFrames: 0,
      successfulFrames: 0,
      sessionDuration: 0,
    });

    // HIP 2 or 4: sample start
    void logHIPEvent(isPractice ? 'HIP_4' : 'HIP_2', 'sample_start', { gestureId });
  }, [cleanupClipFile, gestureId, isPractice]);

  const stopRecording = useCallback(async () => {
    const endTime = Date.now();
    const sessionDuration = sessionStartTime ? endTime - sessionStartTime : 0;

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
        setMessage(CLIP_RECORDING_ERROR_TEXT);
      } finally {
        clipRequestIdRef.current = null;
      }
    } else {
      detectorRef.current?.cancelClipCapture();
      clipRequestIdRef.current = null;
    }

    if (!clipUri) {
      setMessage(CLIP_RECORDING_ERROR_TEXT);
      return;
    }

    const validation = validateLandmarkSequence(recordedFrames.map((f) => f.landmarks));
    if (!validation.ok) {
      const msg = `Sample needs improvement: ${validation.suggestions.join(' ')}`;
      setError(msg);
      return;
    }

    try {
      const capturedAt = sessionStartTime ? new Date(sessionStartTime).toISOString() : new Date().toISOString();
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

      // Calculate performance metrics
      const totalFrames = recordedFrames.length;
      const successfulFrames = recordedFrames.filter(f => f.landmarks && f.landmarks.length > 0).length;
      const averageConfidence = totalFrames > 0 ? successfulFrames / totalFrames : 0;

      setPerformanceMetrics({
        averageConfidence,
        totalFrames,
        successfulFrames,
        sessionDuration
      });

      // HIP 2 or 4: sample saved
      void logHIPEvent(isPractice ? 'HIP_4' : 'HIP_2', 'sample_saved', {
        gestureId,
        frames: framesCaptured,
        performance: { averageConfidence, totalFrames, successfulFrames, sessionDuration }
      });

      if (isPractice) {
        await audioService.playEncouragement(gestureId);
      }

      // Show performance analytics after successful recording
      if (practiceMode) {
        setTimeout(() => setShowPerformanceAnalytics(true), 1000);
      }
    } catch (e) {
      logger.error('Failed to save training sample', e);
      // Amy First: Show encouraging message instead of technical error
      setError(null); // Don't show technical errors
      setMessage('Das hat nicht geklappt. Lass es uns nochmal versuchen!');
      // Log for caregiver analytics
      void logHIPEvent(isPractice ? 'HIP_4' : 'HIP_2', 'training_save_failed', {
        error: String(e).substring(0, 100),
        gestureId,
        framesCaptured
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
    sessionStartTime,
    setMessage,
  ]);

  const handleFinish = () => {
    navigation.goBack();
  };

  const buttonStyles = createButtonStyles();
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.backgroundStart,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      fontSize: largeText ? 24 : 20,
      marginBottom: SPACING.lg,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    cameraContainer: {
      width: PREVIEW_SIZE,
      height: PREVIEW_SIZE,
      marginBottom: SPACING.sm,
      position: 'relative',
    },
    camera: {
      flex: 1,
    },
    detectionIndicator: {
      position: 'absolute',
      top: SPACING.xs,
      left: SPACING.xs,
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
    },
    progressBar: {
      width: PREVIEW_SIZE,
      height: 10,
      backgroundColor: highContrast ? COLORS.borderDark : COLORS.border,
      borderRadius: RADIUS,
      overflow: 'hidden',
      marginBottom: SPACING.sm,
    },
    progressFill: {
      height: '100%',
      backgroundColor: COLORS.success,
    },
    ...buttonStyles,
    // Enhanced training styles
    practiceModeContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SPACING.sm,
      padding: SPACING.sm,
      backgroundColor: highContrast ? COLORS.surface : COLORS.backgroundEnd,
      borderRadius: RADIUS,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    practiceModeLabel: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      flex: 1,
    },
    practiceModeToggle: {
      width: 40,
      height: 40,
      borderRadius: RADIUS,
      backgroundColor: highContrast ? COLORS.surface : COLORS.backgroundEnd,
      borderWidth: 2,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    practiceModeToggleActive: {
      backgroundColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    practiceModeTogglePressed: {
      opacity: 0.7,
    },
    practiceModeToggleText: {
      fontSize: 18,
    },
    secondaryButton: {
      backgroundColor: COLORS.secondaryAccent,
      padding: SPACING.sm,
      borderRadius: RADIUS,
      alignItems: 'center',
      marginTop: SPACING.sm,
      minWidth: 100,
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
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.md,
      zIndex: 1000,
    },
  });

  // Camera permission handled by WebView context.

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>
          {isPractice
            ? gestureId
              ? `Practice ${gestureId}`
              : 'Practice Mode'
            : `Training ${gestureId ? `for ${gestureId}` : 'Mode'}`}
        </Text>
        {!gestureId ? (
            gestureModel.gestures.map((g: { id: string; label: string }) => (
             <Pressable
               key={g.id}
               style={({ pressed }) => [
            {
              minWidth: 60,
              minHeight: 60,
              padding: SPACING.md,
              alignItems: 'center',
              justifyContent: 'center',
            },
                 styles.button,
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
               <Text style={[
                 styles.buttonText,
                 largeText && styles.buttonTextLarge,
                 highContrast && styles.buttonTextHC,
               ]}>
                 {g.label}
               </Text>
             </Pressable>
           ))
        ) : count < TARGET_SAMPLES ? (
          <>
          {/* Optional DGS demo video if available */}
          {gestureId && (() => {
            const entry = gestureModel.gestures.find(g => g.id === gestureId);
            const videoSource = entry?.dgsVideoUri ? { uri: entry.dgsVideoUri } : undefined;
            return videoSource ? (
              <View style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, marginBottom: SPACING.sm }}>
                <DgsVideoPlayer videoSource={videoSource} shouldPlay={true} />
              </View>
            ) : null;
          })()}
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
                onGestureDetected={(gesture, confidence) => {
                  if (isRecordingRef.current && gestureId) {
                    positiveTelemetryService.recordSuccess(
                      gestureId,
                      confidence,
                      undefined, // context
                      undefined, // emotionalState
                      Date.now() - (sessionStartTime || Date.now()), // duration
                    );
                  }

                  // Enhanced feedback for practice mode
                  if (practiceMode && gesture && confidence > 0.5) {
                    // Provide real-time feedback during practice
                    if (confidence > 0.8) {
                      setMessage('🎉 Perfekt! Das sieht sehr gut aus!');
                    } else if (confidence > 0.6) {
                      setMessage('👍 Gut gemacht! Fast richtig.');
                    }
                  }
                }}
                onError={(m) => {
                  logger.warn('TrainingScreen detector error:', m);
                  // Amy First: Show encouraging message instead of technical error
                  setMessage('Das hat nicht geklappt. Lass es uns nochmal versuchen!');
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
                    hand.map((l, lmIdx) => (
                      <Circle
                        key={`${handIdx}-${lmIdx}`}
                        cx={l[0] * PREVIEW_SIZE}
                        cy={l[1] * PREVIEW_SIZE}
                        r={3}
                        fill={COLORS.warning}
                      />
                    ))
                  )}
                </Svg>
              )}
              <View style={styles.detectionIndicator}>
                <View style={[styles.dot, { backgroundColor: detectionActive ? COLORS.success : COLORS.warning }]} />
                <Text style={styles.detectionText}>
                  {isRecording
                    ? detectionActive
                      ? `Recording... ${framesCaptured}`
                      : 'No hand detected'
                    : detectionActive
                    ? 'Hand detected'
                    : 'No hand'}
                </Text>
              </View>
            </View>
            <View
              style={styles.progressBar}
              accessibilityRole="progressbar"
              accessibilityValue={{ now: count, min: 0, max: TARGET_SAMPLES }}
            >
              <View
                style={[
                  styles.progressFill,
                  { width: `${(count / TARGET_SAMPLES) * 100}%` },
                ]}
              />
            </View>
            <Pressable
              style={({ pressed }) => [
                childFriendlyStyles.minTouchTarget,
                styles.button,
                highContrast && styles.buttonHC,
                !gestureId && styles.buttonDisabled,
                pressed && gestureId && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
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
              accessibilityLabel="Gestenaufnahme starten"
              disabled={!gestureId}
            >
              <Text style={[
                styles.buttonText,
                largeText && styles.buttonTextLarge,
                highContrast && styles.buttonTextHC,
              ]}>
                {isRecording ? 'Stop Recording' : `Record Sample ${count + 1} / ${TARGET_SAMPLES}`}
              </Text>
            </Pressable>
             {!isRecording && framesCaptured > 0 && (
               <Text style={styles.detectionText}>
                 Last recording length: {framesCaptured} frames
               </Text>
             )}

             {/* Practice mode toggle */}
             <View style={styles.practiceModeContainer}>
               <Text style={styles.practiceModeLabel}>
                 Übungsmodus: {practiceMode ? 'Aktiviert' : 'Deaktiviert'}
               </Text>
               <Pressable
                 style={({ pressed }) => [
                   styles.practiceModeToggle,
                   practiceMode && styles.practiceModeToggleActive,
                   pressed && styles.practiceModeTogglePressed,
                 ]}
                 onPress={() => setPracticeMode(!practiceMode)}
                 accessibilityRole="button"
                 accessibilityLabel="Übungsmodus umschalten"
               >
                 <Text style={styles.practiceModeToggleText}>
                   {practiceMode ? '🎯' : '📝'}
                 </Text>
               </Pressable>
             </View>

           </>
         ) : (
          <Pressable
            style={({ pressed }) => [
              childFriendlyStyles.minTouchTarget,
              styles.button,
              highContrast && styles.buttonHC,
              pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
            ]}
             onPress={async () => {
               void hapticFeedback.light();
               if (isPractice && gestureId) {
                 try { await audioService.playCelebrationFeedback(); } catch {}
                 try { await logHIPEvent('HIP_4', 'practice_completed', { gestureId, samples: TARGET_SAMPLES }); } catch {}
               }
               handleFinish();
             }}
            accessibilityRole="button"
            accessibilityLabel={isPractice ? 'Übung beenden' : 'Trainingsdaten speichern'}
          >
            <Text style={[
              styles.buttonText,
              largeText && styles.buttonTextLarge,
              highContrast && styles.buttonTextHC,
            ]}>
              {isPractice ? 'Übung beenden' : 'Trainingsdaten speichern'}
            </Text>
          </Pressable>
        )}
       </View>

       {/* Performance Analytics Overlay */}
       {showPerformanceAnalytics && performanceMetrics && gestureId && (
         <View style={styles.overlay}>
           <PerformanceAnalytics
             gestureId={gestureId}
             metrics={performanceMetrics}
             onClose={() => setShowPerformanceAnalytics(false)}
             onRetry={() => {
               setShowPerformanceAnalytics(false);
               setCount(0);
               setIsRecording(false);
               setRecordedFrames([]);
               setFramesCaptured(0);
             }}
           />
         </View>
       )}

       {/* Practice Session Manager */}
       {practiceMode && gestureId && (
         <PracticeSessionManager
           gestureId={gestureId}
           currentProgress={count}
           targetSamples={TARGET_SAMPLES}
           onSessionComplete={() => {
             setMessage('🎉 Übungssession abgeschlossen! Gut gemacht!');
           }}
         />
       )}

       {profile && <BottomNav active="training" profileId={profile.id} />}
     </SafeAreaView>
   );
 }
