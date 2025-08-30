import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useAccessibility } from './AccessibilityContext';
import { COLORS } from '../constants/ui';
import { LanguageManager } from '../services/LanguageManager';

export const CELEBRATION_DURATION_MS = 200 + 700 + 300;

export default function Celebration() {
  const { largeText } = useAccessibility();
  const opacity = useRef(new Animated.Value(0)).current;

  const animation = useMemo(
    () =>
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.delay(700),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    [opacity],
  );

  useEffect(() => {
    animation.start();

    return () => {
      animation.stop();
    };
  }, [animation]);

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLabel={LanguageManager.t('celebration.label')}
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
