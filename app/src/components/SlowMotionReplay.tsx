/**
 * Slow Motion Replay Component - Amy First
 *
 * Provides slow-motion replay of gesture videos for learning and review.
 * Allows Amy to see gestures at different speeds to better understand the movements.
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, Dimensions } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

import { logger } from '../utils/logger';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { LanguageManager } from '../services/LanguageManager';

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

  const styles = React.useMemo(() => ({
    container: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      zIndex: 1000,
    },
    overlay: {
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
      alignItems: 'center' as const,
      marginBottom: SPACING.md,
    },
    gestureTitle: {
      fontSize: 20,
      fontWeight: 'bold' as const,
      color: COLORS.text,
      textAlign: 'center' as const,
      marginBottom: SPACING.xs,
    },
    speedIndicator: {
      fontSize: 14,
      color: COLORS.textMuted,
      textAlign: 'center' as const,
    },
    videoContainer: {
      aspectRatio: 1,
      backgroundColor: COLORS.backgroundEnd,
      borderRadius: RADIUS * 2,
      overflow: 'hidden' as const,
      marginBottom: SPACING.md,
      position: 'relative' as const,
    },
    video: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: RADIUS * 2,
    },
    placeholder: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    placeholderText: {
      color: COLORS.textMuted,
      fontSize: 16,
    },
    speedControls: {
      position: 'absolute' as const,
      bottom: SPACING.md,
      left: SPACING.md,
      right: SPACING.md,
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      justifyContent: 'center' as const,
      gap: SPACING.xs,
    },
    speedButton: {
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS,
      minWidth: 50,
      alignItems: 'center' as const,
    },
    speedButtonActive: {
      backgroundColor: COLORS.primaryAccent,
    },
    speedButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: 'bold' as const,
    },
    speedButtonTextActive: {
      color: COLORS.surface,
    },
    controlBar: {
      flexDirection: 'row' as const,
      justifyContent: 'space-around' as const,
      alignItems: 'center' as const,
      marginBottom: SPACING.md,
    },
    controlButton: {
      padding: SPACING.sm,
      borderRadius: RADIUS,
      backgroundColor: COLORS.backgroundEnd,
      minWidth: 60,
      alignItems: 'center' as const,
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
      fontWeight: 'bold' as const,
      color: COLORS.text,
      marginBottom: SPACING.xs,
    },
    tipsText: {
      fontSize: 14,
      color: COLORS.textMuted,
      lineHeight: 20,
    },
  }), []);
  const [screenWidth, setScreenWidth] = useState(375);
  const hideControlsTimeout = useRef<NodeJS.Timeout | null>(null);

  // Get screen dimensions dynamically
  useEffect(() => {
    try {
      const { width } = Dimensions.get('window');
      setScreenWidth(width);
    } catch (error) {
      // Fallback for test environments
      setScreenWidth(375);
    }
  }, []);

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
      testID="slow-motion-replay-container"
    >
      <View style={[styles.overlay, { width: screenWidth * 0.9 }]} pointerEvents="auto" testID="slow-motion-replay-overlay">
        {/* Header with gesture info */}
        <View style={styles.header} testID="slow-motion-header">
          <Text style={styles.gestureTitle} testID="slow-motion-gesture-title">
            {LanguageManager.t('slowMotionReplay.title')} {gestureId}
          </Text>
          <Text style={styles.speedIndicator} testID="slow-motion-speed-indicator">
            {currentSpeed}x {LanguageManager.t('slowMotionReplay.speedLabel')}
          </Text>
        </View>

        {/* Video Player */}
        <View style={styles.videoContainer} testID="slow-motion-video-container">
          {player ? (
            <VideoView
              player={player}
              style={styles.video}
              contentFit="contain"
              allowsFullscreen={false}
              allowsPictureInPicture={false}
              accessibilityLabel={`${LanguageManager.t('slowMotionReplay.video')} ${gestureId}`}
              testID="slow-motion-video"
            />
          ) : (
            <View style={styles.placeholder} testID="slow-motion-placeholder">
              <Text style={styles.placeholderText}>
                {LanguageManager.t('slowMotionReplay.loading')}
              </Text>
            </View>
          )}

          {/* Speed Control Overlay */}
          {showControls && showSpeedControls && (
            <View style={styles.speedControls} testID="slow-motion-speed-controls">
              {REPLAY_SPEEDS.map((speed) => (
                <Pressable
                  key={speed}
                  style={[
                    styles.speedButton,
                    currentSpeed === speed && styles.speedButtonActive,
                  ]}
                  onPress={() => changeSpeed(speed)}
                  accessibilityLabel={`${speed}x ${LanguageManager.t('slowMotionReplay.speed')}`}
                  testID={`slow-motion-speed-${speed}`}
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
          <View style={styles.controlBar} testID="slow-motion-control-bar">
            <Pressable
              style={styles.controlButton}
              onPress={restartPlayback}
              accessibilityLabel={LanguageManager.t('slowMotionReplay.restart')}
              testID="slow-motion-restart-button"
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
              testID="slow-motion-play-pause-button"
            >
              <Text style={styles.controlButtonText}>
                {isPlaying ? '⏸️' : '▶️'}
              </Text>
            </Pressable>

            <Pressable
              style={styles.controlButton}
              onPress={() => setShowSpeedControls(!showSpeedControls)}
              accessibilityLabel={LanguageManager.t('slowMotionReplay.changeSpeed')}
              testID="slow-motion-speed-button"
            >
              <Text style={styles.controlButtonText}>
                {currentSpeed}x ⚙️
              </Text>
            </Pressable>

            <Pressable
              style={styles.controlButton}
              onPress={handleClose}
              accessibilityLabel={LanguageManager.t('slowMotionReplay.close')}
              testID="slow-motion-close-button"
            >
              <Text style={styles.controlButtonText}>✕</Text>
            </Pressable>
          </View>
        )}

        {/* Learning Tips */}
        <View style={styles.tipsContainer} testID="slow-motion-tips-container">
          <Text style={styles.tipsTitle} testID="slow-motion-tips-title">
            {LanguageManager.t('slowMotionReplay.tipsTitle')}
          </Text>
          <Text style={styles.tipsText} testID="slow-motion-tips-text">
            {LanguageManager.t('slowMotionReplay.tipsText')}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

