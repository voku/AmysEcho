import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { COLORS } from '../constants/ui';

interface VisualRippleProps {
  isActive: boolean;
  duration?: number;
  color?: string;
  size?: number;
}

export default function VisualRipple({
  isActive,
  duration = 800,
  color = COLORS.primaryAccent,
  size = 200
}: VisualRippleProps) {
  const rippleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isActive) {
      // Start ripple animation
      Animated.parallel([
        Animated.timing(rippleAnim, {
          toValue: 1,
          duration: duration,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(opacityAnim, {
            toValue: 0.6,
            duration: duration * 0.3,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: duration * 0.7,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        // Reset animations
        rippleAnim.setValue(0);
        opacityAnim.setValue(0);
      });
    }
  }, [isActive, duration, rippleAnim, opacityAnim]);

  if (!isActive) return null;

  const rippleSize = rippleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, size],
  });

  const rippleOpacity = opacityAnim.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0, 0.6, 0],
  });

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.ripple,
          {
            width: rippleSize,
            height: rippleSize,
            borderRadius: size / 2,
            backgroundColor: color,
            opacity: rippleOpacity,
            transform: [{ scale: rippleAnim }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  ripple: {
    position: 'absolute',
  },
});