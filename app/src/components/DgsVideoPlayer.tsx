import React from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Pressable } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

import { logger } from '../utils/logger';
import { COLORS, RADIUS } from '../constants/ui';

interface DgsVideoPlayerProps {
  videoSource?: any;
  style?: object;
  shouldPlay: boolean;
}

export default function DgsVideoPlayer({ videoSource, style, shouldPlay }: DgsVideoPlayerProps) {
  const player = useVideoPlayer(videoSource);
  const [isPlaying, setIsPlaying] = React.useState(shouldPlay);

  React.useEffect(() => {
    setIsPlaying(shouldPlay);
  }, [shouldPlay]);

  React.useEffect(() => {
    if (!player) return;
    const subscription = player.addListener('statusChange', (payload) => {
      if (payload.error) {
        logger.error('DgsVideoPlayer error', payload.error);
      }
      // Status change can be used to update UI if needed
    });
    return () => subscription.remove();
  }, [player]);

  const isBuffering = player?.status === 'loading';

  React.useEffect(() => {
    if (player) {
      const isLoaded = player.status !== 'loading' && player.status !== 'error' && player.duration > 0;
      if (isPlaying && !player.playing) {
        if (isLoaded && player.currentTime < player.duration) {
          player.play();
        } else if (isLoaded && player.currentTime >= player.duration) {
          player.replay();
        }
      } else if (!isPlaying && player.playing) {
        player.pause();
      }
    }
  }, [player, isPlaying, player?.status]);

  const togglePlayback = React.useCallback(() => {
    if (!player) return;
    setIsPlaying((prev) => !prev);
  }, [player]);

  return (
    <View style={[styles.container, style]}>
      {videoSource ? (
        <VideoView
          player={player}
          style={styles.video}
          contentFit={'contain'}
          accessibilityLabel="DGS-Video"
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
          <ActivityIndicator size="large" color={COLORS.highContrastText} />
        </View>
      )}
      {player && (
        <Pressable
          onPress={togglePlayback}
          style={styles.controlButton}
          accessibilityLabel={isPlaying ? 'Video pausieren' : 'Video abspielen'}
        >
          <Text style={styles.controlText}>
            {isPlaying ? 'Pause' : 'Abspielen'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: COLORS.highContrastBackground,
    borderRadius: RADIUS * 2,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: `${COLORS.highContrastBackground}80`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: COLORS.highContrastText,
  },
  controlButton: {
    position: 'absolute',
    bottom: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: COLORS.highContrastBackground,
    borderRadius: RADIUS,
  },
  controlText: {
    color: COLORS.highContrastText,
    fontSize: 18,
    fontWeight: 'bold',
  },
});


