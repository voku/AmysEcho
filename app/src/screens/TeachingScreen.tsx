import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, TextInput, Animated, Easing, Button } from 'react-native';
import * as FileSystem from 'expo-file-system';
// Camera handled inside WebView detector
// mlService teaching sessions removed during WebView migration
import { audioService } from '../services/audioService';
import { adaptiveLearningService } from '../services/adaptiveLearningService';
import {
  saveTrainingSample,
  loadProfile,
  Profile,
  loadTrainingSampleCount,
  saveCustomGesture,
  createTrainingSample,
} from '../storage';
import { captureSamples } from '../services/gestureRecorder';
import { addGesture } from '../model';
import {
  MediaPipeGestureDetector,
  MediaPipeGestureDetectorHandle,
} from '../components/MediaPipeGestureDetector';
import BottomNav from '../components/BottomNav';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import { useMessage } from '../context/MessageContext';
import { logger } from '../utils/logger';
import {
  ClipCaptureError,
  DEFAULT_CLIP_CAPTURE_ERROR_MESSAGE,
  getClipCaptureErrorMessage,
  persistClipToDirectory,
  type ExpoFileSystemCompat,
} from '../utils/clipPersistence';
import { syncTrainingData } from '../services';
import { registerCustomGesture } from '../services/customGestureRegistry';
import { normalizeGestureLabel } from '../utils/stringUtils';

import { childFriendlyStyles } from '../styles/touchTargets';
import { createButtonStyles } from '../styles/buttonStyles';
import { hapticFeedback } from '../utils/hapticUtils';
import GestureMeaningSelector from '../components/GestureMeaningSelector';
import { GestureMeaningDefinition, parseCoordinatedGestureString } from '../constants/gestureMeanings';
import { gestureMeaningService } from '../services/gestureMeaningService';
import VisualFeedback from '../components/VisualFeedback';
import ProgressTracker from '../components/ProgressTracker';
import GestureValidationFeedback from '../components/GestureValidationFeedback';
import { cloneLandmarks, adjustHandednessForMirror } from '../utils/landmarkUtils';
import ScreenBackground from '../components/ScreenBackground';
import type { ClipReadyPayload } from '../types/frames';

const expoFs = FileSystem as ExpoFileSystemCompat;

const CLIP_RECORDING_ERROR_TEXT = DEFAULT_CLIP_CAPTURE_ERROR_MESSAGE;

const PREVIEW_SIZE = 240;

const formatGestureId = (gestureId: string): string =>
  gestureId
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

