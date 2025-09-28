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
  const { gradientStart, gradientEnd } = theme.colors;

  const gradientColors = React.useMemo(
    () =>
      highContrast
        ? ([COLORS.highContrastBackground, COLORS.highContrastBackground] as const)
        : ([
            gradientStart ?? COLORS.backgroundStart,
            gradientEnd ?? COLORS.backgroundEnd,
          ] as const),
    [gradientEnd, gradientStart, highContrast],
  );

  const basePadding: ViewStyle = React.useMemo(
    () => ({
      paddingTop: insets.top + SPACING.lg,
      paddingBottom: insets.bottom + SPACING.lg,
      paddingHorizontal: SPACING.lg,
    }),
    [insets.bottom, insets.top],
  );

  const contentStyle = React.useMemo(() => {
    const basePaddingTop =
      typeof basePadding.paddingTop === 'number' ? basePadding.paddingTop : 0;
    const basePaddingBottom =
      typeof basePadding.paddingBottom === 'number' ? basePadding.paddingBottom : 0;
    const basePaddingHorizontal =
      typeof basePadding.paddingHorizontal === 'number'
        ? basePadding.paddingHorizontal
        : 0;

    const safeDefaults: ViewStyle = {
      paddingTop: basePaddingTop,
      paddingBottom: basePaddingBottom,
      paddingLeft: basePaddingHorizontal,
      paddingRight: basePaddingHorizontal,
    };

    if (!contentContainerStyle) {
      return [styles.scrollContainer, safeDefaults];
    }

    const flattened = StyleSheet.flatten(contentContainerStyle) as
      | ViewStyle
      | undefined;

    if (!flattened) {
      return [styles.scrollContainer, safeDefaults];
    }

    const {
      padding,
      paddingVertical,
      paddingHorizontal,
      paddingTop,
      paddingBottom,
      paddingLeft,
      paddingRight,
      ...rest
    } = flattened;

    const resolvedTop =
      typeof paddingTop === 'number'
        ? paddingTop
        : typeof paddingVertical === 'number'
        ? paddingVertical
        : typeof padding === 'number'
        ? padding
        : undefined;

    const resolvedBottom =
      typeof paddingBottom === 'number'
        ? paddingBottom
        : typeof paddingVertical === 'number'
        ? paddingVertical
        : typeof padding === 'number'
        ? padding
        : undefined;

    const resolvedLeft =
      typeof paddingLeft === 'number'
        ? paddingLeft
        : typeof paddingHorizontal === 'number'
        ? paddingHorizontal
        : typeof padding === 'number'
        ? padding
        : undefined;

    const resolvedRight =
      typeof paddingRight === 'number'
        ? paddingRight
        : typeof paddingHorizontal === 'number'
        ? paddingHorizontal
        : typeof padding === 'number'
        ? padding
        : undefined;

    const mergedPadding: ViewStyle = {
      paddingTop: Math.max(basePaddingTop, resolvedTop ?? basePaddingTop),
      paddingBottom: Math.max(
        basePaddingBottom,
        resolvedBottom ?? basePaddingBottom,
      ),
      paddingLeft: Math.max(basePaddingHorizontal, resolvedLeft ?? basePaddingHorizontal),
      paddingRight: Math.max(
        basePaddingHorizontal,
        resolvedRight ?? basePaddingHorizontal,
      ),
    };

    return [styles.scrollContainer, rest, mergedPadding];
  }, [basePadding, contentContainerStyle]);

  if (scrollable) {
    return (
      <LinearGradient colors={gradientColors} style={styles.gradient}>
        <ScrollView
          style={[styles.flex, style]}
          contentContainerStyle={contentStyle}
          keyboardShouldPersistTaps="handled"
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
