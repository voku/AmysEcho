import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING, TYPOGRAPHY } from '../constants/ui';
import { ORDERED_WORKFLOW_STEPS, type WorkflowRouteName } from '../constants/workflow';
import { useAccessibility } from './AccessibilityContext';

type AmyLoopTimelineProps = {
  /** Currently highlighted stage in the Kamera → Verlauf → Lernen Schleife. */
  activeStage: WorkflowRouteName;
  /**
   * Choose the visual context. `surface` is optimised for light backgrounds,
   * while `overlay` keeps high contrast when rendered on top of the camera feed.
   */
  mode?: 'surface' | 'overlay';
  /** Reduces paddings for tight layouts such as cards. */
  compact?: boolean;
  /** Hides the secondary description text for extra compact variants. */
  hideDescriptions?: boolean;
  /**
   * Controls the visual density. `grid` keeps the original card layout, while
   * `inline` renders a slim breadcrumb row optimised for small screens.
   */
  layout?: 'grid' | 'inline';
};

const STAGES = ORDERED_WORKFLOW_STEPS.map((step) => ({
  key: step.route,
  emoji: step.icon,
  title: step.label,
  description: step.timelineSummary,
}));

const MODE_STYLES = {
  surface: {
    container: {
      backgroundColor: COLORS.surface,
      borderColor: COLORS.outline,
      badgeBackground: COLORS.primary,
      badgeText: COLORS.inverseText,
      inactiveBadgeBackground: 'transparent',
      inactiveBadgeText: COLORS.text,
      connector: COLORS.outline,
      title: COLORS.text,
      description: COLORS.textMuted,
    },
  },
  overlay: {
    container: {
      backgroundColor: COLORS.overlaySurface,
      borderColor: COLORS.overlayBorder,
      badgeBackground: COLORS.overlayBadgeBackground,
      badgeText: COLORS.overlayBadgeText,
      inactiveBadgeBackground: 'transparent',
      inactiveBadgeText: COLORS.overlayText,
      connector: COLORS.overlayBorder,
      title: COLORS.overlayText,
      description: COLORS.overlayTextMuted,
    },
  },
} as const;

