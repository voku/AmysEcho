
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
  History: 'Verlauf',
  Lernen: 'Lernen',
};

const ROUTE_HINTS: Record<string, string> = {
  Recognition: 'Zurück zur Gestenerkennung',
  History: 'Gestenverlauf und Ereignisse ansehen',
  Lernen: 'Gesten aufnehmen oder üben',
};

const ROUTE_ICONS: Record<string, string> = {
  Recognition: '📷',
  History: '🕒',
  Lernen: '🎓',
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
      backgroundColor: highContrast ? COLORS.highContrastBackground : '#0F3A3B',
      borderColor: highContrast ? COLORS.highContrastText : 'transparent',
      shadowColor: highContrast ? COLORS.highContrastText : COLORS.shadow,
    },
  ];

  const inactiveColor = highContrast ? COLORS.highContrastText : '#FFFFFF';
  const activeColor = highContrast ? COLORS.highContrastBackground : '#FFFFFF';
  const activeBackground = highContrast ? COLORS.highContrastText : '#25706F';
  const rippleColor = highContrast ? COLORS.highContrastText : 'rgba(255, 255, 255, 0.16)';

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
    minHeight: 48,
  },
  tabActive: {
    backgroundColor: '#25706F',
  },
  tabPressed: {
    opacity: 0.92,
  },
  tabPressedHighContrast: {
    opacity: 0.85,
  },
  icon: {
    fontSize: typography.sizes.subtitle,
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
    fontSize: typography.sizes.titleSm,
  },
  labelActive: {
    fontWeight: typography.weights.semibold,
  },
});

export default NewBottomNav;
