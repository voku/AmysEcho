import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Colors from '../constants/colors';
import { spacing } from '../constants/spacing';

type CameraFrameProps = {
  capturePulseAnim: Animated.Value;
  pulseOpacity?: number;
};

const CAPTURE_PULSE_SIZE = spacing['2xl'] * 5;

const CameraFrameComponent: React.FC<CameraFrameProps> = ({
  capturePulseAnim,
  pulseOpacity = 0.55,
}) => (
  <View style={styles.frame}>
    <Animated.View
      pointerEvents="none"
      style={[
        styles.capturePulse,
        {
          opacity: pulseOpacity,
          transform: [{ scale: capturePulseAnim }],
        },
      ]}
    />
    <View style={[styles.corner, styles.topLeft]} />
    <View style={[styles.corner, styles.topRight]} />
    <View style={[styles.corner, styles.bottomLeft]} />
    <View style={[styles.corner, styles.bottomRight]} />
  </View>
);

const styles = StyleSheet.create({
  frame: {
    width: '88%',
    aspectRatio: 3 / 4,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.cameraFrameBorder,
    overflow: 'hidden',
  },
  capturePulse: {
    position: 'absolute',
    width: CAPTURE_PULSE_SIZE,
    height: CAPTURE_PULSE_SIZE,
    borderRadius: CAPTURE_PULSE_SIZE / 2,
    borderWidth: 2,
    borderColor: Colors.capturePulseBorder,
  },
  corner: {
    position: 'absolute',
    width: spacing['2xl'],
    height: spacing['2xl'],
    borderColor: Colors.frameCorner,
    borderWidth: spacing.xs,
  },
  topLeft: {
    top: spacing.lg,
    left: spacing.lg,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: spacing.lg,
    right: spacing.lg,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: spacing.lg,
    left: spacing.lg,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: spacing.lg,
    right: spacing.lg,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
});

export default React.memo(CameraFrameComponent);
