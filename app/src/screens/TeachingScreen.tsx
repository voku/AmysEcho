import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, TextInput, Animated, Easing, SafeAreaView, Button } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
// Camera handled inside WebView detector
// mlService teaching sessions removed during WebView migration
import { audioService } from '../services/audioService';
import { saveTrainingSample, loadProfile, Profile, loadTrainingSampleCount, saveCustomGesture } from '../storage';
import { captureSamples } from '../services/gestureRecorder';
import { addGesture } from '../model';
import { MediaPipeGestureDetector } from '../components/MediaPipeGestureDetector';
import BottomNav from '../components/BottomNav';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { useMessage } from '../context/MessageContext';
import { logger } from '../utils/logger';
import { syncTrainingData } from '../services';

import { childFriendlyStyles } from '../styles/touchTargets';
import { createButtonStyles } from '../styles/buttonStyles';
import { hapticFeedback } from '../utils/hapticUtils';
import TwoHandGestureSelector from '../components/TwoHandGestureSelector';
import { TwoHandGestureDefinition, parseTwoHandGestureString } from '../constants/twoHandGestures';
import { twoHandGestureService } from '../services/twoHandGestureService';
import VisualFeedback from '../components/VisualFeedback';
import ProgressTracker from '../components/ProgressTracker';
import GestureValidationFeedback from '../components/GestureValidationFeedback';

const PREVIEW_SIZE = 240;

