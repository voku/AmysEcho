/**
 * Profile Analytics Component - Amy First
 *
 * Displays comprehensive analytics for user profile performance
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { useAccessibility } from './AccessibilityContext';
import { childHaptic } from '../services/feedbackService';

interface ProfileStats {
  totalGestures: number;
  uniqueGestures: number;
  averageConfidence: number;
  mostUsedGesture: {
    id: string;
    label: string;
    count: number;
  } | null;
  recentActivity: {
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
}

interface ProfileAnalyticsProps {
  stats: ProfileStats;
  onClose: () => void;
  onViewDetails: () => void;
}

export default function ProfileAnalytics({
  stats,
  onClose,
  onViewDetails
}: ProfileAnalyticsProps) {
  const { largeText, highContrast } = useAccessibility();

  const getPerformanceLevel = () => {
    const avgConfidence = stats.averageConfidence;
    if (avgConfidence >= 0.8) return { level: 'Ausgezeichnet', color: COLORS.success, emoji: '🏆' };
    if (avgConfidence >= 0.7) return { level: 'Sehr gut', color: COLORS.primaryAccent, emoji: '⭐' };
    if (avgConfidence >= 0.6) return { level: 'Gut', color: COLORS.warning, emoji: '👍' };
    return { level: 'Aufbauend', color: COLORS.error, emoji: '🌱' };
  };

  const performance = getPerformanceLevel();

  const styles = StyleSheet.create({
    container: {
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
      borderRadius: RADIUS,
      padding: SPACING.lg,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
      minWidth: 320,
      maxWidth: 400,
      maxHeight: '80%',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.lg,
    },
    title: {
      fontSize: largeText ? 20 : 18,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    closeButtonHeader: {
      padding: SPACING.xs,
    },
    closeText: {
      fontSize: largeText ? 18 : 16,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    performanceCard: {
      backgroundColor: highContrast ? COLORS.surface : 'rgba(0, 0, 0, 0.05)',
      borderRadius: RADIUS,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
      alignItems: 'center',
    },
    performanceEmoji: {
      fontSize: largeText ? 32 : 28,
      marginBottom: SPACING.xs,
    },
    performanceLevel: {
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
      color: performance.color,
      marginBottom: SPACING.xs,
    },
    performanceDescription: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      textAlign: 'center',
    },
    statsGrid: {
      marginBottom: SPACING.lg,
    },
    statRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    statLabel: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    statValue: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    activitySection: {
      marginBottom: SPACING.lg,
    },
    sectionTitle: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      marginBottom: SPACING.sm,
    },
    activityItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: SPACING.xs,
    },
    activityLabel: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    activityValue: {
      fontSize: largeText ? 14 : 12,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    mostUsedCard: {
      backgroundColor: highContrast ? COLORS.surface : 'rgba(0, 0, 0, 0.05)',
      borderRadius: RADIUS,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
    },
    mostUsedTitle: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      marginBottom: SPACING.xs,
    },
    mostUsedGesture: {
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    mostUsedCount: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
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
    detailsButton: {
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
        <Pressable
          style={styles.closeButtonHeader}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Schließen"
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Performance Level */}
        <View style={styles.performanceCard}>
          <Text style={styles.performanceEmoji}>{performance.emoji}</Text>
          <Text style={styles.performanceLevel}>{performance.level}</Text>
          <Text style={styles.performanceDescription}>
            Durchschnittliche Sicherheit: {Math.round(stats.averageConfidence * 100)}%
          </Text>
        </View>

        {/* Key Statistics */}
        <View style={styles.statsGrid}>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Gesamt-Gesten</Text>
            <Text style={styles.statValue}>{stats.totalGestures}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Einzigartige Gesten</Text>
            <Text style={styles.statValue}>{stats.uniqueGestures}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Durchschn. Sicherheit</Text>
            <Text style={styles.statValue}>{Math.round(stats.averageConfidence * 100)}%</Text>
          </View>
        </View>

        {/* Most Used Gesture */}
        {stats.mostUsedGesture && (
          <View style={styles.mostUsedCard}>
            <Text style={styles.mostUsedTitle}>Am häufigsten verwendet:</Text>
            <Text style={styles.mostUsedGesture}>{stats.mostUsedGesture.label}</Text>
            <Text style={styles.mostUsedCount}>
              {stats.mostUsedGesture.count} mal verwendet
            </Text>
          </View>
        )}

        {/* Recent Activity */}
        <View style={styles.activitySection}>
          <Text style={styles.sectionTitle}>Aktivität</Text>
          <View style={styles.activityItem}>
            <Text style={styles.activityLabel}>Heute</Text>
            <Text style={styles.activityValue}>{stats.recentActivity.today}</Text>
          </View>
          <View style={styles.activityItem}>
            <Text style={styles.activityLabel}>Diese Woche</Text>
            <Text style={styles.activityValue}>{stats.recentActivity.thisWeek}</Text>
          </View>
          <View style={styles.activityItem}>
            <Text style={styles.activityLabel}>Dieser Monat</Text>
            <Text style={styles.activityValue}>{stats.recentActivity.thisMonth}</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonsContainer}>
          <Pressable
            style={[styles.button, styles.detailsButton]}
            onPress={() => {
              void childHaptic();
              onViewDetails();
            }}
            accessibilityRole="button"
            accessibilityLabel="Detaillierte Analyse anzeigen"
          >
            <Text style={styles.buttonText}>📊 Details</Text>
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
      </ScrollView>
    </View>
  );
}