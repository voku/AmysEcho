import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
// Stub types are provided in mock-types.d.ts for CI; install real module with: npx expo install expo-camera
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Camera } = require('expo-camera');
import { API_URL, API_TOKEN } from '../constants';

interface Props {
  onGestureDetected: (gesture: string, confidence: number, landmarks: number[][][]) => void;
  onError: (error: string) => void;
}

const ExpoCameraDetector: React.FC<Props> = ({ onGestureDetected, onError }) => {
  const [permission, requestPermission] = Camera.useCameraPermissions ? Camera.useCameraPermissions() : [null, null];
  const [ready, setReady] = useState(false);
  const cameraRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      try {
        if (!permission || !permission.granted) {
          await requestPermission?.();
        }
      } catch (e: any) {
        onError('Camera permission error: ' + (e?.message || e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!ready || !permission?.granted) return;
    timerRef.current && clearInterval(timerRef.current);
    timerRef.current = setInterval(async () => {
      try {
        if (!cameraRef.current) return;
        const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.2, skipProcessing: true });
        if (!photo?.base64) return;
        const res = await fetch(`${API_URL}/api/v1/recognize-gesture`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_TOKEN}` },
          body: JSON.stringify({ image: photo.base64 }),
        });
        if (res.ok) {
          const json = await res.json();
          const g = json?.gesture || 'unknown';
          const c = json?.confidence ?? 0;
          onGestureDetected(g, c, []);
        }
      } catch (e: any) {
        // only surface once
      }
    }, 800);
    return () => timerRef.current && clearInterval(timerRef.current);
  }, [ready, permission?.granted]);

  if (!permission?.granted) {
    return (
      <View style={styles.center}><Text style={styles.text}>Waiting for camera permission...</Text></View>
    );
  }
  return (
    <Camera ref={cameraRef} style={{ flex: 1 }} onCameraReady={() => setReady(true)} ratio="16:9" />
  );
};

const styles = StyleSheet.create({ center: { flex: 1, justifyContent: 'center', alignItems: 'center' }, text: { color: '#fff' } });

export default ExpoCameraDetector;

