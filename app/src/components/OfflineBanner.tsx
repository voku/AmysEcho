import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../constants/ui';
import { useAccessibility } from './AccessibilityContext';

interface Props {
  visible: boolean;
}

export default function OfflineBanner({ visible }: Props) {
  const { highContrast, largeText } = useAccessibility();
  if (!visible) return null;
  return (
    <View
      style={[styles.container, highContrast && styles.containerHC]}
      pointerEvents="none"
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel="Offline mode"
    >
      <Text
        style={[styles.text, highContrast && styles.textHC, { fontSize: largeText ? 16 : 14 }]}
      >
        Offline mode
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.warningBackground,
    padding: SPACING.sm,
    alignItems: 'center',
    zIndex: 1,
  },
  containerHC: {
    backgroundColor: COLORS.highContrastBackground,
  },
  text: {
    fontWeight: 'bold',
  },
  textHC: {
    color: COLORS.highContrastText,
  },
});
