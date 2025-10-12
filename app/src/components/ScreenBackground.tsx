import React from 'react';
import { View, ScrollView, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccessibility } from './AccessibilityContext';
import { useTheme } from '../context/ThemeContext';
import { COLORS, SPACING } from '../constants/ui';
import { LinearGradient } from 'expo-linear-gradient';

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

type EdgePadding = {
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
};

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
  const { gradientStart, gradientEnd, background } = theme.colors;

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
      top: insets.top + SPACING.xl,
      bottom: insets.bottom + SPACING.xl,
      left: SPACING.xl,
      right: SPACING.xl,
    }),
    [insets.bottom, insets.top],
  );

  const mergeSafePadding = React.useCallback(
    (
      incomingStyle?: StyleProp<ViewStyle>,
    ): { mergedPadding: EdgePadding; rest: ViewStyle | undefined } => {
      const safeDefaults: EdgePadding = {
        paddingTop: safeAreaPadding.top,
        paddingBottom: safeAreaPadding.bottom,
        paddingLeft: safeAreaPadding.left,
        paddingRight: safeAreaPadding.right,
      };

      if (!incomingStyle) {
        return { mergedPadding: safeDefaults, rest: undefined };
      }

      const flattened = StyleSheet.flatten(incomingStyle) as ViewStyle | undefined;

      if (!flattened) {
        return { mergedPadding: safeDefaults, rest: undefined };
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
        ...values: unknown[]
      ): number | string | undefined =>
        values.find(
          (value): value is number | string =>
            typeof value === 'number' || typeof value === 'string',
        );

      const clampPadding = (
        edge: keyof typeof safeAreaPadding,
        value: number | string | undefined,
      ): number => {
        if (typeof value === 'number') {
          return Math.max(safeAreaPadding[edge], value);
        }

        if (__DEV__ && typeof value === 'string') {
          console.warn(
            `ScreenBackground is ignoring string padding "${value}" for ${edge} to preserve safe-area spacing.`,
          );
        }

        return safeAreaPadding[edge];
      };

      const mergedPadding: EdgePadding = {
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

      const restStyle = Object.keys(rest).length > 0 ? (rest as ViewStyle) : undefined;

      return {
        mergedPadding,
        rest: restStyle,
      };
    },
    [safeAreaPadding],
  );

  const mergedContainerStyle = React.useMemo(
    () => mergeSafePadding(style),
    [mergeSafePadding, style],
  );

  const mergedContentStyle = React.useMemo(
    () => mergeSafePadding(contentContainerStyle),
    [contentContainerStyle, mergeSafePadding],
  );

  const scrollContentPadding = React.useMemo<EdgePadding>(
    () => ({
      paddingTop: Math.max(
        mergedContainerStyle.mergedPadding.paddingTop,
        mergedContentStyle.mergedPadding.paddingTop,
      ),
      paddingBottom: Math.max(
        mergedContainerStyle.mergedPadding.paddingBottom,
        mergedContentStyle.mergedPadding.paddingBottom,
      ),
      paddingLeft: Math.max(
        mergedContainerStyle.mergedPadding.paddingLeft,
        mergedContentStyle.mergedPadding.paddingLeft,
      ),
      paddingRight: Math.max(
        mergedContainerStyle.mergedPadding.paddingRight,
        mergedContentStyle.mergedPadding.paddingRight,
      ),
    }),
    [mergedContainerStyle.mergedPadding, mergedContentStyle.mergedPadding],
  );

  const contentStyle = React.useMemo<StyleProp<ViewStyle>>(() => {
    if (mergedContentStyle.rest) {
      return [styles.scrollContainer, mergedContentStyle.rest, scrollContentPadding];
    }

    return [styles.scrollContainer, scrollContentPadding];
  }, [mergedContentStyle, scrollContentPadding]);

  const containerStyle = React.useMemo<StyleProp<ViewStyle>>(() => {
    if (mergedContainerStyle.rest) {
      return [
        styles.flex,
        mergedContainerStyle.rest,
        mergedContainerStyle.mergedPadding,
      ];
    }

    return [styles.flex, mergedContainerStyle.mergedPadding];
  }, [mergedContainerStyle]);

  const scrollViewStyle = React.useMemo<StyleProp<ViewStyle>>(() => {
    if (mergedContainerStyle.rest) {
      return [styles.flex, mergedContainerStyle.rest];
    }

    return styles.flex;
  }, [mergedContainerStyle.rest]);

  if (scrollable) {
    return (
      <LinearGradient
        colors={gradientColors}
        style={[styles.gradient, { backgroundColor: background }]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.9, y: 1 }}
      >
        <ScrollView
          style={scrollViewStyle}
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
    <LinearGradient
      colors={gradientColors}
      style={[styles.gradient, { backgroundColor: background }]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.9, y: 1 }}
    >
      <View style={containerStyle} testID={testID}>
        {children}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
    paddingHorizontal: 0,
  },
  flex: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
  },
});
