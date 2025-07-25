import React, { useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { logger } from '../utils/logger';

interface DgsVideoPlayerProps {
  videoSource?: any;
  style?: object;
  shouldPlay: boolean;
}

export default function DgsVideoPlayer({ videoSource, style, shouldPlay }: DgsVideoPlayerProps) {
  const videoRef = useRef<Video>(null);
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);

  const onPlaybackStatusUpdate = (newStatus: AVPlaybackStatus) => {
    setStatus(newStatus);
    if (newStatus.isLoaded && newStatus.didJustFinish) {
      videoRef.current?.replayAsync();
    }
  };

  const isBuffering = status?.isLoaded === false || status?.isBuffering === true;

  return (
    <View style={[styles.container, style]}>
      {videoSource ? (
        <Video
          ref={videoRef}
          style={styles.video}
          source={videoSource}
          useNativeControls={false}
          resizeMode={ResizeMode.CONTAIN}
          isLooping
          shouldPlay={shouldPlay}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        />
      ) : (
        <Text
          style={styles.placeholderText}
          accessibilityLabel="Kein Video vorhanden"
        >
          Kein Video vorhanden
        </Text>
      )}
      {isBuffering && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#000',
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#fff',
  },
});
