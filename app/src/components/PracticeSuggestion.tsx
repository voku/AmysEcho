/**
 * Practice Suggestion Component - Amy First
 * Shows targeted practice suggestions based on active learning analysis
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAccessibility } from './AccessibilityContext';
import { useTheme } from '../context/ThemeContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { activeLearningService, PracticeSuggestion as PracticeSuggestionType } from '../services/activeLearningService';

interface PracticeSuggestionProps {
  visible: boolean;
  onAccept: (gesture: string) => void;
  onDecline: () => void;
  onLater: () => void;
  currentTimeOfDay: number;
  currentActivity: 'high' | 'low' | 'normal';
  recentGestures: string[];
}

const PracticeSuggestion: React.FC<PracticeSuggestionProps> = ({
  visible,
  onAccept,
  onDecline,
  onLater,
  currentTimeOfDay,
  currentActivity,
  recentGestures,
}) => {
  const { largeText, highContrast } = useAccessibility();
  const { theme } = useTheme();
  const [suggestion, setSuggestion] = useState<PracticeSuggestionType | null>(null);
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      // Get practice suggestion
      const practiceSuggestion = activeLearningService.getPracticeSuggestion(
        currentTimeOfDay,
        currentActivity,
        recentGestures
      );
      setSuggestion(practiceSuggestion);

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
  }, [visible, currentTimeOfDay, currentActivity, recentGestures, fadeAnim]);

  if (!visible || !suggestion || !suggestion.shouldSuggest) {
    return null;
  }

  const handleAccept = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    activeLearningService.markSuggestionShown(suggestion.gesture);
    onAccept(suggestion.gesture);
  };

  const handleDecline = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    activeLearningService.markSuggestionShown(suggestion.gesture);
    onDecline();
  };

  const handleLater = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Don't mark as shown for "later" - can suggest again
    onLater();
  };

  const getUrgencyColor = () => {
    switch (suggestion.urgency) {
      case 'immediate':
        return theme.colors.error;
      case 'soon':
        return theme.colors.warning;
      case 'when_convenient':
        return theme.colors.success;
      default:
        return theme.colors.accent;
    }
  };

  const getUrgencyText = () => {
    switch (suggestion.urgency) {
      case 'immediate':
        return 'Jetzt üben!';
      case 'soon':
        return 'Bald üben';
      case 'when_convenient':
        return 'Wenn es passt';
      default:
        return 'Übungsvorschlag';
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
      maxWidth: '85%',
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
      marginBottom: SPACING.md,
    },
    urgencyIndicator: {
      width: 12,
      height: 12,
      borderRadius: 6,
      marginRight: SPACING.sm,
    },
    title: {
      fontSize: largeText ? 24 : 20,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      flex: 1,
    },
    message: {
      fontSize: largeText ? 18 : 16,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      marginBottom: SPACING.md,
      lineHeight: largeText ? 24 : 22,
    },
    benefits: {
      backgroundColor: highContrast ? COLORS.textMuted : COLORS.backgroundEnd,
      borderRadius: RADIUS,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    benefitTitle: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
      marginBottom: SPACING.sm,
    },
    benefitText: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.border : COLORS.textMuted,
      lineHeight: largeText ? 18 : 16,
    },
    timeEstimate: {
      fontSize: largeText ? 14 : 12,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      fontStyle: 'italic',
      marginBottom: SPACING.md,
    },
    buttons: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    button: {
      flex: 1,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.sm,
      borderRadius: RADIUS,
      alignItems: 'center',
      marginHorizontal: SPACING.xs,
    },
    acceptButton: {
      backgroundColor: COLORS.primaryAccent,
    },
    laterButton: {
      backgroundColor: highContrast ? COLORS.textMuted : COLORS.secondaryAccent,
    },
    declineButton: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    buttonText: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
    },
    acceptButtonText: {
      color: COLORS.highContrastText,
    },
    laterButtonText: {
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    declineButtonText: {
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
    },
  });

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={handleLater}
    >
      <Animated.View style={[styles.modal, { opacity: fadeAnim }]}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={[styles.urgencyIndicator, { backgroundColor: getUrgencyColor() }]} />
            <Text style={styles.title}>Übungsvorschlag</Text>
          </View>

          <Text style={styles.message}>
            {suggestion.reason}
          </Text>

          <View style={styles.benefits}>
            <Text style={styles.benefitTitle}>Warum das hilft:</Text>
            <Text style={styles.benefitText}>
              • Verbessert die Erkennung um ca. {Math.round(suggestion.expectedImprovement * 100)}%
              {'\n'}• Hilft Amy, sich sicherer zu fühlen
              {'\n'}• Lernt aus echten Beispielen
            </Text>
          </View>

          <Text style={styles.timeEstimate}>
            Geschätzte Zeit: {suggestion.timeEstimate} Minuten
          </Text>

          <View style={styles.buttons}>
            <Pressable
              style={[styles.button, styles.acceptButton]}
              onPress={handleAccept}
              accessibilityRole="button"
              accessibilityLabel={`Ja, ${suggestion.gesture} üben`}
            >
              <Text style={[styles.buttonText, styles.acceptButtonText]}>
                Ja, üben!
              </Text>
            </Pressable>

            <Pressable
              style={[styles.button, styles.laterButton]}
              onPress={handleLater}
              accessibilityRole="button"
              accessibilityLabel="Später üben"
            >
              <Text style={[styles.buttonText, styles.laterButtonText]}>
                Später
              </Text>
            </Pressable>

            <Pressable
              style={[styles.button, styles.declineButton]}
              onPress={handleDecline}
              accessibilityRole="button"
              accessibilityLabel="Übung ablehnen"
            >
              <Text style={[styles.buttonText, styles.declineButtonText]}>
                Nein
              </Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
};

export default PracticeSuggestion;