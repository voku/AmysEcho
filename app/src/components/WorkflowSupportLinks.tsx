import React, { useCallback } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAccessibility } from './AccessibilityContext';
import { COLORS } from '../constants/ui';
import { spacing } from '../constants/spacing';
import typography from '../constants/typography';
import type { RootStackParamList } from '../navigation/types';
import { ROOT_STACK_ROUTES } from '../navigation/types';
import type { WorkflowSupportDestination } from '../constants/workflow';
import { WORKFLOW_SUPPORT_DESTINATIONS } from '../constants/workflow';
import type { StackNavigationProp } from '@react-navigation/stack';

export type WorkflowSupportLinksTone = 'light' | 'dark';

interface WorkflowSupportLinksProps {
  tone?: WorkflowSupportLinksTone;
  style?: StyleProp<ViewStyle>;
}

type Navigation = StackNavigationProp<RootStackParamList>;

const WorkflowSupportLinks: React.FC<WorkflowSupportLinksProps> = ({ tone = 'light', style }) => {
  const navigation = useNavigation<Navigation>();
  const { highContrast, largeText } = useAccessibility();

  const containerStyles = [
    styles.container,
    tone === 'dark' ? styles.containerDark : styles.containerLight,
    highContrast && styles.containerHighContrast,
    style,
  ];

  const secondaryTextColor = highContrast
    ? COLORS.highContrastText
    : tone === 'dark'
      ? COLORS.overlayText
      : COLORS.textSecondary;

  const handleNavigate = useCallback(
    (destination: WorkflowSupportDestination) => {
      const { route, params } = destination.navigationTarget;

      switch (route) {
        case ROOT_STACK_ROUTES.ParentalGate:
          navigation.navigate(route, params, { pop: true });
          break;
        case ROOT_STACK_ROUTES.Help:
          navigation.navigate(route, undefined, { pop: true });
          break;
        default: {
          const _exhaustiveCheck: never = route;
          if (__DEV__) {
            console.warn('Unhandled support route:', _exhaustiveCheck);
          }
        }
      }
    },
    [navigation],
  );

  return (
    <View style={containerStyles} accessibilityRole="menu" accessibilityLabel="Schnellzugriff">
      <Text
        style={[
          styles.heading,
          { color: highContrast ? COLORS.highContrastText : COLORS.neutral },
          largeText && styles.headingLarge,
        ]}
      >
        Schnellzugriff
      </Text>
      <Text
        style={[
          styles.subtitle,
          { color: secondaryTextColor },
          largeText && styles.subtitleLarge,
        ]}
      >
        Wichtige Bereiche direkt öffnen.
      </Text>
      <View style={styles.linksWrapper}>
        {WORKFLOW_SUPPORT_DESTINATIONS.map((destination) => (
          <Pressable
            key={destination.key}
            style={({ pressed }) => [
              styles.chip,
              tone === 'dark' ? styles.chipDark : styles.chipLight,
              highContrast && styles.chipHighContrast,
              pressed && (highContrast ? styles.chipPressedHighContrast : styles.chipPressed),
            ]}
            android_ripple={{ color: highContrast ? COLORS.highContrastText : COLORS.overlaySurfaceMuted }}
            accessibilityRole="button"
            accessibilityLabel={destination.accessibilityLabel ?? destination.title}
            accessibilityHint={destination.accessibilityHint}
            onPress={() => handleNavigate(destination)}
          >
            <Text
              style={[
                styles.icon,
                largeText && styles.iconLarge,
                { color: highContrast ? COLORS.highContrastText : COLORS.primaryAccent },
              ]}
            >
              {destination.icon}
            </Text>
            <Text
              style={[
                styles.chipLabel,
                largeText && styles.chipLabelLarge,
                { color: highContrast ? COLORS.highContrastText : COLORS.neutral },
              ]}
            >
              {destination.title}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 24,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  containerLight: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.overlayBorder,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  containerDark: {
    backgroundColor: COLORS.overlayBadgeBackground,
    borderWidth: 1,
    borderColor: COLORS.overlayBorder,
  },
  containerHighContrast: {
    backgroundColor: COLORS.highContrastBackground,
    borderColor: COLORS.highContrastText,
  },
  heading: {
    fontSize: typography.sizes.subtitle,
    fontWeight: typography.weights.semibold as any,
  },
  headingLarge: {
    fontSize: typography.sizes.titleSm,
  },
  subtitle: {
    fontSize: typography.sizes.caption,
  },
  subtitleLarge: {
    fontSize: typography.sizes.body,
  },
  linksWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  chipLight: {
    backgroundColor: COLORS.overlaySurfaceSoft,
  },
  chipDark: {
    backgroundColor: COLORS.overlaySurfaceMuted,
  },
  chipHighContrast: {
    backgroundColor: COLORS.highContrastBackground,
    borderWidth: 1,
    borderColor: COLORS.highContrastText,
  },
  chipPressed: {
    opacity: 0.9,
  },
  chipPressedHighContrast: {
    opacity: 0.85,
  },
  icon: {
    fontSize: typography.sizes.subtitle,
  },
  iconLarge: {
    fontSize: typography.sizes.title,
  },
  chipLabel: {
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold as any,
  },
  chipLabelLarge: {
    fontSize: typography.sizes.subtitle,
  },
});

export default WorkflowSupportLinks;
