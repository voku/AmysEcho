import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAccessibility } from './AccessibilityContext';
import { COLORS, SPACING } from '../constants/ui';

export default function LoadingIndicator() {
  const { highContrast, largeText } = useAccessibility();
  const color = highContrast ? COLORS.highContrastText : COLORS.primaryAccent;
  const fontSize = largeText ? 18 : 16;
  return (
    <View style={styles.container}>
      <ActivityIndicator
        size="large"
        color={color}
        accessibilityRole="progressbar"
        accessibilityLabel="Wird geladen"
      />
      <Text style={[styles.text, highContrast && styles.textHC, { fontSize }]}>Wird geladen...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.md,
  },
  text: {
    marginTop: SPACING.md,
    color: COLORS.text,
  },
  textHC: {
    color: COLORS.highContrastText,
  },
});
