/**
 * Progress Tracker Component - Amy First
 *
 * Visual progress indicator for training sessions and tasks
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { useAccessibility } from './AccessibilityContext';

interface ProgressTrackerProps {
  current: number;
  total: number;
  label: string;
  showPercentage?: boolean;
  color?: string;
}

export default function ProgressTracker({
  current,
  total,
  label,
  showPercentage = false,
  color = COLORS.primaryAccent
}: ProgressTrackerProps) {
  const { largeText, highContrast } = useAccessibility();

  const percentage = Math.min(100, Math.max(0, (current / total) * 100));
  const isComplete = current >= total;

  const styles = StyleSheet.create({
    container: {
      alignItems: 'center',
      marginVertical: SPACING.sm,
    },
    label: {
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      marginBottom: SPACING.xs,
      textAlign: 'center',
    },
    progressContainer: {
      width: '100%',
      maxWidth: 300,
      height: 12,
      backgroundColor: highContrast ? COLORS.surface : COLORS.backgroundEnd,
      borderRadius: RADIUS,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
      overflow: 'hidden',
    },
    progressBar: {
      height: '100%',
      backgroundColor: isComplete ? COLORS.success : color,
      borderRadius: RADIUS,
      width: `${percentage}%`,
    },
    progressText: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      marginTop: SPACING.xs,
      textAlign: 'center',
    },
    completionIndicator: {
      fontSize: largeText ? 18 : 16,
      color: COLORS.success,
      fontWeight: 'bold',
      marginTop: SPACING.xs,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}: {current} / {total}
        {showPercentage && ` (${Math.round(percentage)}%)`}
      </Text>

      <View style={styles.progressContainer}>
        <View style={styles.progressBar} />
      </View>

      {isComplete && (
        <Text style={styles.completionIndicator}>
          🎉 Vollständig!
        </Text>
      )}

      {showPercentage && !isComplete && (
        <Text style={styles.progressText}>
          {Math.round(percentage)}% abgeschlossen
        </Text>
      )}
    </View>
  );
}