/**
 * OpenAI Gesture Feedback Component
 *
 * Displays feedback from OpenAI Vision gesture validation
 * Shows when AI validation is used and provides detailed feedback
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, RADIUS } from '../constants/ui';
import { useAccessibility } from './AccessibilityContext';

interface OpenAIGestureFeedbackProps {
  isVisible: boolean;
  validationResult?: {
    gesture: string;
    confidence: number;
    feedback: string;
    quality_score: number;
    suggestions?: string[];
    validation_source: 'mediapipe' | 'openai' | 'combined';
  };
  onDismiss?: () => void;
  onApplySuggestion?: (suggestion?: string) => void;
}

export default function OpenAIGestureFeedback({
  isVisible,
  validationResult,
  onDismiss,
  onApplySuggestion,
}: OpenAIGestureFeedbackProps) {
  const { largeText, highContrast } = useAccessibility();

  if (!isVisible || !validationResult) {
    return null;
  }

  const getValidationSourceText = (source: string) => {
    switch (source) {
      case 'openai':
        return 'KI-gestützte Erkennung';
      case 'combined':
        return 'Kombinierte Erkennung';
      default:
        return 'Standard-Erkennung';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return COLORS.success;
    if (confidence >= 0.6) return COLORS.warning;
    return COLORS.error;
  };

  const getQualityColor = (score: number) => {
    if (score >= 8) return COLORS.success;
    if (score >= 6) return COLORS.warning;
    return COLORS.error;
  };

  const getQualityText = (score: number) => {
    if (score >= 8) return 'Ausgezeichnet';
    if (score >= 6) return 'Gut';
    if (score >= 4) return 'Verbesserung möglich';
    return 'Übung empfohlen';
  };

  return (
    <View style={[styles.overlay, highContrast && styles.highContrastOverlay]}>
      <View style={[styles.container, highContrast && styles.highContrastContainer]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, largeText && styles.largeTitle, highContrast && styles.highContrastText]}>
            KI-Gestenerkennung
          </Text>
          <Text style={[styles.subtitle, largeText && styles.largeSubtitle, highContrast && styles.highContrastText]}>
            {getValidationSourceText(validationResult.validation_source)}
          </Text>
        </View>

        {/* Main Content */}
        <View style={styles.content}>
          {/* Gesture and Confidence */}
          <View style={styles.gestureRow}>
            <Text style={[styles.gestureText, largeText && styles.largeGestureText, highContrast && styles.highContrastText]}>
              {validationResult.gesture}
            </Text>
            <View style={[styles.confidenceBadge, { backgroundColor: getConfidenceColor(validationResult.confidence) }]}>
              <Text style={[styles.confidenceText, largeText && styles.largeConfidenceText]}>
                {Math.round(validationResult.confidence * 100)}%
              </Text>
            </View>
          </View>

          {/* Quality Score */}
          <View style={styles.qualityRow}>
            <Text style={[styles.qualityLabel, largeText && styles.largeQualityLabel, highContrast && styles.highContrastText]}>
              Qualität:
            </Text>
            <View style={[styles.qualityBadge, { backgroundColor: getQualityColor(validationResult.quality_score) }]}>
              <Text style={[styles.qualityText, largeText && styles.largeQualityText]}>
                {getQualityText(validationResult.quality_score)}
              </Text>
            </View>
            <Text style={[styles.qualityScore, largeText && styles.largeQualityScore, highContrast && styles.highContrastText]}>
              ({validationResult.quality_score}/10)
            </Text>
          </View>

          {/* Feedback */}
          <View style={styles.feedbackSection}>
            <Text style={[styles.feedbackLabel, largeText && styles.largeFeedbackLabel, highContrast && styles.highContrastText]}>
              Feedback:
            </Text>
            <Text style={[styles.feedbackText, largeText && styles.largeFeedbackText, highContrast && styles.highContrastText]}>
              {validationResult.feedback}
            </Text>
          </View>

          {/* Suggestions */}
          {validationResult.suggestions && validationResult.suggestions.length > 0 && (
            <View style={styles.suggestionsSection}>
              <Text style={[styles.suggestionsLabel, largeText && styles.largeSuggestionsLabel, highContrast && styles.highContrastText]}>
                Verbesserungsvorschläge:
              </Text>
              {validationResult.suggestions.map((suggestion, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.suggestionItem, highContrast && styles.highContrastSuggestionItem]}
                  onPress={() => onApplySuggestion?.(suggestion)}
                >
                  <Text style={[styles.suggestionText, largeText && styles.largeSuggestionText, highContrast && styles.highContrastText]}>
                    • {suggestion}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.dismissButton, highContrast && styles.highContrastDismissButton]}
            onPress={onDismiss}
          >
            <Text style={[styles.dismissButtonText, largeText && styles.largeDismissButtonText, highContrast && styles.highContrastText]}>
              Verstanden
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  highContrastOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  container: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    margin: SPACING.md,
    maxWidth: 400,
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  highContrastContainer: {
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
  },
  largeTitle: {
    fontSize: FONT_SIZES.xl,
  },
  highContrastText: {
    color: COLORS.surface,
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  largeSubtitle: {
    fontSize: FONT_SIZES.md,
  },
  content: {
    marginBottom: SPACING.lg,
  },
  gestureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  gestureText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: COLORS.primary,
    flex: 1,
  },
  largeGestureText: {
    fontSize: FONT_SIZES.xxl,
  },
  confidenceBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    marginLeft: SPACING.sm,
  },
  confidenceText: {
    color: COLORS.surface,
    fontSize: FONT_SIZES.sm,
    fontWeight: 'bold',
  },
  largeConfidenceText: {
    fontSize: FONT_SIZES.md,
  },
  qualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  qualityLabel: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    marginRight: SPACING.sm,
  },
  largeQualityLabel: {
    fontSize: FONT_SIZES.lg,
  },
  qualityBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    marginRight: SPACING.sm,
  },
  qualityText: {
    color: COLORS.surface,
    fontSize: FONT_SIZES.sm,
    fontWeight: 'bold',
  },
  largeQualityText: {
    fontSize: FONT_SIZES.md,
  },
  qualityScore: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  largeQualityScore: {
    fontSize: FONT_SIZES.md,
  },
  feedbackSection: {
    marginBottom: SPACING.md,
  },
  feedbackLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  largeFeedbackLabel: {
    fontSize: FONT_SIZES.lg,
  },
  feedbackText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    lineHeight: 20,
  },
  largeFeedbackText: {
    fontSize: FONT_SIZES.lg,
    lineHeight: 24,
  },
  suggestionsSection: {
    marginBottom: SPACING.md,
  },
  suggestionsLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  largeSuggestionsLabel: {
    fontSize: FONT_SIZES.lg,
  },
  suggestionItem: {
    backgroundColor: COLORS.surface,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.xs,
  },
  highContrastSuggestionItem: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  suggestionText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
  },
  largeSuggestionText: {
    fontSize: FONT_SIZES.md,
  },
  actions: {
    alignItems: 'center',
  },
  dismissButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    minWidth: 120,
  },
  highContrastDismissButton: {
    backgroundColor: COLORS.secondary,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  dismissButtonText: {
    color: COLORS.surface,
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  largeDismissButtonText: {
    fontSize: FONT_SIZES.lg,
  },
});