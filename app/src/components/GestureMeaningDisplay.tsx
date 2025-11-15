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

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
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

const formatGestureLabel = (
  meta: GestureModelEntry | null | undefined,
  fallback: string,
) => {
  const labelText = meta?.label || fallback;

  if (meta?.emoji && labelText && !labelText.includes(meta.emoji)) {
    return `${meta.emoji} ${labelText}`;
  }

  return labelText;
};

const CAMERA_CARD_TONE = {
  background: '#E5E0CF',
  border: 'rgba(0, 44, 44, 0.18)',
  symbolBadge: '#1C4A4B',
  symbol: '#E5E0CF',
  primaryText: '#002C2C',
  secondaryText: '#1C4A4B',
  mutedText: 'rgba(0, 44, 44, 0.7)',
  panelBackground: '#F4EDDB',
  mutedPanelBackground: '#EDE6D0',
  badgeBackground: '#25706F',
  badgeText: '#E5E0CF',
} as const;

interface GestureMeaningDisplayProps {
  gestureId: string;
  confidence: number;
  showDetails?: boolean;
  size?: 'small' | 'medium' | 'large';
  gestureDefinition?: GestureMeaningDefinition | null;
  gestureMeta?: GestureModelEntry | null;
  openaiValidationResult?: OpenAIValidationResult | null;
  sequenceGestures?: string[] | null;
  tone?: 'overlay' | 'camera';
  detailsStartCollapsed?: boolean;
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
  tone = 'overlay',
  detailsStartCollapsed = false,
}: GestureMeaningDisplayProps) {
  const { largeText, highContrast } = useAccessibility();
  const normalizedId = gestureId.trim();
  const [detailsExpanded, setDetailsExpanded] = useState(!detailsStartCollapsed);

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

  const categoryLabel = activeDefinition?.category ?? resolvedGestureMeta?.category ?? null;

  const sequenceStepLabels = useMemo(() => {
    if (!isSequence) {
      return [] as string[];
    }

    if (sequenceStepsMeta.length > 0) {
      return sequenceStepsMeta.map((meta) => formatGestureLabel(meta, meta.id));
    }

    if (sequenceDefinition?.gestures?.length) {
      return sequenceDefinition.gestures;
    }

    if (activeDefinition?.composition === 'sequence') {
      return activeDefinition.gestures;
    }

    return [] as string[];
  }, [
    activeDefinition,
    isSequence,
    sequenceDefinition?.gestures,
    sequenceStepsMeta,
  ]);

  const combinationLines = useMemo(() => {
    if (!parsedCombination) {
      return [] as string[];
    }

    const leftLabel = formatGestureLabel(leftMeta, parsedCombination.left);
    const rightLabel = formatGestureLabel(rightMeta, parsedCombination.right);

    return [`Linke Hand: ${leftLabel}`, `Rechte Hand: ${rightLabel}`];
  }, [leftMeta, parsedCombination, rightMeta]);

  const fullDetailLines = useMemo(() => {
    if (!showDetails) {
      return [] as string[];
    }

    const lines: string[] = [];

    if (activeDefinition?.description) {
      lines.push(activeDefinition.description);
    }

    if (categoryLabel) {
      lines.push(`Kategorie: ${categoryLabel.toUpperCase()}`);
    }

    if (isSequence && sequenceStepLabels.length > 0) {
      lines.push(`Schritte: ${sequenceStepLabels.join(' → ')}`);
    } else if (combinationLines.length > 0) {
      lines.push(...combinationLines);
    }

    if (resolvedGestureMeta?.dgsVideoUri) {
      lines.push('DGS-Video verfügbar');
    }

    if (openAiLabel && openAiLabel !== displayName) {
      lines.push(`Bestätigung: ${openAiLabel}`);
    }

    if (openAiFeedback) {
      lines.push(`Feedback: ${openAiFeedback}`);
    }

    if (openaiValidationResult?.contextual_meaning) {
      lines.push(`Kontext: ${openaiValidationResult.contextual_meaning}`);
    }

    if (Array.isArray(openaiValidationResult?.reference_sources) && openaiValidationResult.reference_sources.length > 0) {
      lines.push(`Quelle: ${openaiValidationResult.reference_sources[0]}`);
    }

    return lines;
  }, [
    activeDefinition?.description,
    categoryLabel,
    combinationLines,
    displayName,
    isSequence,
    openAiFeedback,
    openAiLabel,
    openaiValidationResult?.contextual_meaning,
    openaiValidationResult?.reference_sources,
    resolvedGestureMeta?.dgsVideoUri,
    sequenceStepLabels,
    showDetails,
  ]);

  const shouldShowToggle = detailsStartCollapsed && fullDetailLines.length > 0;
  const shouldRenderDetails =
    fullDetailLines.length > 0 && (!shouldShowToggle || detailsExpanded);
  const detailLines = shouldRenderDetails ? fullDetailLines : ([] as string[]);

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

  const isCameraTone = !highContrast && tone === 'camera';

  const palette = highContrast
    ? {
        container: COLORS.highContrastBackground,
        borderColor: COLORS.highContrastText,
        borderWidth: 2,
        emojiBackground: COLORS.highContrastText,
        emojiColor: COLORS.highContrastBackground,
        textPrimary: COLORS.highContrastText,
        textSecondary: COLORS.highContrastText,
        textMuted: COLORS.highContrastText,
        detailBackground: COLORS.surface,
        detailBorderColor: COLORS.highContrastText,
        detailBorderWidth: 1,
        detailText: COLORS.highContrastText,
        togglePressed: COLORS.highContrastPressed,
      }
    : isCameraTone
      ? {
          container: CAMERA_CARD_TONE.background,
          borderColor: CAMERA_CARD_TONE.border,
          borderWidth: 1,
          emojiBackground: CAMERA_CARD_TONE.symbolBadge,
          emojiColor: CAMERA_CARD_TONE.symbol,
          textPrimary: CAMERA_CARD_TONE.primaryText,
          textSecondary: CAMERA_CARD_TONE.secondaryText,
          textMuted: CAMERA_CARD_TONE.mutedText,
          detailBackground: CAMERA_CARD_TONE.panelBackground,
          detailBorderColor: CAMERA_CARD_TONE.border,
          detailBorderWidth: 1,
          detailText: CAMERA_CARD_TONE.primaryText,
          togglePressed: 'rgba(0, 44, 44, 0.12)',
        }
      : {
          container: COLORS.overlayBackdrop,
          borderColor: COLORS.overlayBorder,
          borderWidth: 0,
          emojiBackground: COLORS.surface,
          emojiColor: COLORS.overlayText,
          textPrimary: COLORS.overlayText,
          textSecondary: COLORS.overlayTextMuted,
          textMuted: COLORS.overlayTextMuted,
          detailBackground: COLORS.overlaySurface,
          detailBorderColor: COLORS.overlayBorder,
          detailBorderWidth: 1,
          detailText: COLORS.overlayText,
          togglePressed: COLORS.overlaySurfaceMuted,
        };

  const styles = StyleSheet.create({
    container: {
      alignItems: 'center',
      backgroundColor: palette.container,
      borderRadius: DEFAULT_RADIUS,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderWidth: palette.borderWidth,
      borderColor: palette.borderColor,
    },
    symbolBadge: {
      width: sizes.symbolSize + SPACING.md,
      height: sizes.symbolSize + SPACING.md,
      borderRadius: (sizes.symbolSize + SPACING.md) / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.emojiBackground,
      marginBottom: SPACING.xs,
    },
    symbol: {
      fontSize: sizes.symbolSize,
      color: palette.emojiColor,
    },
    metaText: {
      fontSize: largeText ? 14 : 12,
      color: palette.textMuted,
      textAlign: 'center',
      marginBottom: SPACING.xs / 2,
    },
    gestureName: {
      fontSize: sizes.textSize,
      fontWeight: 'bold',
      color: palette.textPrimary,
      textAlign: 'center',
    },
    confidenceText: {
      fontSize: sizes.confidenceSize,
      color: palette.textSecondary,
      textAlign: 'center',
      marginTop: SPACING.xs,
    },
    detailsContainer: {
      alignSelf: 'stretch',
      backgroundColor: palette.detailBackground,
      borderRadius: DEFAULT_RADIUS,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderWidth: palette.detailBorderWidth,
      borderColor: palette.detailBorderColor,
      marginTop: SPACING.sm,
    },
    detailsText: {
      fontSize: largeText ? 14 : 12,
      color: palette.detailText,
      textAlign: 'center',
      marginBottom: SPACING.xs,
      lineHeight: largeText ? 20 : 18,
    },
    detailsTextLast: {
      marginBottom: 0,
    },
    toggleButton: {
      alignSelf: 'stretch',
      marginTop: SPACING.sm,
      paddingVertical: SPACING.xs,
      paddingHorizontal: SPACING.sm,
      borderRadius: DEFAULT_RADIUS,
    },
    toggleButtonPressed: {
      backgroundColor: palette.togglePressed,
    },
    toggleText: {
      fontSize: largeText ? 16 : 14,
      fontWeight: '600',
      color: highContrast ? COLORS.highContrastText : palette.textSecondary,
      textAlign: 'center',
      textDecorationLine: 'underline',
    },
  });

  const metaLabel = isSequence
    ? 'Gestenfolge erkannt'
    : isCombination
      ? 'Koordinierte Geste erkannt'
      : 'Erkannte Geste';

  return (
    <View style={styles.container}>
      <View style={styles.symbolBadge}>
        <Text style={styles.symbol}>{combinedEmoji}</Text>
      </View>

      <Text style={styles.metaText}>{metaLabel}</Text>

      <Text style={styles.gestureName}>{displayName}</Text>

      <Text style={styles.confidenceText}>
        {Math.round(confidence * 100)}% {CONFIDENCE_LABEL}
      </Text>

      {shouldShowToggle ? (
        <Pressable
          style={({ pressed }) => [
            styles.toggleButton,
            pressed && styles.toggleButtonPressed,
          ]}
          onPress={() => setDetailsExpanded((prev) => !prev)}
          accessibilityRole="button"
          accessibilityLabel={
            detailsExpanded
              ? 'Details zur Geste ausblenden'
              : 'Details zur Geste anzeigen'
          }
        >
          <Text style={styles.toggleText}>
            {detailsExpanded ? 'Weniger Details' : 'Mehr Details'}
          </Text>
        </Pressable>
      ) : null}

      {detailLines.length > 0 ? (
        <View style={styles.detailsContainer}>
          {detailLines.map((line, index) => (
            <Text
              key={`${line}-${index}`}
              style={[
                styles.detailsText,
                index === detailLines.length - 1 && styles.detailsTextLast,
              ]}
            >
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