export default function TeachingScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  // No native camera refs
  const [gestureLabel, setGestureLabel] = useState('');
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [teachingMode, setTeachingMode] = useState<'custom' | 'library'>('custom');
  const [showMeaningSelector, setShowMeaningSelector] = useState(false);
  const [selectedGestureMeaning, setSelectedGestureMeaning] = useState<GestureMeaningDefinition | null>(null);
  const [sequenceProgress, setSequenceProgress] = useState<{ completed: string[]; remaining: string[] } | null>(null);

  const [showVisualFeedback, setShowVisualFeedback] = useState(false);
  const [validationFeedback, setValidationFeedback] = useState<{
    isValid: boolean;
    message: string;
    suggestions: string[];
  } | null>(null);
  // Centralize the facing mode so the detector and overlays stay in sync if this screen later
  // gains a camera toggle.
  const facingMode: 'user' | 'environment' = 'user';
  const [currentGestureQuality, setCurrentGestureQuality] = useState<{
    confidence: number;
    stability: number;
    clarity: number;
  } | null>(null);
  const sessionId = useRef<string | null>(null);
  const detectorRef = useRef<MediaPipeGestureDetectorHandle | null>(null);
  const SAMPLES_NEEDED = 5;
  const landmarksRef = useRef<number[][][]>([]);
  const handednessRef = useRef<string[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useMessage();
  const practiceSessionActiveRef = useRef(false);
  const practiceGestureRef = useRef<string | null>(null);

  const completeActivePracticeSession = useCallback(() => {
    if (!practiceSessionActiveRef.current) {
      return;
    }

    adaptiveLearningService.completePracticeSession(practiceGestureRef.current);
    practiceSessionActiveRef.current = false;
    practiceGestureRef.current = null;
  }, []);

  const normalizedGestureId = useMemo(() => {
    const trimmed = gestureLabel.trim();
    if (!trimmed) {
      return null;
    }
    return normalizeGestureLabel(trimmed);
  }, [gestureLabel]);

  useEffect(() => {
    if (!error) {
      return;
    }
    showToast({ message: error, tone: 'error' });
    setError(null);
  }, [error, showToast, setError]);
  // WebView will indicate camera issues via onError

  const sampleCaptureAnim = useRef(new Animated.Value(0)).current;

  const persistClip = useCallback(async (clip: ClipReadyPayload): Promise<string> => {
    return persistClipToDirectory({
      fs: expoFs,
      clip,
      directoryName: 'amy-teaching-clips',
      filePrefix: 'amy-teaching',
      logger,
    });
  }, []);

  useEffect(() => {
    loadProfile()
      .then(setProfile)
      .catch((e) => {
        logger.error('Failed to load profile', e);
        setError('Profil konnte nicht geladen werden.');
      });
  }, []);

  useEffect(() => {
    if (teachingMode === 'library' && selectedGestureMeaning?.composition === 'sequence') {
      setSequenceProgress({ completed: [], remaining: [...selectedGestureMeaning.gestures] });
    } else {
      setSequenceProgress(null);
    }
  }, [teachingMode, selectedGestureMeaning]);

  useEffect(() => {
    if (isSessionActive && normalizedGestureId) {
      if (!practiceSessionActiveRef.current || practiceGestureRef.current !== normalizedGestureId) {
        if (practiceSessionActiveRef.current) {
          completeActivePracticeSession();
        }
        adaptiveLearningService.startPracticeSession(normalizedGestureId);
        practiceSessionActiveRef.current = true;
        practiceGestureRef.current = normalizedGestureId;
      }
      return;
    }

    completeActivePracticeSession();
  }, [isSessionActive, normalizedGestureId, completeActivePracticeSession]);

  useEffect(() => () => {
    completeActivePracticeSession();
  }, [completeActivePracticeSession]);

  const handleGestureDetected = useCallback(
    async (
      gesture: string | null,
      confidence: number,
      lms: number[][][],
      handedness: string[],
    ) => {
      const mirrored = facingMode === 'user';
      const safeLandmarks = cloneLandmarks(lms);
      const adjustedHandedness = adjustHandednessForMirror(handedness ?? [], mirrored);

      landmarksRef.current = safeLandmarks;
      handednessRef.current = adjustedHandedness;

      if (gesture && confidence > 0.3) {
        setShowVisualFeedback(true);
        setTimeout(() => setShowVisualFeedback(false), 1000);

        setCurrentGestureQuality({
          confidence,
          stability: Math.min(1, safeLandmarks.length / 2),
          clarity: confidence > 0.7 ? 1 : confidence > 0.5 ? 0.7 : 0.4
        });

        if (teachingMode === 'library' && selectedGestureMeaning) {
          if (selectedGestureMeaning.composition === 'coordinated' && safeLandmarks.length >= 2) {
            const parsed = parseCoordinatedGestureString(gesture);
            if (parsed) {
              const result = await gestureMeaningService.processGestureMeaning(
                parsed.left,
                parsed.right,
                confidence,
                confidence,
                adjustedHandedness,
                safeLandmarks
              );

              if (result && result.gesture.id === selectedGestureMeaning.id) {
                const validationMessage = result.confidence > 0.8
                  ? `Fantastisch! ${selectedGestureMeaning.name} sitzt perfekt.`
                  : result.confidence > 0.6
                  ? `Sehr gut! Noch ein kleines Stück, dann passt es.`
                  : `Guter Anfang! Koordiniere beide Hände noch einmal.`;

                setValidationFeedback({
                  isValid: result.confidence > 0.6,
                  message: validationMessage,
                  suggestions: result.accessibilityHints.slice(0, 2),
                });

                setTimeout(() => setValidationFeedback(null), 3000);
              }
            }
          } else if (selectedGestureMeaning.composition === 'sequence') {
            const currentProgress =
              sequenceProgress ?? {
                completed: [],
                remaining: [...selectedGestureMeaning.gestures],
              };

            const expectedGesture = currentProgress.remaining[0] ?? selectedGestureMeaning.gestures[0];

            if (gesture === expectedGesture) {
              const updatedCompleted = [...currentProgress.completed, expectedGesture];
              const updatedRemaining = currentProgress.remaining.slice(1);
              setSequenceProgress({ completed: updatedCompleted, remaining: updatedRemaining });

              const sequenceFinished = updatedRemaining.length === 0;
              const nextStep = updatedRemaining[0];
              const nextStepLabel = nextStep ? formatGestureId(nextStep) : 'den nächsten Schritt';

              setValidationFeedback({
                isValid: sequenceFinished,
                message: sequenceFinished
                  ? `Wunderbar! ${selectedGestureMeaning.name} ist vollständig.`
                  : `Prima! Weiter mit ${nextStepLabel}.`,
                suggestions: sequenceFinished
                  ? []
                  : [`Als nächstes ${nextStepLabel} zeigen.`],
              });

              if (sequenceFinished) {
                setTimeout(() => setValidationFeedback(null), 3500);
              }
            } else if (gesture === selectedGestureMeaning.gestures[0]) {
              const remaining = selectedGestureMeaning.gestures.slice(1);
              setSequenceProgress({ completed: [selectedGestureMeaning.gestures[0]], remaining });

              const nextRemainingStep = remaining[0];
              if (nextRemainingStep) {
                const nextLabel = formatGestureId(nextRemainingStep);
                setValidationFeedback({
                  isValid: false,
                  message: `Toller Start! Weiter geht es mit ${nextLabel}.`,
                  suggestions: [`Als nächstes ${nextLabel} üben.`],
                });
              }
            }
          } else if (selectedGestureMeaning.composition === 'single') {
            const message = confidence > 0.8
              ? `Perfekt! ${selectedGestureMeaning.name} ist klar erkennbar.`
              : confidence > 0.6
              ? `Sehr gut! Halte die Hand noch etwas ruhiger.`
              : `Das ist ein guter Versuch. Probiere ${selectedGestureMeaning.name} gleich nochmal.`;

            setValidationFeedback({
              isValid: confidence > 0.5,
              message,
              suggestions: confidence < 0.7
                ? ['Hand etwas stabiler halten.', 'Auf die Handposition achten.']
                : [],
            });

            setTimeout(() => setValidationFeedback(null), 2500);
          }
        } else {
          const feedbackMessage = confidence > 0.8
            ? 'Ausgezeichnet! Das sieht perfekt aus!'
            : confidence > 0.6
            ? 'Sehr gut! Das wird funktionieren.'
            : 'Das ist ein guter Versuch. Übe weiter.';

          setValidationFeedback({
            isValid: confidence > 0.5,
            message: feedbackMessage,
            suggestions: confidence < 0.7 ? ['Halte die Geste etwas stabiler', 'Achte auf die Handposition'] : []
          });

          setTimeout(() => setValidationFeedback(null), 2500);
        }
      } else {
        setCurrentGestureQuality(null);
        setValidationFeedback(null);
      }
    },
    [facingMode, teachingMode, selectedGestureMeaning, sequenceProgress]
  );

  const startSampleCaptureAnimation = useCallback(() => {
    sampleCaptureAnim.setValue(0);
    Animated.sequence([
      Animated.timing(sampleCaptureAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.ease,
        useNativeDriver: true,
      }),
      Animated.timing(sampleCaptureAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.ease,
        useNativeDriver: true,
      }),
    ]).start();
  }, [sampleCaptureAnim]);

  const startSession = async () => {
    if (!gestureLabel.trim()) {
      setError('Bitte gib einen Namen für die Geste ein.');
      return;
    }
    if (!profile) {
      setError('Profil wird geladen. Bitte warte einen Moment.');
      return;
    }
    try {
      const existingCount = await loadTrainingSampleCount(gestureLabel, profile.id);
      if (existingCount >= SAMPLES_NEEDED) {
        Alert.alert('Training abgeschlossen', `Die Geste "${gestureLabel}" hat bereits genug Beispiele.`);
        return;
      }
      sessionId.current = `local-${Date.now()}`;
      setError(null);
      setIsSessionActive(true);
      setSampleCount(existingCount);
      audioService.speak(`Okay, lass uns lernen, wie man "${gestureLabel}" macht.`);
    } catch (e) {
      logger.error('Failed to start teaching session', e);
      setError('Lehr-Sitzung konnte nicht gestartet werden.');
    }
  };

  const recordSample = async () => {
    if (!sessionId.current || isRecording) {
      return;
    }
    if (!profile) {
      setError('Profil wird geladen. Bitte warte einen Moment.');
      return;
    }

    const detector = detectorRef.current;
    if (!detector) {
      setError(CLIP_RECORDING_ERROR_TEXT);
      return;
    }

    setIsRecording(true);
    setError(null);

    let clipStarted = false;
    let clipStopped = false;
    let clipUri: string | null = null;

    try {
      try {
        await detector.startClipCapture();
        clipStarted = true;
      } catch (error) {
        logger.warn('Failed to start teaching clip capture', error);
        throw new ClipCaptureError();
      }

      const frames = await captureSamples(() => ({
        landmarks: landmarksRef.current,
        handedness: handednessRef.current,
      }));

      try {
        const clipResult = await detector.stopClipCapture();
        clipStopped = true;
        clipUri = await persistClip(clipResult);
      } catch (error) {
        logger.warn('Failed to finalize teaching clip capture', error);
        throw new ClipCaptureError();
      }

      if (!clipUri) {
        throw new ClipCaptureError();
      }

      const sample = createTrainingSample({
        profileId: profile.id,
        label: gestureLabel,
        frames,
        clipUri,
      });
      await saveTrainingSample(sample);

      const nextCount = sampleCount + 1;
      setSampleCount(nextCount);
      startSampleCaptureAnimation();
      audioService.playSound('confirmation');

      if (nextCount >= SAMPLES_NEEDED) {
        endSession();
      }
    } catch (e) {
      logger.error('Recording failed', e);
      if (clipUri) {
        await expoFs.deleteAsync(clipUri, { idempotent: true }).catch(() => undefined);
        clipUri = null;
      }

      if (e instanceof ClipCaptureError) {
        setError(getClipCaptureErrorMessage(e));
      } else if (e instanceof Error && e.message) {
        setError(e.message);
      } else {
        setError('Aufnahme fehlgeschlagen');
      }
    } finally {
      if (clipStarted && !clipStopped) {
        try {
          detector.cancelClipCapture();
        } catch (cancelError) {
          logger.warn('Failed to cancel teaching clip capture', cancelError);
        }
      }
      setIsRecording(false);
    }
  };

  const endSession = async () => {
    setIsSessionActive(false);
    audioService.speak(`Super! Ich habe "${gestureLabel}" gelernt.`);
    Alert.alert('Erfolg', `Die neue Geste "${gestureLabel}" wurde mit ${SAMPLES_NEEDED} Beispielen trainiert.`);
    sessionId.current = null;
    const id = normalizeGestureLabel(gestureLabel);
    const gestureData: { id: string; label: string; profileId?: string } = {
      id,
      label: gestureLabel,
    };
    if (profile?.id) {
      gestureData.profileId = profile.id;
    }
    try {
      await saveCustomGesture(gestureData);
      addGesture({ id, label: gestureLabel });
    } catch (e) {
      logger.warn('Failed to store custom gesture', e);
    }
    try {
      const registration = await registerCustomGesture(gestureData);
      if (registration.status === 'registered') {
        showToast({
          message: `„${gestureLabel}“ wurde auf dem Server gespeichert.`,
          tone: 'success',
        });
      } else {
        showToast({
          message: 'Server-Token fehlt, Geste wird lokal gespeichert.',
          tone: 'warning',
        });
      }
    } catch (registrationError) {
      logger.warn('Failed to register custom gesture on server', registrationError);
      showToast({
        message: 'Server konnte die neue Geste noch nicht speichern.',
        tone: 'warning',
      });
    }
    setGestureLabel('');
    setSampleCount(0);
    try {
      setSyncing(true);
      setProgress(0);
      await syncTrainingData({ onProgress: (p) => setProgress(p) });
      Alert.alert('Training', 'Modellaktualisierung abgeschlossen.');
    } catch (e) {
      logger.warn('Failed to sync training data', e);
      Alert.alert('Training', 'Modellaktualisierung möglicherweise fehlgeschlagen. Es wird später erneut versucht.');
    } finally {
      setSyncing(false);
      setProgress(0);
    }
  };

  const handleRetry = () => {
    setSampleCount(0);
    setIsSessionActive(true);
    audioService.speak(`Versuchen wir "${gestureLabel}" noch einmal.`);
  };

  const handleGestureMeaningSelected = (meaning: GestureMeaningDefinition) => {
    setSelectedGestureMeaning(meaning);
    setGestureLabel(meaning.name);
    setShowMeaningSelector(false);
    setTeachingMode('library');
    audioService.speak(`Okay, lass uns "${meaning.name}" gemeinsam üben.`);
  };

  const handleTeachingModeToggle = () => {
    if (teachingMode === 'library') {
      setTeachingMode('custom');
      setSelectedGestureMeaning(null);
      setGestureLabel('');
    } else {
      setTeachingMode('library');
      setShowMeaningSelector(true);
    }
  };

  const buttonStyles = createButtonStyles();
  const styles = createStyles(largeText, highContrast, buttonStyles);

  // Camera permissions are currently handled within the WebView-based detector.
  // Retain this block as a reference for a potential native fallback, but keep it
  // disabled to avoid unused variables and type errors.
  // if (!hasPermission) {
  //   const gradientColors = highContrast
  //     ? ([COLORS.highContrastBackground, COLORS.highContrastBackground] as const)
  //     : ([COLORS.backgroundStart, COLORS.backgroundEnd] as const);
  //   return (
  //     <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
  //       <SafeAreaView style={styles.container}>
  //         <Text style={styles.title}>Teach New Gesture</Text>
  //         <Button
  //           title="Grant Camera Permission"
  //           onPress={requestPermission}
  //           accessibilityLabel="Kameraberechtigung erteilen"
  //         />
  //       </SafeAreaView>
  //     </LinearGradient>
  //   );
  // }

  return (
    <>
      <ScreenBackground>
        <View style={styles.container}>
      <Text style={styles.title}>Neue Geste beibringen</Text>
      {!isSessionActive ? (
        <View style={styles.inputContainer}>
          <View style={styles.modeToggleContainer}>
            <Text style={styles.modeToggleLabel}>
              {teachingMode === 'library' ? '📚 Bibliotheksbedeutung' : '✋ Eigene neue Geste'}
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.modeToggle,
                teachingMode === 'library' && styles.modeToggleActive,
                pressed && styles.modeTogglePressed,
              ]}
              onPress={handleTeachingModeToggle}
              accessibilityRole="button"
              accessibilityLabel={
                teachingMode === 'library'
                  ? 'Zu eigenen Gesten wechseln'
                  : 'Eine Bedeutung aus der Bibliothek auswählen'
              }
            >
              <Text style={styles.modeToggleText}>
                {teachingMode === 'library' ? '📚' : '✋'}
              </Text>
            </Pressable>
          </View>

          {teachingMode === 'library' ? (
            selectedGestureMeaning ? (
              <View style={styles.selectedGestureContainer}>
                <Text style={styles.selectedGestureEmoji}>{selectedGestureMeaning.emoji}</Text>
                <Text style={styles.selectedGestureName}>{selectedGestureMeaning.name}</Text>
                <Text style={styles.selectedGestureDescription}>{selectedGestureMeaning.description}</Text>
                {selectedGestureMeaning.composition === 'coordinated' && (
                  <Text style={styles.selectedGestureMeta}>
                    Linke Hand: {selectedGestureMeaning.leftGesture} • Rechte Hand: {selectedGestureMeaning.rightGesture}
                  </Text>
                )}
                {selectedGestureMeaning.composition === 'sequence' && (
                  <Text style={styles.selectedGestureMeta}>
                    Schritte: {selectedGestureMeaning.gestures.map(formatGestureId).join(' → ')}
                  </Text>
                )}
                <Pressable
                  style={({ pressed }) => [
                    childFriendlyStyles.minTouchTarget,
                    styles.secondaryButton,
                    pressed && styles.secondaryButtonPressed,
                  ]}
                  onPress={() => setShowMeaningSelector(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Andere Bedeutung auswählen"
                >
                  <Text style={[styles.secondaryButtonText, largeText && styles.buttonTextLarge]}>
                    Bedeutung wechseln
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    childFriendlyStyles.minTouchTarget,
                    styles.button,
                    highContrast && styles.buttonHC,
                    pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
                  ]}
                  onPress={() => {
                    void hapticFeedback.light();
                    startSession();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Training für die gewählte Bedeutung starten"
                >
                  <Text
                    style={[
                      styles.buttonText,
                      largeText && styles.buttonTextLarge,
                      highContrast && styles.buttonTextHC,
                    ]}
                  >
                    Training starten
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  childFriendlyStyles.minTouchTarget,
                  styles.button,
                  highContrast && styles.buttonHC,
                  pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
                ]}
                onPress={() => setShowMeaningSelector(true)}
                accessibilityRole="button"
                accessibilityLabel="Bedeutung auswählen"
              >
                <Text
                  style={[
                    styles.buttonText,
                    largeText && styles.buttonTextLarge,
                    highContrast && styles.buttonTextHC,
                  ]}
                >
                  📚 Bedeutung auswählen
                </Text>
              </Pressable>
            )
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Name der neuen Geste"
                value={gestureLabel}
                onChangeText={setGestureLabel}
                accessibilityLabel="Name der neuen Geste"
              />
              <Pressable
                style={({ pressed }) => [
                  childFriendlyStyles.minTouchTarget,
                  styles.button,
                  highContrast && styles.buttonHC,
                  pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
                ]}
                onPress={() => {
                  void hapticFeedback.light();
                  startSession();
                }}
                accessibilityRole="button"
                accessibilityLabel="Training starten"
              >
                <Text
                  style={[
                    styles.buttonText,
                    largeText && styles.buttonTextLarge,
                    highContrast && styles.buttonTextHC,
                  ]}
                >
                  Training starten
                </Text>
              </Pressable>
            </>
          )}
        </View>
      ) : (
         <View style={styles.recordingContainer}>
           <View style={styles.camera}>
              <MediaPipeGestureDetector
                ref={detectorRef}
                onGestureDetected={handleGestureDetected}
                onError={(message, _details) => {
                  setError(message);
                }}
                onWebViewEvent={(telemetry) => {
                  console.log('Teaching WebView telemetry:', telemetry);
                }}
                facingMode={facingMode}
              />

             {/* Visual feedback overlay */}
             <VisualFeedback
               isActive={showVisualFeedback}
               type="success"
               message="Geste erkannt!"
             />
           </View>

           <Animated.View
             pointerEvents="none"
             style={[
               styles.sampleIndicator,
               {
                 opacity: sampleCaptureAnim,
                 transform: [
                   {
                     scale: sampleCaptureAnim.interpolate({
                       inputRange: [0, 1],
                       outputRange: [0.8, 1.2],
                     }),
                   },
                 ],
               },
             ]}
           >
             <Text style={styles.sampleIndicatorText}>Beispiel erfasst!</Text>
           </Animated.View>

           {/* Enhanced progress tracker */}
           <ProgressTracker
             current={sampleCount}
             total={SAMPLES_NEEDED}
             label="Trainingsbeispiele"
             showPercentage={true}
           />

           <Text style={styles.prompt}>
             {teachingMode === 'library' && selectedGestureMeaning
               ? selectedGestureMeaning.composition === 'sequence'
                 ? `Sequenz üben: ${selectedGestureMeaning.name}`
                 : `Zeige: ${selectedGestureMeaning.name}`
               : `Zeige die Geste "${gestureLabel}"`
             }
           </Text>

           {teachingMode === 'library' &&
            selectedGestureMeaning?.composition === 'sequence' &&
            sequenceProgress && (
              <View style={styles.sequenceProgressContainer}>
                <Text style={styles.sequenceProgressTitle}>Schritte:</Text>
                <Text style={styles.sequenceProgressText}>
                  {sequenceProgress.completed.length > 0
                    ? sequenceProgress.completed.map(formatGestureId).join(' → ')
                    : 'Noch kein Schritt'}
                  {sequenceProgress.remaining[0]
                    ? ` → (${formatGestureId(sequenceProgress.remaining[0])} als nächstes)`
                    : ''}
                </Text>
              </View>
           )}

           {/* Gesture quality indicators */}
           {currentGestureQuality && (
             <View style={styles.qualityContainer}>
               <Text style={styles.qualityLabel}>Qualität:</Text>
               <View style={styles.qualityBars}>
                 <View style={styles.qualityBar}>
                   <Text style={styles.qualityBarLabel}>Sicherheit</Text>
                   <View style={styles.qualityBarBackground}>
                     <View
                       style={[
                         styles.qualityBarFill,
                         { width: `${currentGestureQuality.confidence * 100}%` }
                       ]}
                     />
                   </View>
                 </View>
                 <View style={styles.qualityBar}>
                   <Text style={styles.qualityBarLabel}>Stabilität</Text>
                   <View style={styles.qualityBarBackground}>
                     <View
                       style={[
                         styles.qualityBarFill,
                         { width: `${currentGestureQuality.stability * 100}%` }
                       ]}
                     />
                   </View>
                 </View>
                 <View style={styles.qualityBar}>
                   <Text style={styles.qualityBarLabel}>Klarheit</Text>
                   <View style={styles.qualityBarBackground}>
                     <View
                       style={[
                         styles.qualityBarFill,
                         { width: `${currentGestureQuality.clarity * 100}%` }
                       ]}
                     />
                   </View>
                 </View>
               </View>
             </View>
           )}

           {/* Validation feedback */}
           {validationFeedback && (
             <GestureValidationFeedback
               isValid={validationFeedback.isValid}
               message={validationFeedback.message}
               suggestions={validationFeedback.suggestions}
             />
           )}
          <Pressable
            style={({ pressed }) => [
              childFriendlyStyles.minTouchTarget,
              styles.button,
              highContrast && styles.buttonHC,
              (isRecording || sampleCount >= SAMPLES_NEEDED) && styles.buttonDisabled,
              pressed && !isRecording && sampleCount < SAMPLES_NEEDED && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
            ]}
             onPress={() => {
               void hapticFeedback.light();
               recordSample();
             }}
            disabled={isRecording || sampleCount >= SAMPLES_NEEDED}
            accessibilityRole="button"
            accessibilityLabel="Beispiel aufzeichnen"
          >
            <Text style={[
              styles.buttonText,
              largeText && styles.buttonTextLarge,
              highContrast && styles.buttonTextHC,
            ]}>
              {isRecording ? 'Aufnahme...' : 'Beispiel aufnehmen'}
            </Text>
          </Pressable>
          {sampleCount > 0 && sampleCount < SAMPLES_NEEDED && (
            <Pressable
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
                 handleRetry();
               }}
              accessibilityRole="button"
              accessibilityLabel="Alle Beispiele wiederholen"
            >
              <Text style={[
                styles.buttonText,
                largeText && styles.buttonTextLarge,
                highContrast && styles.buttonTextHC,
              ]}>
                Alle Beispiele erneut aufnehmen
              </Text>
            </Pressable>
          )}
          {sampleCount >= SAMPLES_NEEDED && (
            <Button
              title="Training abschließen"
              onPress={endSession}
              accessibilityLabel="Training beenden"
            />
          )}
        </View>
      )}
      {syncing && (
        <View style={{ width: '100%', padding: SPACING.md }}>
          <Text>Modell wird trainiert… {Math.round(progress)}%</Text>
          <View style={{ height: 8, backgroundColor: COLORS.border, borderRadius: DEFAULT_RADIUS, overflow: 'hidden', marginTop: 6 }}>
            <View style={{ height: '100%', width: `${Math.max(0, Math.min(100, progress))}%`, backgroundColor: COLORS.success }} />
          </View>
        </View>
      )}
      <Button
        title="Zurück"
        onPress={() => navigation.goBack()}
        accessibilityLabel="Zurück"
      />

      {/* Gesture Meaning Selector Overlay */}
      {showMeaningSelector && (
        <View style={styles.overlay}>
          <GestureMeaningSelector
            onMeaningSelected={handleGestureMeaningSelected}
            onCancel={() => setShowMeaningSelector(false)}
            selectedMeaningId={selectedGestureMeaning?.id ?? null}
          />
        </View>
      )}
    </View>
    </ScreenBackground>
    {profile && <BottomNav active="training" profileId={profile.id} />}
  </>
);
}

