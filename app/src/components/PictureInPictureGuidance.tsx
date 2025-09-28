/**
 * Picture-in-Picture Guidance Component - Amy First
 *
 * Shows gesture guidance videos in a picture-in-picture overlay during recognition
 * to help Amy learn and improve her gestures in real-time.
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, Pressable, Animated } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

import { logger } from '../utils/logger';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';

const TEXT = {
  gestureVideoLabel: 'Gesten-Video',
  loading: 'Lädt…',
  close: 'Bild-im-Bild schließen',
  pause: 'Pause',
  play: 'Abspielen',
};

interface PictureInPictureGuidanceProps {
  gestureId?: string | undefined;
  videoUri?: string | undefined;
  isVisible: boolean;
  onClose?: () => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  size?: 'small' | 'medium' | 'large';
  autoPlay?: boolean;
  showControls?: boolean;
  playbackMode?: 'loop' | 'once' | 'guided';
  confidence?: number;
  onPlaybackComplete?: () => void;
}

const PIP_GUIDANCE_SIZE = {
  small: { width: 120, height: 120 },
  medium: { width: 160, height: 160 },
  large: { width: 200, height: 200 },
};

const PIP_GUIDANCE_POSITION = {
  'top-right': { top: SPACING.lg, right: SPACING.lg },
  'top-left': { top: SPACING.lg, left: SPACING.lg },
  'bottom-right': { bottom: SPACING.lg, right: SPACING.lg },
  'bottom-left': { bottom: SPACING.lg, left: SPACING.lg },
};

export default function PictureInPictureGuidance({
  gestureId,
  videoUri,
  isVisible,
  onClose,
  position = 'top-right',
  size = 'medium',
  autoPlay = true,
  showControls = false,
  playbackMode = 'loop',
  confidence,
  onPlaybackComplete,
}: PictureInPictureGuidanceProps) {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [isPlaying, setIsPlaying] = useState(autoPlay);

  const player = useVideoPlayer(videoUri ? { uri: videoUri } : null);

  // Handle visibility animation
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: isVisible ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isVisible, fadeAnim]);

  // Adjust behavior based on confidence
  const shouldShowEncouragement = confidence !== undefined && confidence < 0.6;
  const encouragementText = shouldShowEncouragement ? 'Versuch\'s nochmal!' : 'Gut gemacht!';

  // Handle video playback
  useEffect(() => {
    if (!player) return;

    const statusSubscription = player.addListener('statusChange', (payload) => {
      if (payload.error) {
        logger.error('PiP Guidance video error', payload.error);
      }
    });

    const endSubscription = player?.addListener('playToEnd', () => {
      if (playbackMode === 'once') {
        setIsPlaying(false);
        onPlaybackComplete?.();
      } else if (playbackMode === 'loop') {
        // Continue looping for guidance
        setIsPlaying(true);
      } else if (playbackMode === 'guided') {
        // In guided mode, pause after one play and wait for user interaction
        setIsPlaying(false);
      }
    });

    return () => {
      statusSubscription.remove();
      endSubscription.remove();
    };
  }, [player, onPlaybackComplete, playbackMode]);

  // Control playback based on props
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
  }, [player, isVisible, autoPlay]);

  const togglePlayback = () => {
    if (!player) return;

    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
    setIsPlaying(!isPlaying);
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

  const dimensions = PIP_GUIDANCE_SIZE[size];
  const positionStyle = PIP_GUIDANCE_POSITION[position];

  return (
    <Animated.View
      style={[
        styles.container,
        positionStyle,
        dimensions,
        { opacity: fadeAnim },
      ]}
      pointerEvents="box-none"
      testID="pip-guidance-container"
    >
      <View style={styles.videoContainer} pointerEvents="auto">
        {player ? (
          <VideoView
            player={player}
            style={styles.video}
            contentFit="contain"
            allowsFullscreen={false}
            allowsPictureInPicture={false}
            accessibilityLabel={`${TEXT.gestureVideoLabel} ${gestureId || 'unknown'}`}
            testID="pip-guidance-video"
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>
              {TEXT.loading}
            </Text>
          </View>
        )}

        {/* Close button */}
        <Pressable
          style={styles.closeButton}
          onPress={handleClose}
          accessibilityLabel={TEXT.close}
          testID="pip-close-button"
        >
          <Text style={styles.closeText}>×</Text>
        </Pressable>

        {/* Play/Pause control (optional) */}
        {showControls && (
          <Pressable
            style={styles.controlButton}
            onPress={togglePlayback}
            accessibilityLabel={
              isPlaying
                ? TEXT.pause
                : TEXT.play
            }
            testID="pip-control-button"
          >
            <Text style={styles.controlText}>
              {isPlaying ? '⏸️' : '▶️'}
            </Text>
          </Pressable>
        )}

        {/* Gesture label */}
        {gestureId && (
          <View style={styles.labelContainer}>
            <Text style={styles.gestureLabel} numberOfLines={1}>
              {gestureId}
            </Text>
          </View>
        )}

        {/* Encouragement overlay for low confidence */}
        {shouldShowEncouragement && (
          <View style={styles.encouragementContainer}>
            <Text style={styles.encouragementText}>
              {encouragementText}
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  videoContainer: {
    flex: 1,
    backgroundColor: COLORS.highContrastBackground,
    borderRadius: DEFAULT_RADIUS * 2,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: COLORS.primaryAccent,
  },
  video: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: DEFAULT_RADIUS * 2,
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.highContrastBackground,
  },
  placeholderText: {
    color: COLORS.highContrastText,
    fontSize: 12,
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 18,
  },
  controlButton: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlText: {
    fontSize: 12,
    lineHeight: 14,
  },
  labelContainer: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    left: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: DEFAULT_RADIUS,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  gestureLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  encouragementContainer: {
    position: 'absolute',
    bottom: -30,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(34, 197, 94, 0.9)',
    borderRadius: DEFAULT_RADIUS,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
  },
  encouragementText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});