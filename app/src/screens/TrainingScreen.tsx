import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Button, StyleSheet, AppState, SafeAreaView } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import Svg, { Circle } from 'react-native-svg';
import { saveTrainingSample, loadProfile, Profile } from '../storage';
import { gestureModel } from '../model';
import { useAccessibility } from '../components/AccessibilityContext';
import { useRecordingProcessor } from '../services';
import { useTensorflowModel } from '../hooks/useTensorflowModel';
import { HAND_LANDMARKER_MODEL } from '../constants/modelPaths';
import { setHandLandmarkModel } from '../services/landmarkExtractor';
import { COLORS, SPACING } from '../constants/ui';
import BottomNav from '../components/BottomNav';

export default function TrainingScreen({ navigation, route }: any) {
  const { largeText, highContrast } = useAccessibility();
  const PREVIEW_SIZE = 200;
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
  const [landmarks, setLandmarks] = useState<number[][]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const landmarkModel = useTensorflowModel(HAND_LANDMARKER_MODEL);
  const isRecordingRef = useRef(isRecording);
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    setHandLandmarkModel(landmarkModel);
    return () => setHandLandmarkModel(null);
  }, [landmarkModel]);

  const isFocused = useIsFocused();
  const [appState, setAppState] = useState(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', setAppState);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

  const canUseCamera =
    hasPermission && device != null && isFocused && appState === 'active';
  const detectionActive = now - lastDetection < 1000;

  const recordingProcessor = useRecordingProcessor((lm) => {
    setLandmarks(lm);
    setLastDetection(Date.now());
    if (isRecordingRef.current) {
      setRecordedLandmarks((prev) => [...prev, lm]);
      setFramesCaptured((c) => c + 1);
    }
  }, true);

  useEffect(() => {
    if (!detectionActive) setLandmarks([]);
  }, [detectionActive]);

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
  });

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Training Mode</Text>
          <Button
            title="Grant Camera Permission"
            onPress={requestPermission}
            accessibilityLabel="Kameraberechtigung erteilen"
          />
        </View>
        {profile && <BottomNav active="training" profileId={profile.id} />}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
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
              <View style={styles.cameraContainer}>
                <Camera
                  style={styles.camera}
                  device={device}
                  isActive={canUseCamera}
                  frameProcessor={recordingProcessor}
                />
                {landmarks.length > 0 && (
                  <Svg
                    style={StyleSheet.absoluteFill}
                    viewBox={`0 0 ${PREVIEW_SIZE} ${PREVIEW_SIZE}`}
                    pointerEvents="none"
                  >
                    {landmarks.map((l, idx) => (
                      <Circle key={idx} cx={l[0] * PREVIEW_SIZE} cy={l[1] * PREVIEW_SIZE} r={3} fill="yellow" />
                    ))}
                  </Svg>
                )}
                <View style={styles.detectionIndicator}>
                  <View
                    style={[styles.dot, { backgroundColor: detectionActive ? 'lime' : 'red' }]}
                  />
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
      {profile && <BottomNav active="training" profileId={profile.id} />}
    </SafeAreaView>
  );
}
