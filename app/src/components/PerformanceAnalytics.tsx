/**
 * Performance Analytics Component - Amy First
 *
 * Displays detailed performance metrics for training sessions
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { useAccessibility } from './AccessibilityContext';

interface PerformanceMetrics {
  averageConfidence: number;
  totalFrames: number;
  successfulFrames: number;
  sessionDuration: number;
}

interface PerformanceAnalyticsProps {
  gestureId: string;
  metrics: PerformanceMetrics;
  onClose: () => void;
  onRetry: () => void;
}

export default function PerformanceAnalytics({
  gestureId,
  metrics,
  onClose,
  onRetry
}: PerformanceAnalyticsProps) {
  const { largeText, highContrast } = useAccessibility();

  const successRate = metrics.totalFrames > 0 ? (metrics.successfulFrames / metrics.totalFrames) * 100 : 0;
  const durationInSeconds = Math.round(metrics.sessionDuration / 1000);

  const getPerformanceRating = () => {
    if (successRate >= 90 && metrics.averageConfidence >= 0.8) return { rating: 'Ausgezeichnet', color: COLORS.success, emoji: '🏆' };
    if (successRate >= 75 && metrics.averageConfidence >= 0.6) return { rating: 'Gut', color: COLORS.primaryAccent, emoji: '👍' };
    if (successRate >= 50) return { rating: 'In Ordnung', color: COLORS.warning, emoji: '👌' };
    return { rating: 'Übe weiter', color: COLORS.error, emoji: '💪' };
  };

  const performance = getPerformanceRating();

  const styles = StyleSheet.create({
    container: {
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
      borderRadius: RADIUS,
      padding: SPACING.lg,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
      minWidth: 320,
      maxWidth: 400,
    },
    header: {
      alignItems: 'center',
      marginBottom: SPACING.lg,
    },
    title: {
      fontSize: largeText ? 20 : 18,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      marginBottom: SPACING.xs,
    },
    gestureId: {
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
    },
    ratingContainer: {
      alignItems: 'center',
      marginBottom: SPACING.lg,
      padding: SPACING.md,
      backgroundColor: highContrast ? COLORS.surface : 'rgba(0, 0, 0, 0.05)',
      borderRadius: RADIUS,
    },
    ratingEmoji: {
      fontSize: largeText ? 32 : 28,
      marginBottom: SPACING.xs,
    },
    ratingText: {
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
      color: performance.color,
    },
    metricsContainer: {
      marginBottom: SPACING.lg,
    },
    metricRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: SPACING.xs,
      borderBottomWidth: 1,
      borderBottomColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    metricLabel: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    metricValue: {
      fontSize: largeText ? 14 : 12,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    buttonsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: SPACING.md,
    },
    button: {
      flex: 1,
      padding: SPACING.md,
      borderRadius: RADIUS,
      alignItems: 'center',
    },
    retryButton: {
      backgroundColor: COLORS.primaryAccent,
    },
    closeButton: {
      backgroundColor: highContrast ? COLORS.highContrastText : COLORS.secondaryAccent,
    },
    buttonText: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: COLORS.highContrastText,
    },
    closeButtonText: {
      color: highContrast ? COLORS.highContrastBackground : COLORS.text,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Leistungsanalyse</Text>
        <Text style={styles.gestureId}>Geste: {gestureId}</Text>
      </View>

      <View style={styles.ratingContainer}>
        <Text style={styles.ratingEmoji}>{performance.emoji}</Text>
        <Text style={styles.ratingText}>{performance.rating}</Text>
      </View>

      <View style={styles.metricsContainer}>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Erfolgsrate</Text>
          <Text style={styles.metricValue}>{Math.round(successRate)}%</Text>
        </View>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Durchschnittliche Sicherheit</Text>
          <Text style={styles.metricValue}>{Math.round(metrics.averageConfidence * 100)}%</Text>
        </View>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Gesamt-Frames</Text>
          <Text style={styles.metricValue}>{metrics.totalFrames}</Text>
        </View>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Erfolgreiche Frames</Text>
          <Text style={styles.metricValue}>{metrics.successfulFrames}</Text>
        </View>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Session-Dauer</Text>
          <Text style={styles.metricValue}>{durationInSeconds}s</Text>
        </View>
      </View>

      <View style={styles.buttonsContainer}>
        <Pressable
          style={[styles.button, styles.retryButton]}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Erneut versuchen"
        >
          <Text style={styles.buttonText}>🔄 Erneut versuchen</Text>
        </Pressable>

        <Pressable
          style={[styles.button, styles.closeButton]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Schließen"
        >
          <Text style={[styles.buttonText, styles.closeButtonText]}>Schließen</Text>
        </Pressable>
      </View>
    </View>
  );
}