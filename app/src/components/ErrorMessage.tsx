import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAccessibility } from './AccessibilityContext';
import { SPACING, COLORS, DEFAULT_RADIUS } from '../constants/ui';

interface ErrorMessageProps {
  message: string | null;
}

export default function ErrorMessage({ message }: ErrorMessageProps) {
  const { largeText } = useAccessibility();
  if (!message) return null;
  return (
    <View style={styles.overlay} pointerEvents="none">
      <Text style={[styles.text, { fontSize: largeText ? 16 : 14 }]}>⚠️ {message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: SPACING.md,
    left: SPACING.md,
    right: SPACING.md,
    backgroundColor: `${COLORS.warning}B3`,
    padding: SPACING.sm,
    borderRadius: DEFAULT_RADIUS,
  },
  text: {
    color: COLORS.highContrastText,
    textAlign: 'center',
  },
});
