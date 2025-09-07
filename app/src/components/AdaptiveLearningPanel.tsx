/**
 * Adaptive Learning Panel - Amy First
 * Shows personalized learning recommendations and progress tracking
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAccessibility } from './AccessibilityContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { useTheme } from '../context/ThemeContext';
import { adaptiveLearningService, AdaptiveRecommendation } from '../services/adaptiveLearningService';

interface AdaptiveLearningPanelProps {
  visible: boolean;
  onClose: () => void;
  onStartRecommendation: (recommendation: AdaptiveRecommendation) => void;
  availableTime?: number; // minutes
}

const AdaptiveLearningPanel: React.FC<AdaptiveLearningPanelProps> = ({
  visible,
  onClose,
  onStartRecommendation,
  availableTime = 10,
}) => {
  const { largeText, highContrast } = useAccessibility();
  const { theme } = useTheme();
  const [recommendations, setRecommendations] = useState<AdaptiveRecommendation[]>([]);
  const [learningProgress, setLearningProgress] = useState<any>(null);
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      // Get adaptive recommendations
      const adaptiveRecs = adaptiveLearningService.getAdaptiveRecommendations(
        [], // Could pass recent activity
        availableTime
      );
      setRecommendations(adaptiveRecs);

      // Get learning progress
      const progress = adaptiveLearningService.getLearningProgress();
      setLearningProgress(progress);

      // Animate in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      // Animate out
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, availableTime, fadeAnim]);

  const handleStartRecommendation = (recommendation: AdaptiveRecommendation) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onStartRecommendation(recommendation);
  };

  const getRecommendationIcon = (type: string) => {
    switch (type) {
      case 'practice':
        return '🎯';
      case 'review':
        return '🔄';
      case 'challenge':
        return '🚀';
      case 'break':
        return '☕';
      default:
        return '📚';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return theme.colors.error;
      case 'high':
        return theme.colors.warning;
      case 'medium':
        return theme.colors.accent;
      case 'low':
        return COLORS.textMuted;
      default:
        return COLORS.primaryAccent;
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return theme.colors.success;
      case 'medium':
        return theme.colors.warning;
      case 'hard':
        return theme.colors.error;
      default:
        return theme.colors.accent;
    }
  };

  const styles = StyleSheet.create({
    modal: {
      flex: 1,
      backgroundColor: `${COLORS.highContrastBackground}CC`,
      justifyContent: 'center',
      alignItems: 'center',
    },
    container: {
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
      borderRadius: RADIUS * 2,
      padding: SPACING.lg,
      margin: SPACING.lg,
      maxWidth: '90%',
      maxHeight: '85%',
      borderWidth: highContrast ? 2 : 0,
      borderColor: highContrast ? COLORS.highContrastText : 'transparent',
      elevation: 5,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    title: {
      fontSize: largeText ? 24 : 20,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      flex: 1,
    },
    closeButton: {
      padding: SPACING.sm,
      borderRadius: RADIUS,
      backgroundColor: highContrast ? COLORS.textMuted : COLORS.secondaryAccent,
    },
    closeButtonText: {
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      fontWeight: 'bold',
    },
    progressSection: {
      backgroundColor: highContrast ? COLORS.textMuted : COLORS.backgroundEnd,
      borderRadius: RADIUS,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    progressTitle: {
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
      marginBottom: SPACING.sm,
    },
    progressStats: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    progressStat: {
      alignItems: 'center',
    },
    progressValue: {
      fontSize: largeText ? 20 : 18,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    progressLabel: {
      fontSize: largeText ? 12 : 10,
      color: highContrast ? COLORS.border : COLORS.textMuted,
      textAlign: 'center',
    },
    recommendationsSection: {
      flex: 1,
    },
    sectionTitle: {
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
      marginBottom: SPACING.sm,
    },
    recommendationCard: {
      backgroundColor: highContrast ? COLORS.text : COLORS.backgroundEnd,
      borderRadius: RADIUS,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      borderWidth: highContrast ? 1 : 0,
      borderColor: highContrast ? COLORS.highContrastText : 'transparent',
    },
    recommendationHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    recommendationIcon: {
      fontSize: largeText ? 24 : 20,
      marginRight: SPACING.sm,
    },
    recommendationTitle: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      flex: 1,
    },
    priorityBadge: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS / 2,
      alignSelf: 'flex-start',
    },
    priorityText: {
      fontSize: largeText ? 12 : 10,
      fontWeight: 'bold',
      color: COLORS.highContrastText,
    },
    recommendationReason: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      marginBottom: SPACING.sm,
      lineHeight: largeText ? 18 : 16,
    },
    recommendationMeta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    metaItem: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    metaText: {
      fontSize: largeText ? 12 : 10,
      color: highContrast ? COLORS.border : COLORS.textMuted,
      marginLeft: SPACING.xs,
    },
    startButton: {
      backgroundColor: COLORS.primaryAccent,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS,
      alignItems: 'center',
    },
    startButtonText: {
      fontSize: largeText ? 14 : 12,
      fontWeight: 'bold',
      color: COLORS.highContrastText,
    },
    emptyState: {
      alignItems: 'center',
      padding: SPACING.lg,
    },
    emptyStateText: {
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      textAlign: 'center',
    },
  });

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.modal, { opacity: fadeAnim }]}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Persönliches Lernen</Text>
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Schließen"
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Learning Progress */}
            {learningProgress && (
              <View style={styles.progressSection}>
                <Text style={styles.progressTitle}>Dein Lernfortschritt</Text>
                <View style={styles.progressStats}>
                  <View style={styles.progressStat}>
                    <Text style={styles.progressValue}>{learningProgress.totalGesturesPracticed}</Text>
                    <Text style={styles.progressLabel}>Geübte{'\n'}Gesten</Text>
                  </View>
                  <View style={styles.progressStat}>
                    <Text style={styles.progressValue}>{learningProgress.masteredGestures}</Text>
                    <Text style={styles.progressLabel}>Beherrschte{'\n'}Gesten</Text>
                  </View>
                  <View style={styles.progressStat}>
                    <Text style={styles.progressValue}>
                      {learningProgress.averageConfidence > 0
                        ? Math.round(learningProgress.averageConfidence * 100)
                        : 0}%
                    </Text>
                    <Text style={styles.progressLabel}>Durchschnitt{'\n'}Vertrauen</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Recommendations */}
            <View style={styles.recommendationsSection}>
              <Text style={styles.sectionTitle}>Empfehlungen für dich</Text>

              {recommendations.length > 0 ? (
                recommendations.map((rec, index) => (
                  <View key={index} style={styles.recommendationCard}>
                    <View style={styles.recommendationHeader}>
                      <Text style={styles.recommendationIcon}>
                        {getRecommendationIcon(rec.type)}
                      </Text>
                      <Text style={styles.recommendationTitle}>
                        {rec.gesture || rec.type === 'break' ? 'Pause' : 'Aktivität'}
                      </Text>
                      <View
                        style={[
                          styles.priorityBadge,
                          { backgroundColor: getPriorityColor(rec.priority) }
                        ]}
                      >
                        <Text style={styles.priorityText}>
                          {rec.priority.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.recommendationReason}>
                      {rec.reason}
                    </Text>

                    <View style={styles.recommendationMeta}>
                      <View style={styles.metaItem}>
                        <Text style={{ color: getDifficultyColor(rec.expectedDifficulty) }}>
                          ●
                        </Text>
                        <Text style={styles.metaText}>
                          {rec.expectedDifficulty}
                        </Text>
                      </View>
                      <View style={styles.metaItem}>
                        <Text style={styles.metaText}>
                          ⏱️ {rec.estimatedTime} Min
                        </Text>
                      </View>
                      <View style={styles.metaItem}>
                        <Text style={styles.metaText}>
                          🎯 {Math.round(rec.confidence * 100)}%
                        </Text>
                      </View>
                    </View>

                    <Pressable
                      style={styles.startButton}
                      onPress={() => handleStartRecommendation(rec)}
                      accessibilityRole="button"
                      accessibilityLabel={`Starte ${rec.gesture || rec.type}`}
                    >
                      <Text style={styles.startButtonText}>
                        Jetzt starten
                      </Text>
                    </Pressable>
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>
                    Großartig! Du bist auf einem guten Weg.{'\n'}
                    Keine speziellen Empfehlungen im Moment.
                  </Text>
                </View>
              )}
            </View>
            </ScrollView>
          </View>
      </Animated.View>
    </Modal>
  );
};

export default AdaptiveLearningPanel;