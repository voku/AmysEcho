import React, { useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import {
  Camera,
  useCameraDevices,
  useCameraPermission,
} from 'react-native-vision-camera';
import { saveTrainingSample } from '../storage';
import { gestureModel } from '../model';
import { useAccessibility } from '../components/AccessibilityContext';
import { useRecordingProcessor } from '../services';

export default function TrainingScreen({ navigation, route }: any) {
  const { largeText, highContrast } = useAccessibility();
  const { gestureLabel } = route.params || {};
  const devices = useCameraDevices();
  const device = devices.find(d => d.position === 'back') ?? devices.find(d => d.position === 'front') ?? devices[0];
  const { hasPermission, requestPermission } = useCameraPermission();
  const [gestureId, setGestureId] = useState<string | null>(gestureLabel || null);
  const [count, setCount] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedLandmarks, setRecordedLandmarks] = useState<number[][][]>([]);

  const recordingProcessor = useRecordingProcessor((landmarks) => {
    setRecordedLandmarks((prev) => [...prev, landmarks]);
  }, isRecording);

  const startRecording = () => {
    if (!gestureId) return;
    setRecordedLandmarks([]);
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
      backgroundColor: highContrast ? '#000' : '#eef2ff',
    },
    title: {
      fontSize: largeText ? 24 : 20,
      marginBottom: 20,
      color: highContrast ? '#fff' : '#000',
    },
    camera: { width: 200, height: 200, marginBottom: 10 },
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
              isActive={true}
              frameProcessor={recordingProcessor}
            />
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
