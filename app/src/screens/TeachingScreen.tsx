import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Button, StyleSheet, Alert, TextInput, Animated, Easing, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
// Camera handled inside WebView detector
// mlService teaching sessions removed during WebView migration
import { audioService } from '../services/audioService';
import { saveTrainingSample, loadProfile, Profile, loadTrainingSampleCount, saveCustomGesture } from '../storage';
import { addGesture } from '../model';
import { MediaPipeGestureDetector } from '../components/MediaPipeGestureDetector';
import BottomNav from '../components/BottomNav';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { useMessage } from '../context/MessageContext';
import { logger } from '../utils/logger';
import { syncTrainingData } from '../services';

export default function TeachingScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  // No native camera refs
  const [gestureLabel, setGestureLabel] = useState('');
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const sessionId = useRef<string | null>(null);
  const SAMPLES_NEEDED = 5;
  const PREVIEW_SIZE = 240;
  const [landmarks, setLandmarks] = useState<number[][][]>([]);
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
        setError('Failed to load profile');
      });
  }, []);

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
      setError('Please enter a name for the gesture.');
      return;
    }
    try {
      const existingCount = await loadTrainingSampleCount(gestureLabel);
      if (existingCount >= SAMPLES_NEEDED) {
        Alert.alert('Training Complete', `The gesture "${gestureLabel}" already has enough samples.`);
        return;
      }
      sessionId.current = `local-${Date.now()}`;
      setError(null);
      setIsSessionActive(true);
      setSampleCount(existingCount);
      audioService.speak(`Okay, let's learn how to make "${gestureLabel}".`);
    } catch (e) {
      logger.error('Failed to start teaching session', e);
      setError('Failed to start teaching session');
    }
  };

  const recordSample = async () => {
    if (!sessionId.current || isRecording) return;
    setIsRecording(true);
    setError(null);
    try {
      const frames: number[][][][] = [];
      const start = Date.now();
      while (Date.now() - start < 2000) {
        if (
          landmarks.length > 0 &&
          landmarks.every((h) => h.length === 21)
        )
          frames.push(landmarks);
        await new Promise((r) => setTimeout(r, 66));
      }
      if (frames.length === 0) throw new Error('No landmarks captured');
      await saveTrainingSample(gestureLabel, frames);
      setSampleCount((c) => c + 1);
      startSampleCaptureAnimation();
      audioService.playSound('confirmation');
      if (sampleCount + 1 >= SAMPLES_NEEDED) {
        endSession();
      }
    } catch (e) {
      logger.error('Recording failed', e);
      setError('Recording failed');
    } finally {
      setIsRecording(false);
    }
  };

  const endSession = async () => {
    setIsSessionActive(false);
    audioService.speak(`Great! I've learned "${gestureLabel}".`);
    Alert.alert('Success', `The new gesture "${gestureLabel}" has been trained with ${SAMPLES_NEEDED} samples.`);
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
      await syncTrainingData();
    } catch (e) {
      logger.warn('Failed to sync training data', e);
    }
  };

  const handleRetry = () => {
    setSampleCount(0);
    setIsSessionActive(true);
    audioService.speak(`Let's try "${gestureLabel}" again.`);
  };

  const styles = createStyles(largeText, highContrast);

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
      <Text style={styles.title}>Teach New Gesture</Text>
      {!isSessionActive ? (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Name of new gesture"
            value={gestureLabel}
            onChangeText={setGestureLabel}
            accessibilityLabel="Name of new gesture"
          />
          <Button
            title="Start Training"
            onPress={startSession}
            accessibilityLabel="Training starten"
          />
        </View>
      ) : (
        <View style={styles.recordingContainer}>
          <View style={styles.camera}>
            <MediaPipeGestureDetector onGestureDetected={(_g,_c,lms)=>setLandmarks(lms)} onError={(m)=>setError(m)} />
          </View>
          <Animated.View style={[
            styles.sampleIndicator,
            { opacity: sampleCaptureAnim, transform: [{ scale: sampleCaptureAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.8, 1.2],
            })}]}
          ]}>
            <Text style={styles.sampleIndicatorText}>Sample Captured!</Text>
          </Animated.View>
          <Text style={styles.prompt}>Show the gesture "{gestureLabel}"</Text>
          <Text style={styles.progress}>{sampleCount} / {SAMPLES_NEEDED} samples</Text>
          <Button
            title={isRecording ? 'Recording...' : 'Record Sample'}
            onPress={recordSample}
            disabled={isRecording || sampleCount >= SAMPLES_NEEDED}
            accessibilityLabel="Beispiel aufzeichnen"
          />
          {sampleCount > 0 && sampleCount < SAMPLES_NEEDED && (
            <Button
              title="Retry All Samples"
              onPress={handleRetry}
              accessibilityLabel="Alle Beispiele wiederholen"
            />
          )}
          {sampleCount >= SAMPLES_NEEDED && (
            <Button
              title="Finish Training"
              onPress={endSession}
              accessibilityLabel="Training beenden"
            />
          )}
        </View>
      )}
      <Button
        title="Back"
        onPress={() => navigation.goBack()}
        accessibilityLabel="Zurück"
      />
      {profile && <BottomNav active="training" profileId={profile.id} />}
    </SafeAreaView>
    </LinearGradient>
  );
}

const createStyles = (largeText: boolean, highContrast: boolean) =>
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
    recordingContainer: { alignItems: 'center' },
    camera: { width: 240, height: 240, marginBottom: SPACING.sm, borderRadius: RADIUS, overflow: 'hidden' },
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
  });
