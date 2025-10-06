/**
 * Gesture Meaning Display Component - Phase 3.2
 *
 * Shows a unified overlay for Amy that highlights the recognised
 * meaning of a gesture, regardless of whether it came from a
 * single-hand or coordinated multi-hand detection.
 *
 * The component prefers metadata coming from OpenAI validation
 * and recognition results, falling back to predefined gesture
 * combinations when necessary so Amy always sees one clear idea.
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
const DEFAULT_MULTI_EMOJI = '👐';
const DEFAULT_SINGLE_EMOJI = '🤟';

interface GestureMeaningDisplayProps {
  gestureId: string;
  confidence: number;
  showDetails?: boolean;
  size?: 'small' | 'medium' | 'large';
  twoHandDefinition?: TwoHandGestureDefinition | null;
  gestureMeta?: GestureModelEntry | null;
  openaiValidationResult?: OpenAIValidationResult | null;
}

export default function GestureMeaningDisplay({
  gestureId,
  confidence,
  showDetails = true,
  size = 'medium',
  twoHandDefinition,
  gestureMeta,
  openaiValidationResult,
}: GestureMeaningDisplayProps) {
  const { largeText, highContrast } = useAccessibility();
  const normalizedId = gestureId.trim();

  const parsedCombination = useMemo(() => {
    if (twoHandDefinition) {
      return {
        left: twoHandDefinition.leftGesture,
        right: twoHandDefinition.rightGesture,
      };
    }

    if (isTwoHandGestureString(normalizedId)) {
      return parseTwoHandGestureString(normalizedId);
    }

    const fallback = getTwoHandGestureById(normalizedId);
    if (fallback) {
      return {
        left: fallback.leftGesture,
        right: fallback.rightGesture,
      };
    }

    return null;
  }, [normalizedId, twoHandDefinition]);

  const isCombination = Boolean(parsedCombination);

  const gestureDefinition = useMemo(() => {
    if (twoHandDefinition) {
      return twoHandDefinition;
    }

    if (!parsedCombination) {
      return null;
    }

    if (!isTwoHandGestureString(normalizedId)) {
      const byId = getTwoHandGestureById(normalizedId);
      if (byId) {
        return byId;
      }
    }

    return findTwoHandGestureByHands(parsedCombination.left, parsedCombination.right) ?? null;
  }, [normalizedId, parsedCombination, twoHandDefinition]);

  const openAiGestureMeta = useMemo(() => {
    if (!openaiValidationResult?.gesture) {
      return null;
    }
    return optimizedGestureService.getGestureById(openaiValidationResult.gesture);
  }, [openaiValidationResult?.gesture]);

  const resolvedGestureMeta = useMemo(() => {
    if (gestureMeta) {
      return gestureMeta;
    }

    if (isCombination) {
      if (gestureDefinition) {
        return optimizedGestureService.getGestureById(gestureDefinition.id) ?? null;
      }
      return null;
    }

    return optimizedGestureService.getGestureById(normalizedId) ?? null;
  }, [gestureDefinition, gestureMeta, isCombination, normalizedId]);

  const leftMeta = useMemo(() => {
    if (!parsedCombination) {
      return null;
    }
    return optimizedGestureService.getGestureById(parsedCombination.left);
  }, [parsedCombination]);

  const rightMeta = useMemo(() => {
    if (!parsedCombination) {
      return null;
    }
    return optimizedGestureService.getGestureById(parsedCombination.right);
  }, [parsedCombination]);

  const combinedEmoji = useMemo(() => {
    if (openAiGestureMeta?.emoji) {
      return openAiGestureMeta.emoji;
    }

    if (resolvedGestureMeta?.emoji) {
      return resolvedGestureMeta.emoji;
    }

    if (gestureDefinition?.emoji) {
      return gestureDefinition.emoji;
    }

    if (isCombination) {
      if (leftMeta?.emoji && rightMeta?.emoji && leftMeta.emoji === rightMeta.emoji) {
        return leftMeta.emoji;
      }
      if (leftMeta?.emoji && rightMeta?.emoji) {
        return `${leftMeta.emoji}${rightMeta.emoji}`;
      }
      return DEFAULT_MULTI_EMOJI;
    }

    return leftMeta?.emoji || rightMeta?.emoji || DEFAULT_SINGLE_EMOJI;
  }, [
    gestureDefinition?.emoji,
    isCombination,
    leftMeta?.emoji,
    openAiGestureMeta?.emoji,
    resolvedGestureMeta?.emoji,
    rightMeta?.emoji,
  ]);

  const openAiLabel = openAiGestureMeta?.label || openaiValidationResult?.gesture || null;
  const openAiFeedback = openaiValidationResult?.feedback;

  const displayName = useMemo(() => {
    if (openAiLabel) {
      return openAiLabel;
    }

    if (resolvedGestureMeta?.label) {
      return resolvedGestureMeta.label;
    }

    if (gestureDefinition?.name) {
      return gestureDefinition.name;
    }

    if (isCombination && parsedCombination) {
      return `${parsedCombination.left} + ${parsedCombination.right}`;
    }

    return normalizedId;
  }, [
    gestureDefinition?.name,
    isCombination,
    normalizedId,
    openAiLabel,
    parsedCombination,
    resolvedGestureMeta?.label,
  ]);

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
      default:
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
    detailsContainer: {
      backgroundColor: highContrast ? COLORS.surface : 'rgba(255, 255, 255, 0.1)',
      borderRadius: DEFAULT_RADIUS,
      padding: SPACING.xs,
      marginTop: SPACING.xs,
      borderWidth: highContrast ? 1 : 0,
      borderColor: highContrast ? COLORS.highContrastText : 'transparent',
      width: '100%',
    },
    detailsText: {
      fontSize: largeText ? 12 : 10,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      textAlign: 'center',
      lineHeight: largeText ? 16 : 14,
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
    categoryBadge: {
      backgroundColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
      borderRadius: DEFAULT_RADIUS,
      paddingHorizontal: SPACING.xs,
      paddingVertical: 2,
      marginTop: SPACING.xs,
      alignSelf: 'center',
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

      <Text style={styles.metaText}>
        {isCombination ? 'Koordinierte Geste erkannt' : 'Erkannte Geste'}
      </Text>

      <Text style={styles.gestureName}>{displayName}</Text>

      <Text style={styles.confidenceText}>
        {Math.round(confidence * 100)}% {CONFIDENCE_LABEL}
      </Text>

      {showDetails && (
        <>
          {gestureDefinition ? (
            <View style={styles.detailsContainer}>
              <Text style={styles.detailsText}>{gestureDefinition.description}</Text>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{gestureDefinition.category.toUpperCase()}</Text>
              </View>
            </View>
          ) : isCombination && parsedCombination ? (
            <View style={styles.fallbackDetails}>
              <Text style={styles.fallbackText}>
                Linke Hand: {leftMeta?.emoji ? `${leftMeta.emoji} ` : ''}{parsedCombination.left}
              </Text>
              <Text style={styles.fallbackText}>
                Rechte Hand: {rightMeta?.emoji ? `${rightMeta.emoji} ` : ''}{parsedCombination.right}
              </Text>
            </View>
          ) : resolvedGestureMeta ? (
            <View style={styles.detailsContainer}>
              <Text style={styles.detailsText}>
                {resolvedGestureMeta.category
                  ? `Kategorie: ${resolvedGestureMeta.category}`
                  : 'Individuelle Bedeutung'}
              </Text>
              {resolvedGestureMeta.dgsVideoUri ? (
                <Text style={styles.detailsText}>DGS-Video verfügbar</Text>
              ) : null}
            </View>
          ) : null}

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
