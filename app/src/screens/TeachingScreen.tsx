import React, { useState, useRef } from 'react';
import { View, Text, Button, StyleSheet, Alert, TextInput } from 'react-native';
import { Camera, useCameraDevices, type CameraRef, type VideoFile } from 'react-native-vision-camera';
import { mlService } from '../services/mlService';
import { audioService } from '../services/audioService';
import { extractLandmarksFromVideo } from '../services/landmarkExtractor';
import { saveTrainingSample } from '../storage';

export default function TeachingScreen({ navigation }: any) {
  const devices = useCameraDevices('wide-angle-camera');
  const device = devices.back;
  const camera = useRef<CameraRef>(null);
  const [gestureLabel, setGestureLabel] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const sessionId = useRef<string | null>(null);
  const SAMPLES_NEEDED = 5;

  const startSession = async () => {
    if (!gestureLabel.trim()) {
      Alert.alert('Fehler', 'Bitte gib einen Namen für die Geste ein.');
      return;
    }
    sessionId.current = await mlService.startTeachingSession(gestureLabel);
    setIsRecording(true);
    setSampleCount(0);
    audioService.speak(`Okay, lass uns lernen, wie man "${gestureLabel}" macht.`);
  };

  const recordSample = async () => {
    if (!camera.current || !sessionId.current) return;
    await camera.current.startRecording({
      onRecordingFinished: async (video: VideoFile) => {
        const landmarks = await extractLandmarksFromVideo(video.path);
        await saveTrainingSample(gestureLabel, landmarks);
        setSampleCount((c) => c + 1);
        audioService.playSound('confirm');
        if (sampleCount + 1 >= SAMPLES_NEEDED) {
          endSession();
        }
      },
      onRecordingError: () => {},
    });
    setTimeout(() => camera.current?.stopRecording(), 3000);
  };

  const endSession = () => {
    setIsRecording(false);
    audioService.speak(`Super! Ich habe "${gestureLabel}" gelernt.`);
    Alert.alert('Erfolg', `Die neue Geste "${gestureLabel}" wurde mit ${SAMPLES_NEEDED} Beispielen trainiert.`);
    sessionId.current = null;
    setGestureLabel('');
    setSampleCount(0);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Neue Geste beibringen</Text>
      {!isRecording ? (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Name der neuen Geste"
            value={gestureLabel}
            onChangeText={setGestureLabel}
          />
          <Button title="Training starten" onPress={startSession} />
        </View>
      ) : (
        <View style={styles.recordingContainer}>
          {device && <Camera ref={camera} style={styles.camera} device={device} isActive={true} />}
          <Text style={styles.prompt}>Zeige die Geste "{gestureLabel}"</Text>
          <Text style={styles.progress}>{sampleCount} / {SAMPLES_NEEDED} Aufnahmen</Text>
          <Button title="Beispiel aufnehmen" onPress={recordSample} />
        </View>
      )}
      <Button title="Zurück" onPress={() => navigation.goBack()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, marginBottom: 20 },
  inputContainer: { width: '100%' },
  input: { borderWidth: 1, padding: 8, marginBottom: 12 },
  recordingContainer: { alignItems: 'center' },
  camera: { width: 200, height: 200, marginBottom: 10 },
  prompt: { fontSize: 18, marginVertical: 10 },
  progress: { marginBottom: 10 },
});
