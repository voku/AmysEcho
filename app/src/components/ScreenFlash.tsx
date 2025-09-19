import React, { useEffect, useRef } from 'react';
import { View, Animated, Dimensions } from 'react-native';
import { COLORS } from '../constants/ui';
import { ScreenFlashPattern } from '../hooks/useRecognitionState';

interface ScreenFlashProps {
  isActive: boolean;
  pattern?: ScreenFlashPattern;
  color?: string;
  duration?: number;
  intensity?: 'subtle' | 'normal' | 'intense';
}

export default function ScreenFlash({
  isActive,
  pattern = ScreenFlashPattern.Single,
  color = COLORS.primaryAccent,
  duration = 300,
  intensity = 'normal'
}: ScreenFlashProps) {
  const { width, height } = Dimensions.get('window');

  const styles = React.useMemo(() => ({
    container: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      pointerEvents: 'none' as const,
      zIndex: 1000,
    },
    flash: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      width: width,
      height: height,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
  }), [width, height]);
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isActive) {
      // Adjust opacity based on intensity
      const maxOpacity = intensity === 'subtle' ? 0.4 : intensity === 'intense' ? 1.0 : 0.8;

      const runPattern = () => {
        switch (pattern) {
          case ScreenFlashPattern.Single:
            // Single flash
            Animated.sequence([
              Animated.timing(opacityAnim, {
                toValue: maxOpacity,
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

          case ScreenFlashPattern.Double:
            // Double flash
            Animated.sequence([
              // First flash
              Animated.timing(opacityAnim, {
                toValue: maxOpacity,
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
                toValue: maxOpacity,
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

          case ScreenFlashPattern.Triple:
            // Triple flash
            Animated.sequence([
              // First flash
              Animated.timing(opacityAnim, {
                toValue: maxOpacity,
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
                toValue: maxOpacity,
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
                toValue: maxOpacity,
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

          case ScreenFlashPattern.Pulse:
            // Pulsing effect
            Animated.loop(
              Animated.sequence([
                Animated.parallel([
                  Animated.timing(opacityAnim, {
                    toValue: maxOpacity * 0.75,
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

          case ScreenFlashPattern.Ripple:
            // Ripple effect expanding outward
            Animated.sequence([
              Animated.parallel([
                Animated.timing(opacityAnim, {
                  toValue: maxOpacity,
                  duration: duration * 0.3,
                  useNativeDriver: true,
                }),
                Animated.timing(scaleAnim, {
                  toValue: 1.5,
                  duration: duration,
                  useNativeDriver: true,
                }),
              ]),
              Animated.timing(opacityAnim, {
                toValue: 0,
                duration: duration * 0.7,
                useNativeDriver: true,
              }),
            ]).start(() => {
              scaleAnim.setValue(1);
            });
            break;

          case ScreenFlashPattern.Wave:
            // Wave-like pulsing
            Animated.sequence([
              Animated.timing(opacityAnim, {
                toValue: maxOpacity * 0.3,
                duration: duration * 0.2,
                useNativeDriver: true,
              }),
              Animated.timing(opacityAnim, {
                toValue: maxOpacity * 0.8,
                duration: duration * 0.3,
                useNativeDriver: true,
              }),
              Animated.timing(opacityAnim, {
                toValue: maxOpacity * 0.5,
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

          case ScreenFlashPattern.Heartbeat:
            // Heartbeat-like double pulse
            Animated.sequence([
              // First beat
              Animated.timing(opacityAnim, {
                toValue: maxOpacity,
                duration: duration * 0.15,
                useNativeDriver: true,
              }),
              Animated.timing(opacityAnim, {
                toValue: 0,
                duration: duration * 0.1,
                useNativeDriver: true,
              }),
              // Quick second beat
              Animated.timing(opacityAnim, {
                toValue: maxOpacity * 0.7,
                duration: duration * 0.1,
                useNativeDriver: true,
              }),
              Animated.timing(opacityAnim, {
                toValue: 0,
                duration: duration * 0.4,
                useNativeDriver: true,
              }),
              // Pause
              Animated.delay(duration * 0.25),
              // Repeat
              Animated.timing(opacityAnim, {
                toValue: maxOpacity,
                duration: duration * 0.15,
                useNativeDriver: true,
              }),
              Animated.timing(opacityAnim, {
                toValue: 0,
                duration: duration * 0.1,
                useNativeDriver: true,
              }),
              Animated.timing(opacityAnim, {
                toValue: maxOpacity * 0.7,
                duration: duration * 0.1,
                useNativeDriver: true,
              }),
              Animated.timing(opacityAnim, {
                toValue: 0,
                duration: duration * 0.4,
                useNativeDriver: true,
              }),
            ]).start();
            break;

          case ScreenFlashPattern.Success:
            // Success pattern - green celebratory flash
            Animated.sequence([
              Animated.timing(opacityAnim, {
                toValue: maxOpacity,
                duration: duration * 0.2,
                useNativeDriver: true,
              }),
              Animated.parallel([
                Animated.timing(opacityAnim, {
                  toValue: maxOpacity * 0.8,
                  duration: duration * 0.3,
                  useNativeDriver: true,
                }),
                Animated.timing(scaleAnim, {
                  toValue: 1.2,
                  duration: duration * 0.3,
                  useNativeDriver: true,
                }),
              ]),
              Animated.timing(opacityAnim, {
                toValue: 0,
                duration: duration * 0.5,
                useNativeDriver: true,
              }),
            ]).start(() => {
              scaleAnim.setValue(1);
            });
            break;

          case ScreenFlashPattern.Warning:
            // Warning pattern - amber caution flash
            Animated.sequence([
              Animated.timing(opacityAnim, {
                toValue: maxOpacity * 0.6,
                duration: duration * 0.4,
                useNativeDriver: true,
              }),
              Animated.timing(opacityAnim, {
                toValue: 0,
                duration: duration * 0.3,
                useNativeDriver: true,
              }),
              Animated.delay(duration * 0.2),
              Animated.timing(opacityAnim, {
                toValue: maxOpacity * 0.6,
                duration: duration * 0.4,
                useNativeDriver: true,
              }),
              Animated.timing(opacityAnim, {
                toValue: 0,
                duration: duration * 0.3,
                useNativeDriver: true,
              }),
            ]).start();
            break;

          case ScreenFlashPattern.Error:
            // Error pattern - red urgent flash
            Animated.sequence([
              Animated.timing(opacityAnim, {
                toValue: maxOpacity,
                duration: duration * 0.1,
                useNativeDriver: true,
              }),
              Animated.timing(opacityAnim, {
                toValue: 0,
                duration: duration * 0.1,
                useNativeDriver: true,
              }),
              Animated.timing(opacityAnim, {
                toValue: maxOpacity,
                duration: duration * 0.1,
                useNativeDriver: true,
              }),
              Animated.timing(opacityAnim, {
                toValue: 0,
                duration: duration * 0.7,
                useNativeDriver: true,
              }),
            ]).start();
            break;
        }
      };

      runPattern();
    } else {
      // Reset animations when not active
      opacityAnim.setValue(0);
      scaleAnim.setValue(1);
    }
  }, [isActive, pattern, duration, opacityAnim, scaleAnim, intensity]);

  if (!isActive) return null;

  return (
    <View style={styles.container} testID="screen-flash-container">
      <Animated.View
        style={[
          styles.flash,
          {
            backgroundColor: color,
            opacity: opacityAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
        testID="screen-flash-overlay"
      />
    </View>
  );
}