export default function TeachingScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  // No native camera refs
  const [gestureLabel, setGestureLabel] = useState('');
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isTwoHandMode, setIsTwoHandMode] = useState(false);
  const [showTwoHandSelector, setShowTwoHandSelector] = useState(false);
  const [selectedTwoHandGesture, setSelectedTwoHandGesture] = useState<TwoHandGestureDefinition | null>(null);

  const [showVisualFeedback, setShowVisualFeedback] = useState(false);
  const [validationFeedback, setValidationFeedback] = useState<{
    isValid: boolean;
    message: string;
    suggestions: string[];
  } | null>(null);
  const [currentGestureQuality, setCurrentGestureQuality] = useState<{
    confidence: number;
    stability: number;
    clarity: number;
  } | null>(null);
  const sessionId = useRef<string | null>(null);
  const SAMPLES_NEEDED = 5;
  const landmarksRef = useRef<number[][][]>([]);
  const handednessRef = useRef<string[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { setMessage } = useMessage();

  useEffect(() => {
    setMessage(error);
  }, [error, setMessage]);
  // WebView will indicate camera issues via onError

  const sampleCaptureAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadProfile()
      .then(setProfile)
      .catch((e) => {
        logger.error('Failed to load profile', e);
        setError('Profil konnte nicht geladen werden.');
      });
  }, []);

  const handleGestureDetected = useCallback(
    async (gesture: string | null, confidence: number, lms: number[][][]) => {
      landmarksRef.current = lms;
      handednessRef.current = []; // No handedness data available in simplified mode

      // Enhanced feedback for teaching mode
      if (gesture && confidence > 0.3) {
        // Show visual feedback for detected gestures
        setShowVisualFeedback(true);
        setTimeout(() => setShowVisualFeedback(false), 1000);

        // Update gesture quality metrics
        setCurrentGestureQuality({
          confidence,
          stability: Math.min(1, lms.length / 2), // Rough stability based on landmark count
          clarity: confidence > 0.7 ? 1 : confidence > 0.5 ? 0.7 : 0.4
        });

        // Enhanced two-hand gesture validation and feedback
        if (isTwoHandMode && selectedTwoHandGesture && lms.length >= 2) {
          const parsed = parseTwoHandGestureString(gesture);
          if (parsed) {
            const twoHandResult = await twoHandGestureService.processTwoHandGesture(
              parsed.left,
              parsed.right,
              confidence,
              confidence,
              [], // No handedness data in simplified mode
              lms
            );

            if (twoHandResult) {
              setSelectedTwoHandGesture(twoHandResult.gesture);

              // Provide validation feedback
              const validationMessage = twoHandResult.confidence > 0.8
                ? 'Perfekt! Das sieht sehr gut aus!'
                : twoHandResult.confidence > 0.6
                ? 'Gut gemacht! Fast perfekt.'
                : 'Das ist ein guter Anfang. Versuche es nochmal.';

              setValidationFeedback({
                isValid: twoHandResult.confidence > 0.6,
                message: validationMessage,
                suggestions: twoHandResult.accessibilityHints.slice(0, 2)
              });

              // Clear validation feedback after a delay
              setTimeout(() => setValidationFeedback(null), 3000);
            }
          }
        } else if (!isTwoHandMode) {
          // Single-hand gesture feedback
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
        // Clear feedback when no gesture detected
        setCurrentGestureQuality(null);
        setValidationFeedback(null);
      }
    },
    [isTwoHandMode, selectedTwoHandGesture]
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
    try {
      const existingCount = await loadTrainingSampleCount(gestureLabel);
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
    if (!sessionId.current || isRecording) return;
    setIsRecording(true);
    setError(null);
    try {
      const frames = await captureSamples(() => ({ landmarks: landmarksRef.current, handedness: handednessRef.current }));
      await saveTrainingSample(gestureLabel, frames);
      setSampleCount((c) => c + 1);
      startSampleCaptureAnimation();
      audioService.playSound('confirmation');
      if (sampleCount + 1 >= SAMPLES_NEEDED) {
        endSession();
      }
    } catch (e) {
      logger.error('Recording failed', e);
      setError('Aufnahme fehlgeschlagen');
    } finally {
      setIsRecording(false);
    }
  };

  const endSession = async () => {
    setIsSessionActive(false);
    audioService.speak(`Super! Ich habe "${gestureLabel}" gelernt.`);
    Alert.alert('Erfolg', `Die neue Geste "${gestureLabel}" wurde mit ${SAMPLES_NEEDED} Beispielen trainiert.`);
    sessionId.current = null;
    const id = gestureLabel.trim().toLowerCase().replace(/\s+/g, '_');
    try {
      await saveCustomGesture({ id, label: gestureLabel });
      addGesture({ id, label: gestureLabel });
    } catch (e) {
      logger.warn('Failed to store custom gesture', e);
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

  const handleTwoHandGestureSelected = (gesture: TwoHandGestureDefinition) => {
    setSelectedTwoHandGesture(gesture);
    setGestureLabel(gesture.name);
    setShowTwoHandSelector(false);
    audioService.speak(`Okay, lass uns die zweihändige Geste "${gesture.name}" lernen.`);
  };

  const handleTwoHandModeToggle = () => {
    if (isTwoHandMode) {
      // Switching from two-hand to single-hand mode
      setIsTwoHandMode(false);
      setSelectedTwoHandGesture(null);
      setGestureLabel('');
    } else {
      // Switching to two-hand mode
      setIsTwoHandMode(true);
      setShowTwoHandSelector(true);
    }
  };

  const buttonStyles = createButtonStyles();
  const styles = createStyles(largeText, highContrast, buttonStyles);

  if (false) {
    const gradientColors = highContrast
      ? ([COLORS.highContrastBackground, COLORS.highContrastBackground] as const)
      : ([COLORS.backgroundStart, COLORS.backgroundEnd] as const);
    return (
      <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
        <SafeAreaView style={styles.container}>
        </SafeAreaView>
      </LinearGradient>
    );
  }

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

  const gradientColors = highContrast
    ? ([COLORS.highContrastBackground, COLORS.highContrastBackground] as const)
    : ([COLORS.backgroundStart, COLORS.backgroundEnd] as const);
  return (
    <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Neue Geste beibringen</Text>
      {!isSessionActive ? (
       <View style={styles.inputContainer}>
           {/* Two-hand mode toggle */}
           <View style={styles.modeToggleContainer}>
             <Text style={styles.modeToggleLabel}>
               {isTwoHandMode ? '🤲 Zweihändige Geste' : '✋ Einzelhändige Geste'}
             </Text>
             <Pressable
               style={({ pressed }) => [
                 styles.modeToggle,
                 isTwoHandMode && styles.modeToggleActive,
                 pressed && styles.modeTogglePressed,
               ]}
               onPress={handleTwoHandModeToggle}
               accessibilityRole="button"
               accessibilityLabel={isTwoHandMode ? 'Zu einzelhändigen Gesten wechseln' : 'Zu zweihändigen Gesten wechseln'}
             >
               <Text style={styles.modeToggleText}>
                 {isTwoHandMode ? '🤲' : '✋'}
               </Text>
             </Pressable>
           </View>

           {isTwoHandMode ? (
             selectedTwoHandGesture ? (
               <View style={styles.selectedGestureContainer}>
                 <Text style={styles.selectedGestureTitle}>
                   Ausgewählte Geste:
                 </Text>
                 <Text style={styles.selectedGestureName}>
                   {selectedTwoHandGesture.name}
                 </Text>
                 <Text style={styles.selectedGestureDescription}>
                   {selectedTwoHandGesture.description}
                 </Text>
                 <View style={styles.gestureHandsContainer}>
                   <Text style={styles.handEmoji}>🤲</Text>
                   <Text style={styles.plusSign}>+</Text>
                   <Text style={styles.handEmoji}>🤲</Text>
                 </View>
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
                   accessibilityLabel="Training für zweihändige Geste starten"
                 >
                   <Text style={[
                     styles.buttonText,
                     largeText && styles.buttonTextLarge,
                     highContrast && styles.buttonTextHC,
                   ]}>
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
                 onPress={() => setShowTwoHandSelector(true)}
                 accessibilityRole="button"
                 accessibilityLabel="Zweihändige Geste auswählen"
               >
                 <Text style={[
                   styles.buttonText,
                   largeText && styles.buttonTextLarge,
                   highContrast && styles.buttonTextHC,
                 ]}>
                   🤲 Geste auswählen
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
                 <Text style={[
                   styles.buttonText,
                   largeText && styles.buttonTextLarge,
                   highContrast && styles.buttonTextHC,
                 ]}>
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
                onGestureDetected={handleGestureDetected}
                onError={setError}
                onWebViewEvent={(telemetry) => {
                  console.log('Teaching WebView telemetry:', telemetry);
                }}
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
             {isTwoHandMode && selectedTwoHandGesture
               ? `Zeige: ${selectedTwoHandGesture.name}`
               : `Zeige die Geste "${gestureLabel}"`
             }
           </Text>

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
          <View style={{ height: 8, backgroundColor: COLORS.border, borderRadius: RADIUS, overflow: 'hidden', marginTop: 6 }}>
            <View style={{ height: '100%', width: `${Math.max(0, Math.min(100, progress))}%`, backgroundColor: COLORS.success }} />
          </View>
        </View>
      )}
      <Button
        title="Zurück"
        onPress={() => navigation.goBack()}
        accessibilityLabel="Zurück"
      />
       {profile && <BottomNav active="training" profileId={profile.id} />}

       {/* Two-Hand Gesture Selector Overlay */}
       {showTwoHandSelector && (
         <View style={styles.overlay}>
           <TwoHandGestureSelector
             onGestureSelected={handleTwoHandGestureSelected}
             onCancel={() => setShowTwoHandSelector(false)}
           />
         </View>
       )}
     </SafeAreaView>
     </LinearGradient>
   );
 }

const createStyles = (largeText: boolean, highContrast: boolean, buttonStyles: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: SPACING.lg,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'transparent',
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
      borderRadius: RADIUS,
    },
    recordingContainer: { alignItems: 'center', position: 'relative' },
    camera: {
      width: PREVIEW_SIZE,
      height: PREVIEW_SIZE,
      marginBottom: SPACING.sm,
      position: 'relative',
      borderRadius: RADIUS,
      overflow: 'hidden',
    },
    prompt: { fontSize: largeText ? 22 : 18, marginVertical: SPACING.sm, color: highContrast ? COLORS.highContrastText : COLORS.text },
    progress: { marginBottom: SPACING.sm, color: highContrast ? COLORS.highContrastText : COLORS.text },
    sampleIndicator: {
      position: 'absolute',
      top: 100,
      backgroundColor: `${COLORS.success}B3`,
      padding: SPACING.sm,
      borderRadius: RADIUS,
    },
    sampleIndicatorText: {
      color: COLORS.highContrastText,
      fontWeight: 'bold',
    },
    ...buttonStyles,
    // Two-hand gesture mode styles
    modeToggleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
      padding: SPACING.sm,
      backgroundColor: highContrast ? COLORS.surface : COLORS.backgroundEnd,
      borderRadius: RADIUS,
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
      borderRadius: RADIUS,
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
      borderRadius: RADIUS,
      padding: SPACING.md,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    selectedGestureTitle: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
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
    },
    gestureHandsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.md,
    },
    handEmoji: {
      fontSize: largeText ? 32 : 28,
      marginHorizontal: SPACING.xs,
    },
    plusSign: {
      fontSize: largeText ? 20 : 18,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
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
      borderRadius: RADIUS,
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
  });
