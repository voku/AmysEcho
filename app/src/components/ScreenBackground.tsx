import React from 'react';
import { View, ScrollView, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccessibility } from './AccessibilityContext';
import { useTheme } from '../context/ThemeContext';
import { COLORS, SPACING } from '../constants/ui';

export interface ScreenBackgroundProps {
  children: React.ReactNode;
  scrollable?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export default function ScreenBackground({
  children,
  scrollable = false,
  contentContainerStyle,
  style,
  testID,
}: ScreenBackgroundProps) {
  const insets = useSafeAreaInsets();
  const { highContrast } = useAccessibility();
  const { theme } = useTheme();

  const gradientColors = highContrast
    ? ([COLORS.highContrastBackground, COLORS.highContrastBackground] as const)
    : ([
        theme.colors.gradientStart ?? COLORS.backgroundStart,
        theme.colors.gradientEnd ?? COLORS.backgroundEnd,
      ] as const);

  const basePadding: ViewStyle = {
    paddingTop: insets.top + SPACING.lg,
    paddingBottom: insets.bottom + SPACING.lg,
    paddingHorizontal: SPACING.lg,
  };

  if (scrollable) {
    return (
      <LinearGradient colors={gradientColors} style={styles.gradient}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[basePadding, styles.scrollContainer, contentContainerStyle]}
          testID={testID}
        >
          {children}
        </ScrollView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={gradientColors} style={styles.gradient}>
      <View style={[styles.flex, basePadding, style]} testID={testID}>
        {children}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
  },
});
