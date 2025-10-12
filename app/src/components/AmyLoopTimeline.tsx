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
}: AmyLoopTimelineProps) {
  const { largeText, highContrast } = useAccessibility();
  const modeColors = MODE_STYLES[mode]?.container ?? MODE_STYLES.surface.container;

  const containerStyle = [
    styles.container,
    {
      backgroundColor: highContrast ? COLORS.highContrastBackground : modeColors.backgroundColor,
      borderColor: highContrast ? COLORS.highContrastText : modeColors.borderColor,
      paddingVertical: compact ? SPACING.md : SPACING.lg,
      paddingHorizontal: compact ? SPACING.lg : SPACING.xl,
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
        const badgeTextColor = isActive
          ? modeColors.badgeText
          : isComplete
            ? COLORS.inverseText
            : modeColors.inactiveBadgeText;

        const connectorColor = highContrast ? COLORS.highContrastText : modeColors.connector;

        return (
          <React.Fragment key={stage.key}>
            <View
              accessibilityRole="text"
              accessibilityLabel={`${stage.title}: ${stage.description}`}
              style={styles.stageItem}
            >
              <View
                style={[
                  styles.stageBadge,
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
                    largeText && styles.stageEmojiLarge,
                    { color: highContrast ? COLORS.highContrastText : badgeTextColor },
                  ]}
                >
                  {stage.emoji}
                </Text>
              </View>
              <Text
                style={[
                  styles.stageTitle,
                  largeText && styles.stageTitleLarge,
                  { color: highContrast ? COLORS.highContrastText : modeColors.title },
                ]}
              >
                {stage.title}
              </Text>
              {!hideDescriptions ? (
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
  stageItem: {
    flex: 1,
    minWidth: 120,
    maxWidth: 160,
    alignItems: 'center',
    paddingHorizontal: SPACING.xs,
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
  stageEmoji: {
    fontSize: TYPOGRAPHY.sizes.subtitle,
  },
  stageEmojiLarge: {
    fontSize: TYPOGRAPHY.sizes.titleSm,
  },
  stageTitle: {
    fontSize: TYPOGRAPHY.sizes.body,
    fontWeight: TYPOGRAPHY.weights.semibold,
    textAlign: 'center',
  },
  stageTitleLarge: {
    fontSize: TYPOGRAPHY.sizes.subtitle,
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
});
