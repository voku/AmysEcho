
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { COLORS } from '../constants/ui';
import { spacing } from '../constants/spacing';
import typography from '../constants/typography';
import { useAccessibility } from './AccessibilityContext';
import { childFriendlyStyles } from '../styles/touchTargets';

const ROUTE_LABELS: Record<string, string> = {
  Recognition: 'Kamera',
  History: 'Verstehen',
  Lernen: 'Lernen',
};

const ROUTE_HINTS: Record<string, string> = {
  Recognition: 'Zur Gestenkamera wechseln',
  History: 'Letzte Gesten und Insights prüfen',
  Lernen: 'Trainings- und Lernbereich öffnen',
};

const ROUTE_ICONS: Record<string, string> = {
  Recognition: '🖐️',
  History: '💬',
  Lernen: '🧠',
};

const TAB_BAR_HEIGHT = 76;

type TabRoute = BottomTabBarProps['state']['routes'][number];

interface TabItem {
  route: TabRoute;
  label: string;
  icon: string;
  isFocused: boolean;
  onPress: () => void;
  hint: string | undefined;
}

const NewBottomNav: React.FC<BottomTabBarProps> = ({ state, descriptors, navigation }) => {
  const { highContrast, largeText } = useAccessibility();

  const containerStyle = [
    styles.container,
    {
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.neutral,
      borderColor: highContrast ? COLORS.highContrastText : 'transparent',
      shadowColor: highContrast ? COLORS.highContrastText : COLORS.shadow,
    },
  ];

  const inactiveColor = highContrast
    ? COLORS.highContrastText
    : 'rgba(255, 255, 255, 0.68)';
  const activeColor = highContrast
    ? COLORS.highContrastBackground
    : COLORS.actionPrimaryBackground;
  const activeBackground = highContrast ? COLORS.highContrastText : COLORS.actionSecondaryBackground;
  const rippleColor = highContrast ? COLORS.highContrastText : 'rgba(255, 255, 255, 0.22)';

  const items = useMemo<TabItem[]>(() => {
    return state.routes.map((route, index) => {
      const isFocused = state.index === index;
      const options = descriptors[route.key]?.options ?? {};
      const label =
        options.tabBarLabel?.toString() ??
        options.title ??
        ROUTE_LABELS[route.name] ??
        route.name;
      const icon = ROUTE_ICONS[route.name] ?? '⬤';
      const hint = ROUTE_HINTS[route.name];
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

      return { route, label, icon, isFocused, onPress, hint } satisfies TabItem;
    });
  }, [descriptors, navigation, state]);

  return (
    <View style={containerStyle}>
      {items.map(({ route, label, icon, isFocused, onPress, hint }) => (
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
          accessibilityLabel={label}
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
          {isFocused ? <View style={styles.activeIndicator} /> : null}
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
