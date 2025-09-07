/**
 * Slow Motion Replay Component - Amy First
 *
 * Provides slow-motion replay of gesture videos for learning and review.
 * Allows Amy to see gestures at different speeds to better understand the movements.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Text, Pressable, Animated, Dimensions } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

import { logger } from '../utils/logger';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { LanguageManager } from '../services/LanguageManager';

const { width: screenWidth } = Dimensions.get('window');

interface SlowMotionReplayProps {
  gestureId: string;
  videoUri: string;
  isVisible: boolean;
  onClose?: () => void;
  onReplayComplete?: () => void;
  autoPlay?: boolean;
  initialSpeed?: number;
  showControls?: boolean;
}

const REPLAY_SPEEDS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export default function SlowMotionReplay({
  gestureId,
  videoUri,
  isVisible,
  onClose,
  onReplayComplete,
  autoPlay = true,
  initialSpeed = 0.5,
  showControls = true,
}: SlowMotionReplayProps) {
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentSpeed, setCurrentSpeed] = useState(initialSpeed);
  const [showSpeedControls, setShowSpeedControls] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const hideControlsTimeout = useRef<NodeJS.Timeout | null>(null);

  const player = useVideoPlayer(videoUri ? { uri: videoUri } : null);

  // Handle visibility animation
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: isVisible ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isVisible, fadeAnim]);

  // Handle video player setup
  useEffect(() => {
    if (!player) return;

    const statusSubscription = player.addListener('statusChange', (payload) => {
      if (payload.error) {
        logger.error('SlowMotionReplay video error', payload.error);
      }
    });

    const endSubscription = player?.addListener('playToEnd', () => {
      setIsPlaying(false);
      onReplayComplete?.();
    });

    return () => {
      statusSubscription.remove();
      endSubscription.remove();
    };
  }, [player, onReplayComplete]);

  // Handle playback and speed changes
  useEffect(() => {
    if (!player) return;

    const isLoaded = player.status !== 'loading' && player.status !== 'error' && player.duration > 0;

    if (isVisible && autoPlay && isLoaded && !player.playing) {
      player.play();
      setIsPlaying(true);
    } else if ((!isVisible || !autoPlay) && player.playing) {
      player.pause();
      setIsPlaying(false);
    }

    // Set playback rate
    if (player.playbackRate !== currentSpeed) {
      player.playbackRate = currentSpeed;
    }
  }, [player, isVisible, autoPlay, currentSpeed]);

  // Auto-hide controls
  useEffect(() => {
    if (showControls && showSpeedControls) {
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
      hideControlsTimeout.current = setTimeout(() => {
        setShowSpeedControls(false);
      }, 3000);
    }

    return () => {
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
    };
  }, [showControls, showSpeedControls]);

  const togglePlayback = () => {
    if (!player) return;

    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
    setIsPlaying(!isPlaying);
  };

  const changeSpeed = (speed: number) => {
    setCurrentSpeed(speed);
    setShowSpeedControls(false);
  };

  const restartPlayback = () => {
    if (!player) return;
    player.replay();
    setIsPlaying(true);
  };

  const handleClose = () => {
    if (player?.playing) {
      player.pause();
    }
    onClose?.();
  };

  if (!isVisible || !videoUri) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        { opacity: fadeAnim },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.overlay} pointerEvents="auto">
        {/* Header with gesture info */}
        <View style={styles.header}>
          <Text style={styles.gestureTitle}>
            {LanguageManager.t('slowMotionReplay.title')} {gestureId}
          </Text>
          <Text style={styles.speedIndicator}>
            {currentSpeed}x {LanguageManager.t('slowMotionReplay.speedLabel')}
          </Text>
        </View>

        {/* Video Player */}
        <View style={styles.videoContainer}>
          {player ? (
            <VideoView
              player={player}
              style={styles.video}
              contentFit="contain"
              allowsFullscreen={false}
              allowsPictureInPicture={false}
              accessibilityLabel={`${LanguageManager.t('slowMotionReplay.video')} ${gestureId}`}
            />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>
                {LanguageManager.t('slowMotionReplay.loading')}
              </Text>
            </View>
          )}

          {/* Speed Control Overlay */}
          {showControls && showSpeedControls && (
            <View style={styles.speedControls}>
              {REPLAY_SPEEDS.map((speed) => (
                <Pressable
                  key={speed}
                  style={[
                    styles.speedButton,
                    currentSpeed === speed && styles.speedButtonActive,
                  ]}
                  onPress={() => changeSpeed(speed)}
                  accessibilityLabel={`${speed}x ${LanguageManager.t('slowMotionReplay.speed')}`}
                >
                  <Text style={[
                    styles.speedButtonText,
                    currentSpeed === speed && styles.speedButtonTextActive,
                  ]}>
                    {speed}x
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Control Bar */}
        {showControls && (
          <View style={styles.controlBar}>
            <Pressable
              style={styles.controlButton}
              onPress={restartPlayback}
              accessibilityLabel={LanguageManager.t('slowMotionReplay.restart')}
            >
              <Text style={styles.controlButtonText}>🔄</Text>
            </Pressable>

            <Pressable
              style={styles.controlButton}
              onPress={togglePlayback}
              accessibilityLabel={
                isPlaying
                  ? LanguageManager.t('slowMotionReplay.pause')
                  : LanguageManager.t('slowMotionReplay.play')
              }
            >
              <Text style={styles.controlButtonText}>
                {isPlaying ? '⏸️' : '▶️'}
              </Text>
            </Pressable>

            <Pressable
              style={styles.controlButton}
              onPress={() => setShowSpeedControls(!showSpeedControls)}
              accessibilityLabel={LanguageManager.t('slowMotionReplay.changeSpeed')}
            >
              <Text style={styles.controlButtonText}>
                {currentSpeed}x ⚙️
              </Text>
            </Pressable>

            <Pressable
              style={styles.controlButton}
              onPress={handleClose}
              accessibilityLabel={LanguageManager.t('slowMotionReplay.close')}
            >
              <Text style={styles.controlButtonText}>✕</Text>
            </Pressable>
          </View>
        )}

        {/* Learning Tips */}
        <View style={styles.tipsContainer}>
          <Text style={styles.tipsTitle}>
            {LanguageManager.t('slowMotionReplay.tipsTitle')}
          </Text>
          <Text style={styles.tipsText}>
            {LanguageManager.t('slowMotionReplay.tipsText')}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  overlay: {
    width: screenWidth * 0.9,
    maxWidth: 400,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS * 3,
    padding: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  gestureTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  speedIndicator: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  videoContainer: {
    aspectRatio: 1,
    backgroundColor: COLORS.backgroundEnd,
    borderRadius: RADIUS * 2,
    overflow: 'hidden',
    marginBottom: SPACING.md,
    position: 'relative',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS * 2,
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: COLORS.textMuted,
    fontSize: 16,
  },
  speedControls: {
    position: 'absolute',
    bottom: SPACING.md,
    left: SPACING.md,
    right: SPACING.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  speedButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS,
    minWidth: 50,
    alignItems: 'center',
  },
  speedButtonActive: {
    backgroundColor: COLORS.primaryAccent,
  },
  speedButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  speedButtonTextActive: {
    color: COLORS.surface,
  },
  controlBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  controlButton: {
    padding: SPACING.sm,
    borderRadius: RADIUS,
    backgroundColor: COLORS.backgroundEnd,
    minWidth: 60,
    alignItems: 'center',
  },
  controlButtonText: {
    fontSize: 18,
  },
  tipsContainer: {
    backgroundColor: COLORS.backgroundEnd,
    borderRadius: RADIUS * 2,
    padding: SPACING.md,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  tipsText: {
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 20,
  },
});