/**
 * Two-Hand Gesture Display Component - Phase 3.1
 *
 * Enhanced display for two-hand gestures with visual indicators
 * and special formatting to show both hands are involved.
 *
 * The recognition screen renders this component whenever the
 * parallel/two-hand detection pipeline reports a combined gesture.
 * That makes it easier for Amy (and observers) to understand
 * which coordinated movement was recognised without conflating it
 * with the standard single-hand emoji view.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import { useAccessibility } from './AccessibilityContext';
import {
  isTwoHandGestureString,
  parseTwoHandGestureString,
  getTwoHandGestureById,
  findTwoHandGestureByHands,
  type TwoHandGestureDefinition,
} from '../constants/twoHandGestures';
import type { GestureModelEntry } from '../model';
import type { OpenAIValidationResult } from '../hooks/useOpenAIValidation';
import { optimizedGestureService } from '../services/optimizedGestureService';

const CONFIDENCE_LABEL = 'Sicherheit';
const DEFAULT_TWO_HAND_EMOJI = '👐';

interface TwoHandGestureDisplayProps {
  gestureString: string;
  confidence: number;
  showDetails?: boolean;
  size?: 'small' | 'medium' | 'large';
  twoHandDefinition?: TwoHandGestureDefinition | null;
  gestureMeta?: GestureModelEntry | null;
  openaiValidationResult?: OpenAIValidationResult | null;
}

export default function TwoHandGestureDisplay({
  gestureString,
  confidence,
  showDetails = true,
  size = 'medium',
  twoHandDefinition,
  gestureMeta,
  openaiValidationResult,
}: TwoHandGestureDisplayProps) {
  const { largeText, highContrast } = useAccessibility();

  const parsed = useMemo(() => {
    if (isTwoHandGestureString(gestureString)) {
      return parseTwoHandGestureString(gestureString);
    }

    if (twoHandDefinition) {
      return {
        left: twoHandDefinition.leftGesture,
        right: twoHandDefinition.rightGesture,
      };
    }

    const fallbackDef = getTwoHandGestureById(gestureString);
    if (fallbackDef) {
      return {
        left: fallbackDef.leftGesture,
        right: fallbackDef.rightGesture,
      };
    }

    return null;
  }, [gestureString, twoHandDefinition]);

  if (!parsed) {
    return null;
  }

  const gestureDef = useMemo(() => {
    if (twoHandDefinition) {
      return twoHandDefinition;
    }

    if (isTwoHandGestureString(gestureString)) {
      const fromId = getTwoHandGestureById(gestureString);
      if (fromId) {
        return fromId;
      }
    }

    return findTwoHandGestureByHands(parsed.left, parsed.right) ?? null;
  }, [gestureString, parsed.left, parsed.right, twoHandDefinition]);

  const openAiGestureMeta = useMemo(() => {
    if (!openaiValidationResult?.gesture) {
      return null;
    }
    return optimizedGestureService.getGestureById(openaiValidationResult.gesture);
  }, [openaiValidationResult?.gesture]);

  const fallbackGestureMeta = useMemo(() => {
    if (gestureMeta) {
      return gestureMeta;
    }
    if (gestureDef) {
      return optimizedGestureService.getGestureById(gestureDef.id);
    }
    return null;
  }, [gestureDef, gestureMeta]);

  const leftMeta = useMemo(
    () => optimizedGestureService.getGestureById(parsed.left),
    [parsed.left],
  );
  const rightMeta = useMemo(
    () => optimizedGestureService.getGestureById(parsed.right),
    [parsed.right],
  );

  const combinedEmoji =
    openAiGestureMeta?.emoji ||
    fallbackGestureMeta?.emoji ||
    gestureDef?.emoji ||
    (leftMeta?.emoji && leftMeta.emoji === rightMeta?.emoji ? leftMeta.emoji : DEFAULT_TWO_HAND_EMOJI);

  const openAiLabel = openAiGestureMeta?.label || openaiValidationResult?.gesture || null;
  const openAiFeedback = openaiValidationResult?.feedback;

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return {
          symbolSize: largeText ? 24 : 20,
          textSize: largeText ? 14 : 12,
          confidenceSize: largeText ? 12 : 10,
        };
      case 'large':
        return {
          symbolSize: largeText ? 64 : 48,
          textSize: largeText ? 24 : 20,
          confidenceSize: largeText ? 18 : 16,
        };
      default: // medium
        return {
          symbolSize: largeText ? 48 : 36,
          textSize: largeText ? 20 : 18,
          confidenceSize: largeText ? 16 : 14,
        };
    }
  };

  const sizes = getSizeStyles();

  const styles = StyleSheet.create({
    container: {
      alignItems: 'center',
      backgroundColor: highContrast ? COLORS.highContrastBackground : 'rgba(0, 0, 0, 0.7)',
      borderRadius: DEFAULT_RADIUS,
      padding: SPACING.sm,
      borderWidth: highContrast ? 2 : 0,
      borderColor: highContrast ? COLORS.highContrastText : 'transparent',
    },
    symbolBadge: {
      width: sizes.symbolSize + SPACING.lg,
      height: sizes.symbolSize + SPACING.lg,
      borderRadius: (sizes.symbolSize + SPACING.lg) / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: highContrast ? COLORS.highContrastText : COLORS.surface,
      marginBottom: SPACING.xs,
    },
    symbol: {
      fontSize: sizes.symbolSize,
      color: highContrast ? COLORS.highContrastBackground : COLORS.text,
    },
    metaText: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      textAlign: 'center',
      marginBottom: SPACING.xs,
    },
    gestureName: {
      fontSize: sizes.textSize,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      textAlign: 'center',
      marginBottom: showDetails ? SPACING.xs : 0,
    },
    confidenceText: {
      fontSize: sizes.confidenceSize,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      textAlign: 'center',
    },
    fallbackDetails: {
      backgroundColor: highContrast ? COLORS.surface : 'rgba(255, 255, 255, 0.08)',
      borderRadius: DEFAULT_RADIUS,
      padding: SPACING.xs,
      marginTop: SPACING.xs,
      borderWidth: highContrast ? 1 : 0,
      borderColor: highContrast ? COLORS.highContrastText : 'transparent',
      width: '100%',
    },
    fallbackText: {
      fontSize: largeText ? 12 : 10,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      textAlign: 'center',
      marginBottom: SPACING.xs / 2,
    },
    detailsContainer: {
      backgroundColor: highContrast ? COLORS.surface : 'rgba(255, 255, 255, 0.1)',
      borderRadius: DEFAULT_RADIUS,
      padding: SPACING.xs,
      marginTop: SPACING.xs,
      borderWidth: highContrast ? 1 : 0,
      borderColor: highContrast ? COLORS.highContrastText : 'transparent',
    },
    detailsText: {
      fontSize: largeText ? 12 : 10,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      textAlign: 'center',
      lineHeight: largeText ? 16 : 14,
    },
    categoryBadge: {
      backgroundColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
      borderRadius: DEFAULT_RADIUS,
      paddingHorizontal: SPACING.xs,
      paddingVertical: 2,
      marginTop: SPACING.xs,
    },
    categoryText: {
      fontSize: largeText ? 10 : 8,
      color: highContrast ? COLORS.highContrastBackground : COLORS.surface,
      fontWeight: 'bold',
      textAlign: 'center',
    },
    openAiDetails: {
      backgroundColor: highContrast ? COLORS.surface : 'rgba(255, 255, 255, 0.08)',
      borderRadius: DEFAULT_RADIUS,
      padding: SPACING.xs,
      marginTop: SPACING.xs,
      borderWidth: highContrast ? 1 : 0,
      borderColor: highContrast ? COLORS.highContrastText : 'transparent',
      width: '100%',
    },
    openAiTitle: {
      fontSize: largeText ? 12 : 10,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
      textAlign: 'center',
      marginBottom: SPACING.xs / 2,
    },
    openAiText: {
      fontSize: largeText ? 12 : 10,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      textAlign: 'center',
      marginBottom: SPACING.xs / 2,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.symbolBadge}>
        <Text style={styles.symbol}>{combinedEmoji}</Text>
      </View>

      <Text style={styles.metaText}>Koordinierte Zwei-Hand-Geste</Text>

      {/* Gesture name */}
      <Text style={styles.gestureName}>
        {gestureDef ? gestureDef.name : `${parsed.left} + ${parsed.right}`}
      </Text>

      {/* Confidence */}
      <Text style={styles.confidenceText}>
        {Math.round(confidence * 100)}% {CONFIDENCE_LABEL}
      </Text>

      {/* Additional details */}
      {showDetails && (
        <>
          {gestureDef ? (
            <View style={styles.detailsContainer}>
              <Text style={styles.detailsText}>{gestureDef.description}</Text>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{gestureDef.category.toUpperCase()}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.fallbackDetails}>
              <Text style={styles.fallbackText}>
                Linke Hand: {leftMeta?.emoji ? `${leftMeta.emoji} ` : ''}{parsed.left}
              </Text>
              <Text style={styles.fallbackText}>
                Rechte Hand: {rightMeta?.emoji ? `${rightMeta.emoji} ` : ''}{parsed.right}
              </Text>
            </View>
          )}

          {openAiLabel && (
            <View style={styles.openAiDetails}>
              <Text style={styles.openAiTitle}>OpenAI-Bestätigung</Text>
              <Text style={styles.openAiText}>{openAiLabel}</Text>
              {openAiFeedback ? (
                <Text style={styles.openAiText}>{openAiFeedback}</Text>
              ) : null}
            </View>
          )}
        </>
      )}
    </View>
  );
}