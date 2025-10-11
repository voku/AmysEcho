
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Colors from '../constants/colors';
import { spacing } from '../constants/spacing';
import typography from '../constants/typography';

const ROUTE_LABELS: Record<string, string> = {
  Recognition: 'Kamera',
  History: 'Verlauf',
  Lernen: 'Lernen',
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
}

const NewBottomNav: React.FC<BottomTabBarProps> = ({ state, descriptors, navigation }) => {
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

      const onPress = () => {
        const event = navigation.emit({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
        });

        if (!isFocused && !event.defaultPrevented) {
          navigation.navigate(route.name);
        }
      };

      return { route, label, icon, isFocused, onPress } satisfies TabItem;
    });
  }, [descriptors, navigation, state]);

  return (
    <View style={styles.container}>
      {items.map(({ route, label, icon, isFocused, onPress }) => (
        <Pressable
          key={route.key}
          onPress={onPress}
          style={({ pressed }) => [
            styles.tab,
            isFocused && styles.tabActive,
            pressed && styles.tabPressed,
          ]}
          accessibilityRole="tab"
          accessibilityLabel={label}
          accessibilityState={{ selected: isFocused }}
          android_ripple={{ color: Colors.overlay }}
        >
          <Text style={[styles.icon, isFocused && styles.iconActive]}>{icon}</Text>
          <Text style={[styles.label, isFocused && styles.labelActive]}>{label}</Text>
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
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    shadowColor: Colors.shadow,
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
    backgroundColor: Colors.primary,
  },
  tabPressed: {
    opacity: 0.85,
  },
  icon: {
    fontSize: typography.sizes.subtitle,
    color: Colors.text,
    marginBottom: spacing.xs,
  },
  iconActive: {
    color: Colors.inverseText,
  },
  label: {
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.medium as any,
    color: Colors.text,
  },
  labelActive: {
    color: Colors.inverseText,
    fontWeight: typography.weights.semibold as any,
  },
});

export default NewBottomNav;
