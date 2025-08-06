import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View, Switch, Button } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { useCameraPermissionStatus } from '../hooks/useCameraPermissionStatus';
import DgsVideoPlayer from '../components/DgsVideoPlayer';
import { SPACING } from '../constants/ui';

export default function DgsScreen() {
  const [showCamera, setShowCamera] = useState(false);
  const [playing, setPlaying] = useState(true);
  const device = useCameraDevice('front');
  const { hasPermission, requestPermission } = useCameraPermissionStatus();

  const handleToggleCamera = useCallback(async () => {
    if (!showCamera) {
      if (hasPermission) {
        setShowCamera(true);
      } else {
        const granted = await requestPermission();
        if (granted) {
          setShowCamera(true);
        }
      }
    } else {
      setShowCamera(false);
    }
  }, [showCamera, hasPermission, requestPermission]);

  const handlePlayPause = useCallback(() => {
    setPlaying((p) => !p);
  }, []);

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
      <DgsVideoPlayer
        videoSource={{ uri: 'https://example.com/dgs-demo.mp4' }}
        shouldPlay={playing}
        style={styles.video}
      />
      {showCamera && hasPermission && (
        <Camera style={styles.camera} device={device} isActive={showCamera} />
      )}
      <View style={styles.controls}>
        <Button
          title={playing ? 'Pause' : 'Play'}
          onPress={handlePlayPause}
          accessibilityLabel={playing ? 'Pause DGS video' : 'Play DGS video'}
        />
      <View style={styles.switchRow}>
          <Text>Show Camera</Text>
          <Switch style={styles.switch} value={showCamera} onValueChange={handleToggleCamera} />
        </View>
      </View>
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
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  switch: {
    marginLeft: SPACING.sm,
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
  video: {
    flex: 1,
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
});
