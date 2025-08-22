import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../constants/ui';
import { useAccessibility } from './AccessibilityContext';

interface Props {
  visible: boolean;
}

export default function OfflineBanner({ visible }: Props) {
  const insets = useSafeAreaInsets();
  const { highContrast, largeText } = useAccessibility();
  if (!visible) return null;
  return (
    <View
      style={[
        styles.container,
        highContrast && styles.containerHC,
        { paddingTop: insets.top },
      ]}
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
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
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.sm,
    alignItems: 'center',
    zIndex: 1,
    elevation: 2,
  },
  containerHC: {
    backgroundColor: COLORS.highContrastBackground,
  },
  text: {
    fontWeight: 'bold',
    color: COLORS.text,
  },
  textHC: {
    color: COLORS.highContrastText,
  },
});
