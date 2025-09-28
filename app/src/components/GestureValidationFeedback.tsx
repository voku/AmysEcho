/**
 * Gesture Validation Feedback Component - Amy First
 *
 * Provides detailed feedback for gesture validation during training
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import { useAccessibility } from './AccessibilityContext';

interface GestureValidationFeedbackProps {
  isValid: boolean;
  message: string;
  suggestions: string[];
}

export default function GestureValidationFeedback({
  isValid,
  message,
  suggestions
}: GestureValidationFeedbackProps) {
  const { largeText, highContrast } = useAccessibility();

  const styles = StyleSheet.create({
    container: {
      backgroundColor: highContrast ? COLORS.surface : 'rgba(255, 255, 255, 0.95)',
      borderRadius: DEFAULT_RADIUS,
      padding: SPACING.md,
      marginVertical: SPACING.sm,
      borderWidth: highContrast ? 2 : 1,
      borderColor: isValid
        ? (highContrast ? COLORS.highContrastText : COLORS.success)
        : (highContrast ? COLORS.highContrastText : COLORS.warning),
      minWidth: 280,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: suggestions.length > 0 ? SPACING.sm : 0,
    },
    icon: {
      fontSize: largeText ? 20 : 18,
      marginRight: SPACING.xs,
    },
    message: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      flex: 1,
    },
    suggestionsContainer: {
      backgroundColor: highContrast ? COLORS.backgroundEnd : 'rgba(0, 0, 0, 0.05)',
      borderRadius: DEFAULT_RADIUS,
      padding: SPACING.sm,
    },
    suggestionsTitle: {
      fontSize: largeText ? 14 : 12,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      marginBottom: SPACING.xs,
    },
    suggestion: {
      fontSize: largeText ? 12 : 10,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      marginBottom: SPACING.xs,
      lineHeight: largeText ? 16 : 14,
    },
    suggestionBullet: {
      fontSize: largeText ? 12 : 10,
      color: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
      fontWeight: 'bold',
      marginRight: SPACING.xs,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>
          {isValid ? '✅' : '💡'}
        </Text>
        <Text style={styles.message}>{message}</Text>
      </View>

      {suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <Text style={styles.suggestionsTitle}>
            💡 Tipps zur Verbesserung:
          </Text>
          {suggestions.map((suggestion, index) => (
            <View key={index} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Text style={styles.suggestionBullet}>•</Text>
              <Text style={styles.suggestion}>{suggestion}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}