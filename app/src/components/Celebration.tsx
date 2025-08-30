import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useAccessibility } from './AccessibilityContext';
import { COLORS } from '../constants/ui';
import { LanguageManager } from '../services/LanguageManager';

interface CelebrationProps {
  visible: boolean;
}

export default function Celebration({ visible }: CelebrationProps) {
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
    if (visible) {
      opacity.setValue(0);
      animation.start();
    } else {
      animation.stop();
      opacity.setValue(0);
    }

    return () => {
      animation.stop();
    };
  }, [visible, animation, opacity]);

  if (!visible) return null;

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
