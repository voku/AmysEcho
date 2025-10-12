
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { COLORS } from '../constants/ui';
import { spacing } from '../constants/spacing';
import typography from '../constants/typography';
import { useAccessibility } from './AccessibilityContext';
import { childFriendlyStyles } from '../styles/touchTargets';
import { useTheme } from '../context/ThemeContext';
import {
  WORKFLOW_STEP_BY_ROUTE,
  type WorkflowRouteName,
} from '../constants/workflow';

const TAB_BAR_HEIGHT = 76;

type TabRoute = BottomTabBarProps['state']['routes'][number];

interface TabItem {
  route: TabRoute;
  label: string;
  icon: string;
  isFocused: boolean;
  onPress: () => void;
  hint: string | undefined;
  accessibilityLabel: string;
}

const NewBottomNav: React.FC<BottomTabBarProps> = ({ state, descriptors, navigation }) => {
  const { highContrast, largeText } = useAccessibility();
  const { theme } = useTheme();

  const themeColors = theme.colors;
  const containerBackground = highContrast
    ? COLORS.highContrastBackground
    : themeColors.themePrimary ?? COLORS.neutral;
  const activeBackground = highContrast
    ? COLORS.highContrastText
    : themeColors.themeSecondary ?? COLORS.actionSecondaryBackground;
  const activeColor = highContrast
    ? COLORS.highContrastBackground
    : themeColors.surface ?? COLORS.actionPrimaryBackground;
  const indicatorColor = highContrast
    ? COLORS.highContrastBackground
    : themeColors.themeAccent ?? COLORS.actionPrimaryBackground;
  const inactiveColor = highContrast ? COLORS.highContrastText : COLORS.overlayTextSoft;
  const rippleColor = highContrast ? COLORS.highContrastText : COLORS.overlaySurface;

  const containerStyle = [
    styles.container,
    {
      backgroundColor: containerBackground,
      borderColor: highContrast ? COLORS.highContrastText : 'transparent',
      shadowColor: highContrast ? COLORS.highContrastText : COLORS.shadow,
    },
  ];

  const items = useMemo<TabItem[]>(() => {
    return state.routes.map((route, index) => {
      const isFocused = state.index === index;
      const options = descriptors[route.key]?.options ?? {};
      const workflowMeta = WORKFLOW_STEP_BY_ROUTE[route.name as WorkflowRouteName];
      const label =
        options.tabBarLabel?.toString() ??
        options.title ??
        workflowMeta?.label ??
        route.name;
      const icon = workflowMeta?.icon ?? '⬤';
      const hint = workflowMeta?.accessibilityHint;
      const accessibilityLabel =
        options.tabBarAccessibilityLabel?.toString() ??
        workflowMeta?.accessibilityLabel ??
        label;
      const params = state.routes[index]?.params;

      const onPress = () => {
        const event = navigation.emit({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
        });

        if (!isFocused && !event.defaultPrevented) {
          navigation.navigate(route.name, params);
        }
      };

      return { route, label, icon, isFocused, onPress, hint, accessibilityLabel } satisfies TabItem;
    });
  }, [descriptors, navigation, state]);

  return (
    <View style={containerStyle}>
      {items.map(({ route, label, icon, isFocused, onPress, hint, accessibilityLabel }) => (
        <Pressable
          key={route.key}
          onPress={onPress}
          style={({ pressed }) => [
            childFriendlyStyles.minTouchTarget,
            styles.tab,
            isFocused && [styles.tabActive, { backgroundColor: activeBackground }],
            pressed && (highContrast ? styles.tabPressedHighContrast : styles.tabPressed),
          ]}
          accessibilityRole="tab"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={hint}
          accessibilityState={{ selected: isFocused }}
          android_ripple={{ color: rippleColor }}
        >
          <Text
            style={[
              styles.icon,
              { color: isFocused ? activeColor : inactiveColor },
              largeText && styles.iconLarge,
            ]}
          >
            {icon}
          </Text>
          <Text
            style={[
              styles.label,
              largeText && styles.labelLarge,
              { color: isFocused ? activeColor : inactiveColor },
              isFocused && styles.labelActive,
            ]}
          >
            {label}
          </Text>
          {isFocused ? <View style={[styles.activeIndicator, { backgroundColor: indicatorColor }]} /> : null}
        </Pressable>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 10,
    height: TAB_BAR_HEIGHT,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: 24,
    minHeight: 56,
    position: 'relative',
  },
  tabActive: {
    backgroundColor: COLORS.actionSecondaryBackground,
  },
  tabPressed: {
    opacity: 0.92,
  },
  tabPressedHighContrast: {
    opacity: 0.85,
  },
  icon: {
    fontSize: typography.sizes.titleSm,
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.medium,
    color: COLORS.text,
  },
  labelLarge: {
    fontSize: typography.sizes.body,
  },
  iconLarge: {
    fontSize: typography.sizes.title,
  },
  labelActive: {
    fontWeight: typography.weights.semibold,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: spacing.xs,
    width: 18,
    height: 4,
    borderRadius: 999,
    backgroundColor: COLORS.actionPrimaryBackground,
  },
});

export default NewBottomNav;