export function AmyLoopTimeline({
  activeStage,
  mode = 'surface',
  compact = false,
  hideDescriptions = false,
  layout = 'grid',
}: AmyLoopTimelineProps) {
  const { largeText, highContrast } = useAccessibility();
  const modeColors = MODE_STYLES[mode]?.container ?? MODE_STYLES.surface.container;
  const isInline = layout === 'inline';

  const containerStyle = [
    isInline ? styles.inlineContainer : styles.container,
    {
      backgroundColor: highContrast ? COLORS.highContrastBackground : modeColors.backgroundColor,
      borderColor: highContrast ? COLORS.highContrastText : modeColors.borderColor,
      paddingVertical: isInline ? (compact ? SPACING.sm : SPACING.md) : compact ? SPACING.md : SPACING.lg,
      paddingHorizontal: isInline ? (compact ? SPACING.md : SPACING.lg) : compact ? SPACING.lg : SPACING.xl,
    },
  ];

  return (
    <View
      accessibilityRole="list"
      accessibilityLabel={`Kommunikationsschritte: ${STAGES.map((stage) => stage.title).join(', ')}`}
      style={containerStyle}
    >
      {STAGES.map((stage, index) => {
        const stageIndex = STAGES.findIndex((item) => item.key === activeStage);
        const resolvedStageIndex = stageIndex === -1 ? 0 : stageIndex;
        const isActive = stage.key === activeStage;
        const isComplete = index < resolvedStageIndex;
        const badgeBackground = isActive
          ? modeColors.badgeBackground
          : isComplete
            ? COLORS.success
            : modeColors.inactiveBadgeBackground;
        const badgeTextColor = highContrast
          ? COLORS.highContrastText
          : isActive
            ? modeColors.badgeText
            : isComplete
              ? COLORS.neutral
              : modeColors.inactiveBadgeText;

        const connectorColor = highContrast ? COLORS.highContrastText : modeColors.connector;
        const inlineLabelColor = highContrast
          ? COLORS.highContrastText
          : isActive
            ? modeColors.title
            : isComplete
              ? COLORS.success
              : modeColors.description;

        return (
          <React.Fragment key={stage.key}>
            <View
              accessibilityRole="text"
              accessibilityLabel={`${stage.title}: ${stage.description}`}
              style={isInline ? styles.inlineStageItem : styles.stageItem}
            >
              <View
                style={[
                  styles.stageBadge,
                  isInline && styles.inlineStageBadge,
                  {
                    backgroundColor: highContrast ? COLORS.highContrastBackground : badgeBackground,
                    borderColor: highContrast
                      ? COLORS.highContrastText
                      : isActive || isComplete
                        ? badgeBackground
                        : connectorColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.stageEmoji,
                    isInline && styles.inlineStageEmoji,
                    largeText && (isInline ? styles.inlineStageEmojiLarge : styles.stageEmojiLarge),
                    { color: highContrast ? COLORS.highContrastText : badgeTextColor },
                  ]}
                >
                  {stage.emoji}
                </Text>
              </View>
              <Text
                style={[
                  styles.stageTitle,
                  isInline && styles.inlineStageTitle,
                  isInline && isActive && styles.inlineStageTitleActive,
                  largeText && (isInline ? styles.inlineStageTitleLarge : styles.stageTitleLarge),
                  { color: isInline ? inlineLabelColor : highContrast ? COLORS.highContrastText : modeColors.title },
                ]}
              >
                {stage.title}
              </Text>
              {!hideDescriptions && !isInline ? (
                <Text
                  style={[
                    styles.stageDescription,
                    largeText && styles.stageDescriptionLarge,
                    {
                      color: highContrast ? COLORS.highContrastText : modeColors.description,
                    },
                  ]}
                >
                  {stage.description}
                </Text>
              ) : null}
            </View>
            {index < STAGES.length - 1 ? (
              isInline ? (
                <View
                  pointerEvents="none"
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                  style={styles.inlineConnectorWrapper}
                >
                  <Text
                    style={[styles.inlineConnector, { color: connectorColor }]}
                    accessibilityRole="text"
                    accessible={false}
                  >
                    →
                  </Text>
                </View>
              ) : (
                <View
                  pointerEvents="none"
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                  style={[
                    styles.connector,
                    {
                      backgroundColor: connectorColor,
                      marginHorizontal: compact ? SPACING.sm : SPACING.md,
                    },
                  ]}
                />
              )
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    rowGap: SPACING.md,
  },
  inlineContainer: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stageItem: {
    flex: 1,
    minWidth: 120,
    maxWidth: 160,
    alignItems: 'center',
    paddingHorizontal: SPACING.xs,
  },
  inlineStageItem: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  stageBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  inlineStageBadge: {
    width: 36,
    height: 36,
    marginBottom: 0,
    marginRight: SPACING.xs,
    borderRadius: 18,
  },
  stageEmoji: {
    fontSize: TYPOGRAPHY.sizes.subtitle,
  },
  stageEmojiLarge: {
    fontSize: TYPOGRAPHY.sizes.titleSm,
  },
  inlineStageEmoji: {
    fontSize: TYPOGRAPHY.sizes.body,
  },
  inlineStageEmojiLarge: {
    fontSize: TYPOGRAPHY.sizes.subtitle,
  },
  stageTitle: {
    fontSize: TYPOGRAPHY.sizes.body,
    fontWeight: TYPOGRAPHY.weights.semibold,
    textAlign: 'center',
  },
  stageTitleLarge: {
    fontSize: TYPOGRAPHY.sizes.subtitle,
  },
  inlineStageTitle: {
    fontSize: TYPOGRAPHY.sizes.caption,
    textAlign: 'left',
    fontWeight: TYPOGRAPHY.weights.medium,
  },
  inlineStageTitleActive: {
    fontWeight: TYPOGRAPHY.weights.semibold,
  },
  inlineStageTitleLarge: {
    fontSize: TYPOGRAPHY.sizes.body,
  },
  stageDescription: {
    fontSize: TYPOGRAPHY.sizes.caption,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  stageDescriptionLarge: {
    fontSize: TYPOGRAPHY.sizes.body,
  },
  connector: {
    width: 2,
    borderRadius: 999,
    alignSelf: 'stretch',
  },
  inlineConnectorWrapper: {
    flexShrink: 0,
    paddingHorizontal: SPACING.xs,
  },
  inlineConnector: {
    fontSize: TYPOGRAPHY.sizes.body,
    marginHorizontal: SPACING.xs,
  },
});
