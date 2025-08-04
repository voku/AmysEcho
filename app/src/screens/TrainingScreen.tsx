import React, { useState, useEffect } from 'react';
import { View, Text, Button, StyleSheet, AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import { saveTrainingSample } from '../storage';
import { gestureModel } from '../model';
import { useAccessibility } from '../components/AccessibilityContext';
import { useRecordingProcessor } from '../services';
import { COLORS, SPACING } from '../constants/ui';

export default function TrainingScreen({ navigation, route }: any) {
  const { largeText, highContrast } = useAccessibility();
  const { gestureLabel } = route.params || {};
  // Prefer the back camera but fall back to front if unavailable
  const backCamera = useCameraDevice('back');
  const frontCamera = useCameraDevice('front');
  const device = backCamera ?? frontCamera;
  const { hasPermission, requestPermission } = useCameraPermission();
  const [gestureId, setGestureId] = useState<string | null>(gestureLabel || null);
  const [count, setCount] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedLandmarks, setRecordedLandmarks] = useState<number[][][]>([]);
  const [framesCaptured, setFramesCaptured] = useState(0);
  const [lastDetection, setLastDetection] = useState(0);
  const [now, setNow] = useState(Date.now());

  const isFocused = useIsFocused();
  const [appState, setAppState] = useState(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', setAppState);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [isRecording]);

  const canUseCamera =
    hasPermission && device != null && isFocused && appState === 'active';
  const detectionActive = now - lastDetection < 1000;

  const recordingProcessor = useRecordingProcessor((landmarks) => {
    setRecordedLandmarks((prev) => [...prev, landmarks]);
    setFramesCaptured((c) => c + 1);
    setLastDetection(Date.now());
  }, isRecording);

  const startRecording = () => {
    if (!gestureId) return;
    setRecordedLandmarks([]);
    setFramesCaptured(0);
    setLastDetection(0);
    setIsRecording(true);
  };

  const stopRecording = async () => {
    setIsRecording(false);
    if (!gestureId || recordedLandmarks.length < 10) return;
    await saveTrainingSample(gestureId, recordedLandmarks);
    setCount((c) => c + 1);
  };

  const handleFinish = () => {
    navigation.goBack();
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.backgroundStart,
    },
    title: {
      fontSize: largeText ? 24 : 20,
      marginBottom: SPACING.lg,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    camera: { width: 200, height: 200, marginBottom: SPACING.sm },
    recordingIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    dot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      marginRight: SPACING.sm,
    },
    recordingText: {
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      fontSize: largeText ? 18 : 16,
    },
  });

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Training Mode</Text>
        <Button
          title="Grant Camera Permission"
          onPress={requestPermission}
          accessibilityLabel="Kameraberechtigung erteilen"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Training {gestureId ? `for ${gestureId}` : 'Mode'}</Text>
      {!gestureId ? (
        gestureModel.gestures.map((g) => (
          <Button
            key={g.id}
            title={g.label}
            onPress={() => setGestureId(g.id)}
            accessibilityLabel={`Trainiere Geste ${g.label}`}
          />
        ))
      ) : count < 5 ? (
        <>
          {device && (
            <Camera
              style={styles.camera}
              device={device}
              isActive={canUseCamera}
              frameProcessor={recordingProcessor}
            />
          )}
          {isRecording && (
            <View style={styles.recordingIndicator}>
              <View
                style={[styles.dot, { backgroundColor: detectionActive ? 'lime' : 'red' }]}
              />
              <Text style={styles.recordingText}>
                {detectionActive
                  ? `Recording... ${framesCaptured}`
                  : 'No hand detected'}
              </Text>
            </View>
          )}
          <Button
            title={isRecording ? 'Stop Recording' : `Record Sample ${count + 1} / 5`}
            onPress={isRecording ? stopRecording : startRecording}
            accessibilityLabel="Gestenaufnahme starten"
            disabled={!gestureId}
          />
        </>
      ) : (
        <Button
          title="Save Training Data"
          onPress={handleFinish}
          accessibilityLabel="Trainingsdaten speichern"
        />
      )}
    </View>
  );
}
