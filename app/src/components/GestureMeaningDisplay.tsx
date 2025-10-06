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
  isCoordinatedGestureString,
  parseCoordinatedGestureString,
  getGestureMeaningById,
  findCoordinatedGestureMeaningByHands,
  getGestureMeaningByGestureId,
  getGestureMeaningBySequenceId,
  findSequenceGestureMeaningByGestures,
  type GestureMeaningDefinition,
} from '../constants/gestureMeanings';
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
  gestureDefinition?: GestureMeaningDefinition | null;
  gestureMeta?: GestureModelEntry | null;
  openaiValidationResult?: OpenAIValidationResult | null;
  sequenceGestures?: string[] | null;
}

export default function GestureMeaningDisplay({
  gestureId,
  confidence,
  showDetails = true,
  size = 'medium',
  gestureDefinition,
  gestureMeta,
  openaiValidationResult,
  sequenceGestures,
}: GestureMeaningDisplayProps) {
  const { largeText, highContrast } = useAccessibility();
  const normalizedId = gestureId.trim();

  const sequenceDefinition = useMemo(() => {
    if (gestureDefinition?.composition === 'sequence') {
      return gestureDefinition;
    }

    if (sequenceGestures && sequenceGestures.length > 0) {
      const matched = findSequenceGestureMeaningByGestures(sequenceGestures);
      if (matched) {
        return matched;
      }
    }

    return getGestureMeaningBySequenceId(normalizedId) ?? null;
  }, [gestureDefinition, normalizedId, sequenceGestures]);

  const isSequence = Boolean(sequenceDefinition);

  const parsedCombination = useMemo(() => {
    if (gestureDefinition?.composition === 'sequence') {
      return null;
    }

    if (gestureDefinition?.composition === 'coordinated') {
      return {
        left: gestureDefinition.leftGesture,
        right: gestureDefinition.rightGesture,
      };
    }

    if (isCoordinatedGestureString(normalizedId)) {
      return parseCoordinatedGestureString(normalizedId);
    }

    const fallbackByGesture = getGestureMeaningByGestureId(normalizedId);
    if (fallbackByGesture?.composition === 'coordinated') {
      return { left: fallbackByGesture.leftGesture, right: fallbackByGesture.rightGesture };
    }

    const fallbackById = getGestureMeaningById(normalizedId);
    if (fallbackById?.composition === 'coordinated') {
      return { left: fallbackById.leftGesture, right: fallbackById.rightGesture };
    }

    return null;
  }, [gestureDefinition, normalizedId]);

  const isCombination = Boolean(parsedCombination);

  const coordinatedDefinition = useMemo(() => {
    if (gestureDefinition?.composition === 'coordinated') {
      return gestureDefinition;
    }

    if (!parsedCombination) {
      return null;
    }

    if (!isCoordinatedGestureString(normalizedId)) {
      const byId = getGestureMeaningById(normalizedId);
      if (byId?.composition === 'coordinated') {
        return byId;
      }
    }

    return findCoordinatedGestureMeaningByHands(parsedCombination.left, parsedCombination.right) ?? null;
  }, [gestureDefinition, normalizedId, parsedCombination]);

  const activeDefinition = useMemo(() => {
    if (gestureDefinition) {
      return gestureDefinition;
    }

    const byGesture = getGestureMeaningByGestureId(normalizedId);
    if (byGesture) {
      return byGesture;
    }

    if (sequenceDefinition) {
      return sequenceDefinition;
    }

    if (!isCombination) {
      return getGestureMeaningById(normalizedId) ?? null;
    }

    return coordinatedDefinition;
  }, [
    coordinatedDefinition,
    gestureDefinition,
    isCombination,
    normalizedId,
    sequenceDefinition,
  ]);
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

    if (activeDefinition?.composition === 'coordinated') {
      return (
        optimizedGestureService.getGestureById(activeDefinition.id) ??
        optimizedGestureService.getGestureById(`${activeDefinition.leftGesture}+${activeDefinition.rightGesture}`) ??
        null
      );
    }

    if (activeDefinition?.composition === 'single') {
      return optimizedGestureService.getGestureById(activeDefinition.gesture) ?? null;
    }

    return optimizedGestureService.getGestureById(normalizedId) ?? null;
  }, [activeDefinition, gestureMeta, normalizedId]);

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

  const sequenceStepsMeta = useMemo(() => {
    if (!sequenceDefinition) {
      return [] as GestureModelEntry[];
    }

    return sequenceDefinition.gestures
      .map((id) => optimizedGestureService.getGestureById(id))
      .filter((meta): meta is GestureModelEntry => Boolean(meta));
  }, [sequenceDefinition]);

  const combinedEmoji = useMemo(() => {
    if (openAiGestureMeta?.emoji) {
      return openAiGestureMeta.emoji;
    }

    if (resolvedGestureMeta?.emoji) {
      return resolvedGestureMeta.emoji;
    }

    if (sequenceDefinition?.emoji) {
      return sequenceDefinition.emoji;
    }

    if (activeDefinition?.emoji) {
      return activeDefinition.emoji;
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

    return activeDefinition?.emoji || DEFAULT_SINGLE_EMOJI;
  }, [
    activeDefinition?.emoji,
    isCombination,
    leftMeta?.emoji,
    openAiGestureMeta?.emoji,
    resolvedGestureMeta?.emoji,
    rightMeta?.emoji,
    sequenceDefinition?.emoji,
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

    if (activeDefinition?.name) {
      return activeDefinition.name;
    }

    if (coordinatedDefinition?.name) {
      return coordinatedDefinition.name;
    }

    if (isCombination && parsedCombination) {
      return `${parsedCombination.left} + ${parsedCombination.right}`;
    }

    return normalizedId;
  }, [
    activeDefinition?.name,
    coordinatedDefinition?.name,
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
        {isSequence
          ? 'Gestenfolge erkannt'
          : isCombination
            ? 'Koordinierte Geste erkannt'
            : 'Erkannte Geste'}
      </Text>

      <Text style={styles.gestureName}>{displayName}</Text>

      <Text style={styles.confidenceText}>
        {Math.round(confidence * 100)}% {CONFIDENCE_LABEL}
      </Text>

      {showDetails && (
        <>
          {activeDefinition ? (
            <View style={styles.detailsContainer}>
              <Text style={styles.detailsText}>{activeDefinition.description}</Text>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{activeDefinition.category.toUpperCase()}</Text>
              </View>
              {activeDefinition.composition === 'sequence' ? (
                <>
                  <Text style={styles.detailsText}>Schritte:</Text>
                  {sequenceStepsMeta.length
                    ? sequenceStepsMeta.map((meta) => (
                        <Text key={meta.id} style={styles.detailsText}>
                          {meta.emoji ? `${meta.emoji} ` : ''}
                          {meta.label || meta.id}
                        </Text>
                      ))
                    : activeDefinition.gestures.map((step) => (
                        <Text key={step} style={styles.detailsText}>
                          {step}
                        </Text>
                      ))}
                </>
              ) : null}
              {resolvedGestureMeta?.dgsVideoUri ? (
                <Text style={styles.detailsText}>DGS-Video verfügbar</Text>
              ) : null}
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
