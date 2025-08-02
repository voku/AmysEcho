import React, { useState, useRef } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import {
  Camera,
  useCameraDevices,
  useCameraPermission,
  type VideoFile,
} from 'react-native-vision-camera';
import { saveTrainingSample } from '../storage';
import { gestureModel } from '../model';
import { useAccessibility } from '../components/AccessibilityContext';
import { extractLandmarksFromVideo } from '../services';

export default function TrainingScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const devices = useCameraDevices();
  const device = devices.find(d => d.position === 'back') ?? devices.find(d => d.position === 'front') ?? devices[0];
  const { hasPermission, requestPermission } = useCameraPermission();
  const camera = useRef<Camera>(null);
  const [gestureId, setGestureId] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [saving, setSaving] = useState(false);

  const handleRecord = async () => {
    if (!camera.current || !gestureId || saving) return;
    setSaving(true);
    await camera.current.startRecording({
      onRecordingFinished: async (video: VideoFile) => {
        const landmarks = await extractLandmarksFromVideo(video.path);
        await saveTrainingSample(gestureId, landmarks);
        setCount((c) => c + 1);
        setSaving(false);
      },
      onRecordingError: () => setSaving(false),
    });
    setTimeout(() => camera.current?.stopRecording(), 3000);
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
      <Text style={styles.title}>Training Mode</Text>
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
            <Camera ref={camera} style={styles.camera} device={device} isActive={!saving} />
          )}
          <Button
            title={saving ? 'Recording...' : `Record Sample ${count + 1} / 5`}
            onPress={handleRecord}
            accessibilityLabel="Gestenaufnahme starten"
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

