import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Button, StyleSheet, Alert, TextInput, Animated, Easing, SafeAreaView } from 'react-native';
import { Camera, useCameraDevices, type CameraRef, type VideoFile } from 'react-native-vision-camera';
import { mlService } from '../services/mlService';
import { audioService } from '../services/audioService';
import { saveTrainingSample, loadProfile, Profile } from '../storage';
import { extractLandmarksFromVideo } from '../services/landmarkExtractor';
import BottomNav from '../components/BottomNav';
import { useAccessibility } from '../components/AccessibilityContext';

export default function TeachingScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const devices = useCameraDevices();
  const device = devices.back ?? devices.front ?? devices[0];
  const camera = useRef<CameraRef>(null);
  const [gestureLabel, setGestureLabel] = useState('');
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const sessionId = useRef<string | null>(null);
  const SAMPLES_NEEDED = 5;
  const [profile, setProfile] = useState<Profile | null>(null);

  const sampleCaptureAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadProfile().then(setProfile);
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
      Alert.alert('Error', 'Please enter a name for the gesture.');
      return;
    }
    sessionId.current = await mlService.startTeachingSession(gestureLabel);
    setIsSessionActive(true);
    setSampleCount(0);
    audioService.speak(`Okay, let's learn how to make "${gestureLabel}".`);
  };

  const recordSample = async () => {
    if (!camera.current || !sessionId.current || isRecording) return;
    setIsRecording(true);
    await camera.current.startRecording({
      onRecordingFinished: async (video: VideoFile) => {
        const landmarks = await extractLandmarksFromVideo(video.path);
        await saveTrainingSample(gestureLabel, landmarks);
        setSampleCount((c) => c + 1);
        startSampleCaptureAnimation();
        audioService.playSound('confirmation');
        setIsRecording(false);
        if (sampleCount + 1 >= SAMPLES_NEEDED) {
          endSession();
        }
      },
      onRecordingError: (error: any) => { // Changed type from CameraCaptureError to any
        console.error('Recording error:', error);
        setIsRecording(false);
        Alert.alert('Recording Error', 'Failed to record sample. Please try again.');
      },
    });
    setTimeout(() => camera.current?.stopRecording(), 3000);
  };

  const endSession = async () => {
    setIsSessionActive(false);
    audioService.speak(`Great! I've learned "${gestureLabel}".`);
    Alert.alert('Success', `The new gesture "${gestureLabel}" has been trained with ${SAMPLES_NEEDED} samples.`);
    sessionId.current = null;
    setGestureLabel('');
    setSampleCount(0);
  };

  const handleRetry = () => {
    setSampleCount(0);
    setIsSessionActive(true);
    audioService.speak(`Let's try "${gestureLabel}" again.`);
  };

  if (device == null) {
    return <Text>Camera not available</Text>;
  }

  const styles = createStyles(largeText, highContrast);

  return (
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
      {profile && <BottomNav active="training" profileId={profile.id} />}
    </SafeAreaView>
  );
}

const createStyles = (largeText: boolean, highContrast: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: 20,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: highContrast ? '#000' : '#eef2ff',
    },
    title: {
      fontSize: largeText ? 28 : 24,
      marginBottom: 20,
      color: highContrast ? '#fff' : '#000',
    },
    inputContainer: { width: '100%' },
    input: { borderWidth: 1, padding: 8, marginBottom: 12, backgroundColor: '#fff', color: '#000' },
    recordingContainer: { alignItems: 'center' },
    camera: { width: 200, height: 200, marginBottom: 10 },
    prompt: { fontSize: largeText ? 22 : 18, marginVertical: 10, color: highContrast ? '#fff' : '#000' },
    progress: { marginBottom: 10, color: highContrast ? '#fff' : '#000' },
    sampleIndicator: {
      position: 'absolute',
      top: 100,
      backgroundColor: 'rgba(0,255,0,0.7)',
      padding: 10,
      borderRadius: 5,
    },
    sampleIndicatorText: {
      color: 'white',
      fontWeight: 'bold',
    },
  });
