import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAccessibility } from './AccessibilityContext';
import { COLORS, SPACING } from '../constants/ui';

type LoadingIndicatorProps = {
  label?: string;
  fullscreen?: boolean;
};

export default function LoadingIndicator({
  label = 'Wird geladen...',
  fullscreen = true,
}: LoadingIndicatorProps) {
  const { highContrast, largeText } = useAccessibility();
  const color = highContrast ? COLORS.highContrastText : COLORS.primaryAccent;
  const fontSize = largeText ? 18 : 16;
  const accessibilityLabel = label.replace(/\.\.\.$/, '');
  return (
    <View style={[styles.container, fullscreen && styles.fullscreen]}>
      <ActivityIndicator
        size="large"
        color={color}
        accessibilityRole="progressbar"
        accessibilityLabel={accessibilityLabel}
      />
      <Text style={[styles.text, highContrast && styles.textHC, { fontSize }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.md,
  },
  fullscreen: {
    flex: 1,
  },
  text: {
    marginTop: SPACING.md,
    color: COLORS.text,
  },
  textHC: {
    color: COLORS.highContrastText,
  },
});