const createStyles = (largeText: boolean, highContrast: boolean, buttonStyles: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      fontSize: largeText ? 28 : 24,
      marginBottom: SPACING.lg,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    inputContainer: { width: '100%' },
    input: {
      borderWidth: 1,
      padding: SPACING.sm,
      marginBottom: SPACING.md,
      backgroundColor: COLORS.surface,
      color: COLORS.text,
      borderRadius: DEFAULT_RADIUS,
    },
    recordingContainer: { alignItems: 'center', position: 'relative' },
    camera: {
      width: PREVIEW_SIZE,
      height: PREVIEW_SIZE,
      marginBottom: SPACING.sm,
      position: 'relative',
      borderRadius: DEFAULT_RADIUS,
      overflow: 'hidden',
    },
    prompt: { fontSize: largeText ? 22 : 18, marginVertical: SPACING.sm, color: highContrast ? COLORS.highContrastText : COLORS.text },
    progress: { marginBottom: SPACING.sm, color: highContrast ? COLORS.highContrastText : COLORS.text },
    sampleIndicator: {
      position: 'absolute',
      top: 100,
      backgroundColor: `${COLORS.success}B3`,
      padding: SPACING.sm,
      borderRadius: DEFAULT_RADIUS,
    },
    sampleIndicatorText: {
      color: COLORS.highContrastText,
      fontWeight: 'bold',
    },
    ...buttonStyles,
    modeToggleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
      padding: SPACING.sm,
      backgroundColor: highContrast ? COLORS.surface : COLORS.backgroundEnd,
      borderRadius: DEFAULT_RADIUS,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    modeToggleLabel: {
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      flex: 1,
    },
    modeToggle: {
      width: 50,
      height: 50,
      borderRadius: DEFAULT_RADIUS,
      backgroundColor: highContrast ? COLORS.surface : COLORS.backgroundEnd,
      borderWidth: 2,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modeToggleActive: {
      backgroundColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    modeTogglePressed: {
      opacity: 0.7,
    },
    modeToggleText: {
      fontSize: 24,
    },
    selectedGestureContainer: {
      backgroundColor: highContrast ? COLORS.surface : COLORS.backgroundEnd,
      borderRadius: DEFAULT_RADIUS,
      padding: SPACING.md,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
      alignItems: 'center',
      gap: SPACING.sm,
    },
    selectedGestureEmoji: {
      fontSize: largeText ? 48 : 40,
      marginBottom: SPACING.xs,
    },
    selectedGestureName: {
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
      marginBottom: SPACING.xs,
    },
    selectedGestureDescription: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      marginBottom: SPACING.sm,
      lineHeight: largeText ? 18 : 16,
      textAlign: 'center',
    },
    selectedGestureMeta: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      textAlign: 'center',
    },
    secondaryButton: {
      marginBottom: SPACING.sm,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: DEFAULT_RADIUS,
      borderWidth: 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
      backgroundColor: highContrast ? COLORS.surface : COLORS.backgroundStart,
    },
    secondaryButtonPressed: {
      opacity: 0.8,
    },
    secondaryButtonText: {
      color: highContrast ? COLORS.highContrastText : COLORS.inverseText,
      fontWeight: 'bold',
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
    // Enhanced feedback styles
    qualityContainer: {
      backgroundColor: highContrast ? COLORS.surface : 'rgba(255, 255, 255, 0.9)',
      borderRadius: DEFAULT_RADIUS,
      padding: SPACING.sm,
      marginVertical: SPACING.sm,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
      minWidth: 250,
    },
    qualityLabel: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      marginBottom: SPACING.xs,
      textAlign: 'center',
    },
    qualityBars: {
      gap: SPACING.xs,
    },
    qualityBar: {
      marginBottom: SPACING.xs,
    },
    qualityBarLabel: {
      fontSize: largeText ? 12 : 10,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      marginBottom: 2,
    },
    qualityBarBackground: {
      height: 8,
      backgroundColor: highContrast ? COLORS.surface : COLORS.backgroundEnd,
      borderRadius: 4,
      overflow: 'hidden',
    },
    qualityBarFill: {
      height: '100%',
      backgroundColor: COLORS.success,
      borderRadius: 4,
    },
    sequenceProgressContainer: {
      marginBottom: SPACING.sm,
      padding: SPACING.sm,
      backgroundColor: highContrast ? COLORS.surface : COLORS.backgroundEnd,
      borderRadius: DEFAULT_RADIUS,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
      width: '100%',
    },
    sequenceProgressTitle: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      marginBottom: SPACING.xs,
    },
    sequenceProgressText: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
  });
