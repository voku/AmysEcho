import React, { useMemo } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { StackNavigationProp } from '@react-navigation/stack';
import ActionButton from './ActionButton';
import { useAccessibility } from './AccessibilityContext';
import Colors from '../constants/colors';
import { spacing } from '../constants/spacing';
import typography from '../constants/typography';
import {
  getNextWorkflowRoute,
  getPreviousWorkflowRoute,
  getWorkflowStepMeta,
  type WorkflowRouteName,
} from '../constants/workflow';
import type { AppTabsParamList, RootStackParamList } from '../navigation/types';

export type WorkflowStageHeaderTone = 'light' | 'dark';

export interface WorkflowStageHeaderProps {
  route: WorkflowRouteName;
  tone?: WorkflowStageHeaderTone;
  align?: 'left' | 'center';
  style?: StyleProp<ViewStyle>;
  showNavigation?: boolean;
}

type Navigation = CompositeNavigationProp<
  BottomTabNavigationProp<AppTabsParamList>,
  StackNavigationProp<RootStackParamList>
>;

const WorkflowStageHeader: React.FC<WorkflowStageHeaderProps> = ({
  route,
  tone = 'light',
  align = 'left',
  style,
  showNavigation = true,
}) => {
  const navigation = useNavigation<Navigation>();
  const { highContrast, largeText } = useAccessibility();

  const meta = useMemo(() => getWorkflowStepMeta(route), [route]);
  const nextRoute = useMemo(() => getNextWorkflowRoute(route), [route]);
  const previousRoute = useMemo(() => getPreviousWorkflowRoute(route), [route]);
  const nextMeta = nextRoute ? getWorkflowStepMeta(nextRoute) : undefined;
  const previousMeta = previousRoute ? getWorkflowStepMeta(previousRoute) : undefined;

  const containerAlignment = align === 'center' ? styles.alignCenter : styles.alignLeft;

  const badgeBackground = highContrast
    ? Colors.highContrastBackground
    : tone === 'dark'
      ? Colors.overlayBadgeBackground
      : Colors.secondary;

  const badgeTextColor = highContrast ? Colors.highContrastText : Colors.neutral;

  const titleColor = highContrast
    ? Colors.highContrastText
    : tone === 'dark'
      ? Colors.inverseText
      : Colors.primary;

  const descriptionColor = highContrast
    ? Colors.highContrastText
    : tone === 'dark'
      ? Colors.overlayText
      : Colors.textSecondary;

  const secondaryLinkColor = highContrast
    ? Colors.highContrastText
    : tone === 'dark'
      ? Colors.overlayText
      : Colors.text;

  return (
    <View
      style={[styles.container, containerAlignment, style]}
      accessibilityRole="summary"
      accessibilityLabel={`${meta.stage} – ${meta.description}`}
    >
      <View
        style={[
          styles.badge,
          { backgroundColor: badgeBackground },
          highContrast && styles.badgeHighContrast,
        ]}
      >
        <Text
          style={[
            styles.badgeText,
            { color: badgeTextColor },
            largeText && styles.badgeTextLarge,
          ]}
        >
          {`${meta.icon} ${meta.stage}`}
        </Text>
      </View>

      <Text
        style={[
          styles.title,
          { color: titleColor, textAlign: align },
          largeText && styles.titleLarge,
        ]}
      >
        {meta.label}
      </Text>

      <Text
        style={[
          styles.description,
          { color: descriptionColor, textAlign: align },
          largeText && styles.descriptionLarge,
        ]}
      >
        {meta.description}
      </Text>

      {showNavigation && (nextMeta || previousMeta) ? (
        <View style={styles.navigationRow} accessibilityRole="menu">
          {previousMeta ? (
            <Pressable
              onPress={() => navigation.navigate(previousRoute!)}
              accessibilityRole="button"
              accessibilityLabel={`Zurück zu ${previousMeta.label}`}
              style={({ pressed }) => [styles.secondaryLink, pressed && styles.secondaryLinkPressed]}
            >
              <Text
                style={[
                  styles.secondaryLinkText,
                  { color: secondaryLinkColor },
                  largeText && styles.secondaryLinkTextLarge,
                ]}
              >
                ← Zurück zu {previousMeta.label}
              </Text>
            </Pressable>
          ) : null}

          {nextMeta ? (
            <ActionButton
              label={`Weiter zu ${nextMeta.label}`}
              accessibilityLabel={`Weiter zu ${nextMeta.label}`}
              onPress={() => navigation.navigate(nextRoute!)}
              variant="secondary"
              style={styles.nextButton}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: spacing.sm,
  },
  alignLeft: {
    alignItems: 'flex-start',
  },
  alignCenter: {
    alignItems: 'center',
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.xs,
  },
  badgeHighContrast: {
    borderWidth: 1,
    borderColor: Colors.highContrastText,
  },
  badgeText: {
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.semibold as any,
    letterSpacing: 1,
  },
  badgeTextLarge: {
    fontSize: typography.sizes.body,
  },
  title: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.extrabold as any,
  },
  titleLarge: {
    fontSize: typography.sizes.titleLg,
  },
  description: {
    fontSize: typography.sizes.body,
    lineHeight: typography.lineHeights.relaxed,
  },
  descriptionLarge: {
    fontSize: typography.sizes.bodyLg,
  },
  navigationRow: {
    width: '100%',
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  nextButton: {
    flexShrink: 0,
  },
  secondaryLink: {
    paddingVertical: spacing.xs,
  },
  secondaryLinkPressed: {
    opacity: 0.8,
  },
  secondaryLinkText: {
    fontSize: typography.sizes.caption,
    textDecorationLine: 'underline',
  },
  secondaryLinkTextLarge: {
    fontSize: typography.sizes.body,
  },
});

export default WorkflowStageHeader;
