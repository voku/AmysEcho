import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, AppState, SafeAreaView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from '@react-navigation/native';
// Camera preview replaced by MediaPipe WebView detector
import Svg, { Circle } from 'react-native-svg';
import { saveTrainingSample, loadProfile, Profile, TrainingFrame } from '../storage';
import { sendDgsSample } from '../services/dgsTrainingService';
import { gestureModel } from '../model';
import { useAccessibility } from '../components/AccessibilityContext';
import { audioService } from '../services';
import { validateLandmarkSequence } from '../services/TrainingDataValidator';
  // Local landmark detection removed; relies on server fallback below.
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import BottomNav from '../components/BottomNav';
import { useMessage } from '../context/MessageContext';
import { logger } from '../utils/logger';
import { MediaPipeGestureDetector } from '../components/MediaPipeGestureDetector';
import { logHIPEvent } from '../services/hipEvents';
import DgsVideoPlayer from '../components/DgsVideoPlayer';
import { childHaptic } from '../services/feedbackService';
import { childFriendlyStyles } from '../styles/touchTargets';
import SlowMotionReplay from '../components/SlowMotionReplay';
import PerformanceAnalytics from '../components/PerformanceAnalytics';
import PracticeSessionManager from '../components/PracticeSessionManager';
import { positiveTelemetryService } from '../services/positiveTelemetryService';

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
  const [appState, setAppState] = useState(AppState.currentState);
  const [landmarks, setLandmarks] = useState<number[][][]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { setMessage } = useMessage();
  const [showSlowMotionReplay, setShowSlowMotionReplay] = useState(false);
  const [showPerformanceAnalytics, setShowPerformanceAnalytics] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<{
    averageConfidence: number;
    totalFrames: number;
    successfulFrames: number;
    sessionDuration: number;
  } | null>(null);
  const [practiceMode, setPracticeMode] = useState(false);

  useEffect(() => {
    setMessage(error);
  }, [error, setMessage]);
  const isRecordingRef = useRef(isRecording);
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // No-op: local landmark model removed.
  useEffect(() => {
    const sub = AppState.addEventListener('change', setAppState);
    return () => sub.remove();
  }, []);

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

  const startRecording = () => {
    if (!gestureId) return;
    setError(null);
    setRecordedFrames([]);
    setFramesCaptured(0);
    setLastDetection(0);
    setIsRecording(true);
    setSessionStartTime(Date.now());

    // Initialize performance tracking
    setPerformanceMetrics({
      averageConfidence: 0,
      totalFrames: 0,
      successfulFrames: 0,
      sessionDuration: 0
    });

    // HIP 2 or 4: sample start
    void logHIPEvent(isPractice ? 'HIP_4' : 'HIP_2', 'sample_start', { gestureId });
  };

  const stopRecording = async () => {
    const endTime = Date.now();
    const sessionDuration = sessionStartTime ? endTime - sessionStartTime : 0;

    setIsRecording(false);
    if (!gestureId) return;

    const validation = validateLandmarkSequence(recordedFrames.map((f) => f.landmarks));
    if (!validation.ok) {
      const msg = `Sample needs improvement: ${validation.suggestions.join(' ')}`;
      setError(msg);
      return;
    }

    try {
      await saveTrainingSample(gestureId, recordedFrames, isPractice ? 'HIP_4' : 'HIP_2');
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

      // Send each frame of the sample sequence to the server dataset for DGS
      if (recordedFrames.length > 0) {
        const sendAllFrames = async () => {
          await Promise.all(
            recordedFrames.map(async (frame) => {
              try {
                await sendDgsSample(gestureId, frame, profile?.id);
              } catch (e) {
                logger.warn('Failed to send DGS sample frame', e);
              }
            }),
          );
        };
        void sendAllFrames();
      }

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
    }
  };

  const handleFinish = () => {
    navigation.goBack();
  };

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
    button: {
      backgroundColor: COLORS.primaryAccent,
      padding: SPACING.md,
      borderRadius: RADIUS,
      alignItems: 'center',
      marginBottom: SPACING.sm,
      minWidth: 120,
    },
    buttonHC: {
      backgroundColor: COLORS.highContrastText,
    },
    buttonPressed: {
      backgroundColor: COLORS.pressed,
    },
    buttonPressedHC: {
      backgroundColor: COLORS.highContrastPressed,
    },
    buttonDisabled: {
      backgroundColor: COLORS.secondaryAccent,
      opacity: 0.6,
    },
    buttonText: {
      color: COLORS.highContrastText,
      fontSize: 16,
      fontWeight: 'bold',
    },
    buttonTextLarge: {
      fontSize: 20,
    },
    buttonTextHC: {
      color: COLORS.highContrastBackground,
    },
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
                 void childHaptic();
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
               onGestureDetected={(gesture, confidence, lm, hands) => {
                 setLandmarks(lm);
                 setLastDetection(Date.now());

                 if (isRecordingRef.current) {
                   setRecordedFrames((prev) => [...prev, { landmarks: lm, handedness: hands }]);
                   setFramesCaptured((c) => c + 1);

                   // Track performance metrics
                   if (gestureId) {
                     positiveTelemetryService.recordSuccess(
                       gestureId,
                       confidence,
                       undefined, // context
                       undefined, // emotionalState
                       Date.now() - (sessionStartTime || Date.now()) // duration
                     );
                   }
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
                void childHaptic();
                if (isRecording) {
                  stopRecording();
                } else {
                  startRecording();
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

             {/* Slow motion replay button */}
             {gestureId && recordedFrames.length > 0 && (
               <Pressable
                 style={({ pressed }) => [
                   childFriendlyStyles.minTouchTarget,
                   styles.secondaryButton,
                   highContrast && styles.secondaryButtonHC,
                   pressed && (highContrast ? styles.secondaryButtonPressedHC : styles.secondaryButtonPressed),
                 ]}
                 onPress={() => setShowSlowMotionReplay(true)}
                 accessibilityRole="button"
                 accessibilityLabel="Zeitlupe-Wiederholung anzeigen"
               >
                 <Text style={[
                   styles.secondaryButtonText,
                   largeText && styles.secondaryButtonTextLarge,
                   highContrast && styles.secondaryButtonTextHC,
                 ]}>
                   🎥 Zeitlupe anzeigen
                 </Text>
               </Pressable>
             )}
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
              void childHaptic();
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

       {/* Slow Motion Replay Overlay */}
       {showSlowMotionReplay && gestureId && (
         <View style={styles.overlay}>
           <SlowMotionReplay
             gestureId={gestureId}
             videoUri={gestureModel.gestures.find(g => g.id === gestureId)?.dgsVideoUri || ''}
             isVisible={showSlowMotionReplay}
             onClose={() => setShowSlowMotionReplay(false)}
             onReplayComplete={() => {
               setMessage('🎥 Wiederholung beendet. Versuche es selbst!');
             }}
             autoPlay={true}
             initialSpeed={0.5}
             showControls={true}
           />
         </View>
       )}

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
