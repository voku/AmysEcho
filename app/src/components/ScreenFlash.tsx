import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';
import { COLORS } from '../constants/ui';

const { width, height } = Dimensions.get('window');

interface ScreenFlashProps {
  isActive: boolean;
  pattern?: 'single' | 'double' | 'triple' | 'pulse';
  color?: string;
  duration?: number;
}

export default function ScreenFlash({
  isActive,
  pattern = 'single',
  color = COLORS.primaryAccent,
  duration = 300
}: ScreenFlashProps) {
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isActive) {
      const runPattern = () => {
        switch (pattern) {
          case 'single':
            // Single flash
            Animated.sequence([
              Animated.timing(opacityAnim, {
                toValue: 0.8,
                duration: duration * 0.3,
                useNativeDriver: true,
              }),
              Animated.timing(opacityAnim, {
                toValue: 0,
                duration: duration * 0.7,
                useNativeDriver: true,
              }),
            ]).start();
            break;

          case 'double':
            // Double flash
            Animated.sequence([
              // First flash
              Animated.timing(opacityAnim, {
                toValue: 0.8,
                duration: duration * 0.2,
                useNativeDriver: true,
              }),
              Animated.timing(opacityAnim, {
                toValue: 0,
                duration: duration * 0.3,
                useNativeDriver: true,
              }),
              // Pause
              Animated.delay(duration * 0.2),
              // Second flash
              Animated.timing(opacityAnim, {
                toValue: 0.8,
                duration: duration * 0.2,
                useNativeDriver: true,
              }),
              Animated.timing(opacityAnim, {
                toValue: 0,
                duration: duration * 0.3,
                useNativeDriver: true,
              }),
            ]).start();
            break;

          case 'triple':
            // Triple flash
            Animated.sequence([
              // First flash
              Animated.timing(opacityAnim, {
                toValue: 0.8,
                duration: duration * 0.15,
                useNativeDriver: true,
              }),
              Animated.timing(opacityAnim, {
                toValue: 0,
                duration: duration * 0.2,
                useNativeDriver: true,
              }),
              // Second flash
              Animated.timing(opacityAnim, {
                toValue: 0.8,
                duration: duration * 0.15,
                useNativeDriver: true,
              }),
              Animated.timing(opacityAnim, {
                toValue: 0,
                duration: duration * 0.2,
                useNativeDriver: true,
              }),
              // Third flash
              Animated.timing(opacityAnim, {
                toValue: 0.8,
                duration: duration * 0.15,
                useNativeDriver: true,
              }),
              Animated.timing(opacityAnim, {
                toValue: 0,
                duration: duration * 0.2,
                useNativeDriver: true,
              }),
            ]).start();
            break;

          case 'pulse':
            // Pulsing effect
            Animated.loop(
              Animated.sequence([
                Animated.parallel([
                  Animated.timing(opacityAnim, {
                    toValue: 0.6,
                    duration: duration * 0.5,
                    useNativeDriver: true,
                  }),
                  Animated.timing(scaleAnim, {
                    toValue: 1.1,
                    duration: duration * 0.5,
                    useNativeDriver: true,
                  }),
                ]),
                Animated.parallel([
                  Animated.timing(opacityAnim, {
                    toValue: 0,
                    duration: duration * 0.5,
                    useNativeDriver: true,
                  }),
                  Animated.timing(scaleAnim, {
                    toValue: 1,
                    duration: duration * 0.5,
                    useNativeDriver: true,
                  }),
                ]),
              ]),
              { iterations: 3 }
            ).start(() => {
              // Reset animations
              opacityAnim.setValue(0);
              scaleAnim.setValue(1);
            });
            break;
        }
      };

      runPattern();
    } else {
      // Reset animations when not active
      opacityAnim.setValue(0);
      scaleAnim.setValue(1);
    }
  }, [isActive, pattern, duration, opacityAnim, scaleAnim]);

  if (!isActive) return null;

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.flash,
          {
            backgroundColor: color,
            opacity: opacityAnim,
            transform: [{ scale: scaleAnim }],
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
    pointerEvents: 'none',
    zIndex: 1000,
  },
  flash: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width,
    height: height,
    alignItems: 'center',
    justifyContent: 'center',
  },
});