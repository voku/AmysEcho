import React, { useCallback } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAccessibility } from './AccessibilityContext';
import { COLORS } from '../constants/ui';
import { spacing } from '../constants/spacing';
import typography from '../constants/typography';
import type { RootStackParamList } from '../navigation/types';
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

  const descriptionColor = highContrast
    ? COLORS.highContrastText
    : tone === 'dark'
      ? COLORS.overlayText
      : COLORS.textSecondary;

  const handleNavigate = useCallback(
    (destination: WorkflowSupportDestination) => {
      const { navigationTarget } = destination;
      if (navigationTarget.route === 'ParentalGate') {
        navigation.navigate('ParentalGate', navigationTarget.params);
        return;
      }

      navigation.navigate('Help');
    },
    [navigation],
  );

  return (
    <View style={containerStyles} accessibilityRole="menu" accessibilityLabel="Weitere Bereiche">
      <Text
        style={[
          styles.heading,
          { color: highContrast ? COLORS.highContrastText : COLORS.neutral },
          largeText && styles.headingLarge,
        ]}
      >
        Weitere Bereiche
      </Text>
      <Text
        style={[
          styles.subtitle,
          { color: descriptionColor },
          largeText && styles.subtitleLarge,
        ]}
      >
        Direkt zum Elternbereich, Hilfe oder anderen Einstellungen springen.
      </Text>
      <View style={styles.linksWrapper}>
        {WORKFLOW_SUPPORT_DESTINATIONS.map((destination) => (
          <Pressable
            key={destination.key}
            style={({ pressed }) => [
              styles.link,
              tone === 'dark' ? styles.linkDark : styles.linkLight,
              highContrast && styles.linkHighContrast,
              pressed && (highContrast ? styles.linkPressedHighContrast : styles.linkPressed),
            ]}
            android_ripple={{ color: highContrast ? COLORS.highContrastText : COLORS.overlaySurfaceMuted }}
            accessibilityRole="button"
            accessibilityLabel={destination.accessibilityLabel ?? destination.title}
            accessibilityHint={destination.accessibilityHint}
            onPress={() => handleNavigate(destination)}
          >
            <View style={styles.linkIconWrapper}>
              <Text style={[styles.icon, largeText && styles.iconLarge]}>{destination.icon}</Text>
            </View>
            <View style={styles.linkTextWrapper}>
              <Text
                style={[
                  styles.linkTitle,
                  { color: highContrast ? COLORS.highContrastText : COLORS.neutral },
                  largeText && styles.linkTitleLarge,
                ]}
              >
                {destination.title}
              </Text>
              <Text
                style={[
                  styles.linkDescription,
                  { color: descriptionColor },
                  largeText && styles.linkDescriptionLarge,
                ]}
              >
                {destination.description}
              </Text>
            </View>
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
    gap: spacing.sm,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  linkLight: {
    backgroundColor: COLORS.overlaySurfaceSoft,
  },
  linkDark: {
    backgroundColor: COLORS.overlaySurfaceMuted,
  },
  linkHighContrast: {
    backgroundColor: COLORS.highContrastBackground,
    borderWidth: 1,
    borderColor: COLORS.highContrastText,
  },
  linkPressed: {
    opacity: 0.9,
  },
  linkPressedHighContrast: {
    opacity: 0.85,
  },
  linkIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  icon: {
    fontSize: typography.sizes.titleSm,
  },
  iconLarge: {
    fontSize: typography.sizes.title,
  },
  linkTextWrapper: {
    flex: 1,
    gap: spacing.xs,
  },
  linkTitle: {
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold as any,
  },
  linkTitleLarge: {
    fontSize: typography.sizes.bodyLg,
  },
  linkDescription: {
    fontSize: typography.sizes.caption,
  },
  linkDescriptionLarge: {
    fontSize: typography.sizes.body,
  },
});

export default WorkflowSupportLinks;
