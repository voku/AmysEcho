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
  /**
   * Additional styles for the scrollable content wrapper. To guarantee safe-area spacing,
   * only numeric padding overrides are supported; string-based paddings will be ignored in
   * favour of the safe default.
   */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /**
   * Extra styles for the root container. Numeric padding overrides are clamped so the safe
   * area inset cannot be reduced. String padding values are ignored to preserve safe padding.
   */
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

  const safeAreaPadding = React.useMemo(
    () => ({
      top: insets.top + SPACING.lg,
      bottom: insets.bottom + SPACING.lg,
      left: SPACING.lg,
      right: SPACING.lg,
    }),
    [insets.bottom, insets.top],
  );

  const mergeSafePadding = React.useCallback(
    (incomingStyle?: StyleProp<ViewStyle>) => {
      const safeDefaults: ViewStyle = {
        paddingTop: safeAreaPadding.top,
        paddingBottom: safeAreaPadding.bottom,
        paddingLeft: safeAreaPadding.left,
        paddingRight: safeAreaPadding.right,
      };

      if (!incomingStyle) {
        return { mergedPadding: safeDefaults };
      }

      const flattened = StyleSheet.flatten(incomingStyle) as ViewStyle | undefined;

      if (!flattened) {
        return { mergedPadding: safeDefaults };
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

      const resolveEdge = (
        direct?: unknown,
        axis?: unknown,
        shorthand?: unknown,
      ): number | string | undefined => {
        if (typeof direct === 'number' || typeof direct === 'string') {
          return direct;
        }

        if (typeof axis === 'number' || typeof axis === 'string') {
          return axis;
        }

        if (typeof shorthand === 'number' || typeof shorthand === 'string') {
          return shorthand;
        }

        return undefined;
      };

      const clampPadding = (
        edge: keyof typeof safeAreaPadding,
        value: number | string | undefined,
      ): number => {
        if (typeof value === 'number') {
          return Math.max(safeAreaPadding[edge], value);
        }

        if (__DEV__ && typeof value === 'string') {
          console.warn(
            `ScreenBackground ignoriert das Zeichenketten-Polster "${value}" für ${edge}, um den Safe-Area-Abstand zu bewahren.`,
          );
        }

        return safeAreaPadding[edge];
      };

      const mergedPadding: ViewStyle = {
        paddingTop: clampPadding('top', resolveEdge(paddingTop, paddingVertical, padding)),
        paddingBottom: clampPadding(
          'bottom',
          resolveEdge(paddingBottom, paddingVertical, padding),
        ),
        paddingLeft: clampPadding(
          'left',
          resolveEdge(paddingLeft, paddingHorizontal, padding),
        ),
        paddingRight: clampPadding(
          'right',
          resolveEdge(paddingRight, paddingHorizontal, padding),
        ),
      };

      return {
        mergedPadding,
        rest: Object.keys(rest).length > 0 ? rest : undefined,
      };
    },
    [safeAreaPadding],
  );

  const contentStyle = React.useMemo(() => {
    const { mergedPadding, rest } = mergeSafePadding(contentContainerStyle);

    if (rest) {
      return [styles.scrollContainer, rest, mergedPadding];
    }

    return [styles.scrollContainer, mergedPadding];
  }, [contentContainerStyle, mergeSafePadding]);

  const containerStyle = React.useMemo(() => {
    const { mergedPadding, rest } = mergeSafePadding(style);

    if (rest) {
      return [styles.flex, rest, mergedPadding];
    }

    return [styles.flex, mergedPadding];
  }, [mergeSafePadding, style]);

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
      <View style={containerStyle} testID={testID}>
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
