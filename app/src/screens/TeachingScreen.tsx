import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Button, StyleSheet, Alert, TextInput, Animated, Easing, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, useCameraDevices } from 'react-native-vision-camera';
import { useCameraPermissionStatus } from '../hooks/useCameraPermissionStatus';
import { mlService } from '../services/mlService';
import { audioService } from '../services/audioService';
import { saveTrainingSample, loadProfile, Profile, loadTrainingSampleCount } from '../storage';
import { extractLandmarksFromImages } from '../services/landmarkExtractor';
import BottomNav from '../components/BottomNav';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import ErrorMessage from '../components/ErrorMessage';
import { logger } from '../utils/logger';
import { syncTrainingData } from '../services';

export default function TeachingScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const devices = useCameraDevices();
  const device = devices.find(d => d.position === 'back') ?? devices.find(d => d.position === 'front') ?? devices[0];
  const { hasPermission, requestPermission } = useCameraPermissionStatus();
  const camera = useRef<Camera>(null);
  const [gestureLabel, setGestureLabel] = useState('');
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const sessionId = useRef<string | null>(null);
  const SAMPLES_NEEDED = 5;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      sessionId.current = await mlService.startTeachingSession(gestureLabel);
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
    if (!camera.current || !sessionId.current || isRecording) return;
    setIsRecording(true);
    setError(null);
    const imageUris: string[] = [];
    try {
      for (let i = 0; i < 30; i++) {
        const photo = await camera.current.takePhoto({});
        imageUris.push(photo.path);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const landmarks = await extractLandmarksFromImages(imageUris);
      await saveTrainingSample(gestureLabel, landmarks);
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

  if (device == null) {
    const gradientColors = highContrast
      ? ([COLORS.highContrastBackground, COLORS.highContrastBackground] as const)
      : ([COLORS.backgroundStart, COLORS.backgroundEnd] as const);
    return (
      <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
        <SafeAreaView style={styles.container}>
          <ErrorMessage message={error || 'Camera not available'} />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (!hasPermission) {
    const gradientColors = highContrast
      ? ([COLORS.highContrastBackground, COLORS.highContrastBackground] as const)
      : ([COLORS.backgroundStart, COLORS.backgroundEnd] as const);
    return (
      <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
        <SafeAreaView style={styles.container}>
          <Text style={styles.title}>Teach New Gesture</Text>
          <Button
            title="Grant Camera Permission"
            onPress={requestPermission}
            accessibilityLabel="Kameraberechtigung erteilen"
          />
          <ErrorMessage message={error} />
        </SafeAreaView>
      </LinearGradient>
    );
  }

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
          />
          <Button title="Start Training" onPress={startSession} />
        </View>
      ) : (
        <View style={styles.recordingContainer}>
          <Camera
            ref={camera}
            style={styles.camera}
            device={device}
            isActive={true}
            video={true}
            photo={true}
          />
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
          />
          {sampleCount > 0 && sampleCount < SAMPLES_NEEDED && (
            <Button title="Retry All Samples" onPress={handleRetry} />
          )}
          {sampleCount >= SAMPLES_NEEDED && (
            <Button title="Finish Training" onPress={endSession} />
          )}
        </View>
      )}
      <Button title="Back" onPress={() => navigation.goBack()} />
      <ErrorMessage message={error} />
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
    camera: { width: 200, height: 200, marginBottom: SPACING.sm },
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
