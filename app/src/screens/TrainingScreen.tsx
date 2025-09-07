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
    // HIP 2 or 4: sample start
    void logHIPEvent(isPractice ? 'HIP_4' : 'HIP_2', 'sample_start', { gestureId });
  };

  const stopRecording = async () => {
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
      // HIP 2 or 4: sample saved
      void logHIPEvent(isPractice ? 'HIP_4' : 'HIP_2', 'sample_saved', { gestureId, frames: framesCaptured });
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
              onGestureDetected={(_g, _c, lm, hands) => {
                setLandmarks(lm);
                setLastDetection(Date.now());
                if (isRecordingRef.current) {
                  setRecordedFrames((prev) => [...prev, { landmarks: lm, handedness: hands }]);
                  setFramesCaptured((c) => c + 1);
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
      {profile && <BottomNav active="training" profileId={profile.id} />}
    </SafeAreaView>
  );
}
