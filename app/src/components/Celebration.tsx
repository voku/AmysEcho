import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useAccessibility } from './AccessibilityContext';
import { COLORS } from '../constants/ui';

interface CelebrationProps {
  visible: boolean;
}

export default function Celebration({ visible }: CelebrationProps) {
  const { largeText } = useAccessibility();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined;
    if (visible) {
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        timeout = setTimeout(() => {
          Animated.timing(opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }).start();
        }, 700);
      });
    } else {
      opacity.setValue(0);
    }
    return () => timeout && clearTimeout(timeout);
  }, [visible, opacity]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLabel="Gut gemacht!"
      style={[styles.overlay, { opacity }]}
    >
      <Text style={[styles.text, { fontSize: largeText ? 48 : 40 }]}>🎉</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: COLORS.primaryAccent,
  },
});
