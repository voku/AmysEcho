/**
 * Practice Session Manager Component - Amy First
 *
 * Manages practice sessions with adaptive difficulty and encouragement
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { useAccessibility } from './AccessibilityContext';
import { positiveTelemetryService } from '../services/positiveTelemetryService';

interface PracticeSessionManagerProps {
  gestureId: string;
  currentProgress: number;
  targetSamples: number;
  onSessionComplete: () => void;
}

export default function PracticeSessionManager({
  gestureId,
  currentProgress,
  targetSamples,
  onSessionComplete
}: PracticeSessionManagerProps) {
  const { largeText, highContrast } = useAccessibility();
  const [encouragementMessage, setEncouragementMessage] = useState('');

  useEffect(() => {
    // Update encouragement message based on progress
    const progressPercentage = (currentProgress / targetSamples) * 100;

    if (progressPercentage === 0) {
      setEncouragementMessage('Los geht\'s! Zeige mir die Geste.');
    } else if (progressPercentage < 25) {
      setEncouragementMessage('Gut angefangen! Mach weiter so.');
    } else if (progressPercentage < 50) {
      setEncouragementMessage('Du bist auf einem guten Weg!');
    } else if (progressPercentage < 75) {
      setEncouragementMessage('Fast geschafft! Du machst das toll.');
    } else if (progressPercentage < 100) {
      setEncouragementMessage('Noch ein bisschen! Du schaffst das!');
    } else {
      setEncouragementMessage('🎉 Perfekt! Session abgeschlossen!');
      onSessionComplete();
    }
  }, [currentProgress, targetSamples, onSessionComplete]);

  // Get performance stats for this gesture
  const gestureStats = positiveTelemetryService.getGestureSuccessStats(gestureId);
  const recentSuccessRate = gestureStats ? gestureStats.averageConfidence : 0;

  const getDifficultyLevel = () => {
    if (recentSuccessRate >= 0.8) return { level: 'Fortgeschritten', color: COLORS.success, emoji: '⭐' };
    if (recentSuccessRate >= 0.6) return { level: 'Mittel', color: COLORS.primaryAccent, emoji: '👍' };
    return { level: 'Anfänger', color: COLORS.warning, emoji: '🌱' };
  };

  const difficulty = getDifficultyLevel();

  const styles = StyleSheet.create({
    container: {
      position: 'absolute',
      top: SPACING.md,
      left: SPACING.md,
      right: SPACING.md,
      backgroundColor: highContrast ? COLORS.highContrastBackground : 'rgba(255, 255, 255, 0.95)',
      borderRadius: RADIUS,
      padding: SPACING.md,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 4,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    title: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    difficultyBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: difficulty.color,
      borderRadius: RADIUS,
      paddingHorizontal: SPACING.xs,
      paddingVertical: 2,
    },
    difficultyEmoji: {
      fontSize: largeText ? 14 : 12,
      marginRight: SPACING.xs,
    },
    difficultyText: {
      fontSize: largeText ? 12 : 10,
      color: COLORS.highContrastText,
      fontWeight: 'bold',
    },
    encouragement: {
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
      textAlign: 'center',
      marginBottom: SPACING.sm,
      fontWeight: 'bold',
    },
    progressContainer: {
      backgroundColor: highContrast ? COLORS.surface : COLORS.backgroundEnd,
      borderRadius: RADIUS,
      padding: SPACING.sm,
    },
    progressText: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      textAlign: 'center',
      marginBottom: SPACING.xs,
    },
    progressBar: {
      height: 8,
      backgroundColor: highContrast ? COLORS.borderDark : COLORS.border,
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: COLORS.success,
      borderRadius: 4,
      width: `${(currentProgress / targetSamples) * 100}%`,
    },
    statsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: SPACING.sm,
    },
    statItem: {
      alignItems: 'center',
    },
    statValue: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    statLabel: {
      fontSize: largeText ? 12 : 10,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Übungssession</Text>
        <View style={styles.difficultyBadge}>
          <Text style={styles.difficultyEmoji}>{difficulty.emoji}</Text>
          <Text style={styles.difficultyText}>{difficulty.level}</Text>
        </View>
      </View>

      <Text style={styles.encouragement}>{encouragementMessage}</Text>

      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>
          Fortschritt: {currentProgress} / {targetSamples}
        </Text>
        <View style={styles.progressBar}>
          <View style={styles.progressFill} />
        </View>
      </View>

      {gestureStats && (
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{Math.round(gestureStats.averageConfidence * 100)}%</Text>
            <Text style={styles.statLabel}>Durchschnitt</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{gestureStats.totalSuccesses}</Text>
            <Text style={styles.statLabel}>Erfolge</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {gestureStats.currentStreak}
            </Text>
            <Text style={styles.statLabel}>Aktuelle Serie</Text>
          </View>
        </View>
      )}
    </View>
  );
}