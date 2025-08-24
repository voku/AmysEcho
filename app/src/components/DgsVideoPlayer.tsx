import React from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
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
      if (shouldPlay && !player.playing) {
        if (isLoaded && player.currentTime < player.duration) {
          player.play();
        } else if (isLoaded && player.currentTime >= player.duration) {
          player.replay();
        }
      } else if (!shouldPlay && player.playing) {
        player.pause();
      }
    }
  }, [player, shouldPlay, player?.status]);

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
});


