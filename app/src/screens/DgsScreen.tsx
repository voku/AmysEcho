import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View, Switch } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { useCameraPermissionStatus } from '../hooks/useCameraPermissionStatus';
import { SPACING } from '../constants/ui';

export default function DgsScreen() {
  const [useVideo, setUseVideo] = useState(false);
  const device = useCameraDevice('front');
  const { hasPermission, requestPermission } = useCameraPermissionStatus();

  const handleToggle = useCallback(async () => {
    if (!useVideo) {
      if (hasPermission) {
        setUseVideo(true);
      } else {
        const granted = await requestPermission();
        if (granted) {
          setUseVideo(true);
        }
      }
    } else {
      setUseVideo(false);
    }
  }, [useVideo, hasPermission, requestPermission]);

  if (!device) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>No camera available</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.controls}>
        <Text>Show DGS Video</Text>
        <Switch value={useVideo} onValueChange={handleToggle} />
      </View>

      {useVideo && hasPermission ? (
        <Camera style={styles.camera} device={device} isActive={useVideo} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>I'm listening...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  camera: {
    flex: 1,
  },
});