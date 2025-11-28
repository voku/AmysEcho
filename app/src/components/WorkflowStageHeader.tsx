import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useAccessibility } from './AccessibilityContext';
import Colors from '../constants/colors';
import { spacing } from '../constants/spacing';
import typography from '../constants/typography';
import { getWorkflowStepMeta, type WorkflowRouteName } from '../constants/workflow';
import { AmyLoopTimeline } from './AmyLoopTimeline';

export type WorkflowStageHeaderTone = 'light' | 'dark';

export interface WorkflowStageHeaderProps {
  route: WorkflowRouteName;
  tone?: WorkflowStageHeaderTone;
  align?: 'left' | 'center';
  style?: StyleProp<ViewStyle>;
  showTimeline?: boolean;
}

const WorkflowStageHeader: React.FC<WorkflowStageHeaderProps> = ({
  route,
  tone = 'light',
  align = 'left',
  style,
  showTimeline = true,
}) => {
  const { highContrast, largeText } = useAccessibility();
  const meta = useMemo(() => getWorkflowStepMeta(route), [route]);

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

  const timelineMode = tone === 'dark' ? 'overlay' : 'surface';
  const timelineWrapperStyles: StyleProp<ViewStyle> = [
    styles.timelineWrapper,
    align === 'center' ? styles.timelineWrapperCentered : styles.timelineWrapperLeft,
    highContrast ? styles.timelineWrapperHighContrast : null,
  ];

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

      {showTimeline ? (
        <View style={timelineWrapperStyles}>
          <AmyLoopTimeline
            activeStage={route}
            mode={timelineMode}
            compact
            hideDescriptions
          />
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
  timelineWrapper: {
    width: '100%',
    marginTop: spacing.md,
  },
  timelineWrapperLeft: {
    alignItems: 'flex-start',
  },
  timelineWrapperCentered: {
    alignItems: 'center',
  },
  timelineWrapperHighContrast: {
    borderRadius: 24,
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: Colors.highContrastText,
  },
});

export default WorkflowStageHeader;
