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
  Animated,
  AccessibilityInfo,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAccessibility } from './AccessibilityContext';
import { useTheme } from '../context/ThemeContext';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import activeLearningService, { PracticeSuggestion as PracticeSuggestionType } from '../services/activeLearningService';

interface PracticeSuggestionProps {
  visible: boolean;
  onAccept: (gesture?: string) => void;
  onDecline: () => void;
  onLater: () => void;
}

const PracticeSuggestion: React.FC<PracticeSuggestionProps> = ({
  visible,
  onAccept,
  onDecline,
  onLater,
}) => {
  const { largeText, highContrast } = useAccessibility();
  const { theme } = useTheme();
  const [suggestion, setSuggestion] = useState<PracticeSuggestionType | null>(null);
  const [slideAnim] = useState(new Animated.Value(120));
  const [isRendered, setIsRendered] = useState(false);

  useEffect(() => {
    if (visible) {
      // Get practice suggestion
      const practiceSuggestion = activeLearningService.getPracticeSuggestion(
        'normal'
      );
      if (practiceSuggestion?.shouldSuggest) {
        setSuggestion(practiceSuggestion);
        setIsRendered(true);
        slideAnim.setValue(120);
        // Animate in from bottom
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
        void AccessibilityInfo.announceForAccessibility(
          `Neuer Übungsvorschlag: ${practiceSuggestion.gesture}. ${practiceSuggestion.reason}`,
        );
      } else {
        setSuggestion(null);
        setIsRendered(false);
      }
    } else {
      // Animate out
      Animated.timing(slideAnim, {
        toValue: 120,
        duration: 200,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setIsRendered(false);
          setSuggestion(null);
        }
      });
    }
  }, [visible, slideAnim]);

  if (!isRendered || !suggestion) {
    return null;
  }

  const improvementPercent = Math.round(suggestion.expectedImprovement * 100);

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



  const styles = StyleSheet.create({
    wrapper: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.lg,
    },
    card: {
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
      borderRadius: DEFAULT_RADIUS * 2,
      padding: SPACING.lg,
      borderWidth: highContrast ? 2 : 0,
      borderColor: highContrast ? COLORS.highContrastText : 'transparent',
      elevation: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    headerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: SPACING.sm,
    },
    urgencyIndicator: {
      width: 14,
      height: 14,
      borderRadius: 7,
      marginRight: SPACING.sm,
    },
    title: {
      fontSize: largeText ? 22 : 18,
      fontWeight: '700',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    closeButton: {
      padding: SPACING.xs,
      marginLeft: SPACING.xs,
    },
    closeButtonLabel: {
      fontSize: largeText ? 18 : 16,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
    },
    message: {
      fontSize: largeText ? 18 : 16,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      marginBottom: SPACING.md,
      lineHeight: largeText ? 24 : 22,
    },
    improvement: {
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      marginBottom: SPACING.md,
    },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
    gesturePill: {
      backgroundColor: highContrast ? COLORS.textMuted : COLORS.primaryAccent,
      borderRadius: DEFAULT_RADIUS,
      paddingVertical: SPACING.xs,
      paddingHorizontal: SPACING.md,
    },
    gesturePillText: {
      color: highContrast ? COLORS.highContrastText : COLORS.highContrastText,
      fontWeight: '700',
      fontSize: largeText ? 16 : 14,
    },
    timeEstimate: {
      fontSize: largeText ? 16 : 14,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
      fontStyle: 'italic',
    },
    buttons: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    button: {
      flex: 1,
      paddingVertical: SPACING.md,
      borderRadius: DEFAULT_RADIUS,
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
      fontSize: largeText ? 18 : 16,
      fontWeight: '700',
      color: highContrast ? COLORS.highContrastText : COLORS.highContrastText,
    },
    laterButtonText: {
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    declineButtonText: {
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
    },
  });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View
              style={[styles.urgencyIndicator, { backgroundColor: getUrgencyColor() }]}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`Dringlichkeit: ${suggestion.urgency}`}
            />
            <Text style={styles.title} accessibilityRole="header">
              Lass uns {suggestion.gesture} üben
            </Text>
          </View>
          <Pressable
            onPress={handleLater}
            accessibilityRole="button"
            accessibilityLabel="Vorschlag schließen"
            style={styles.closeButton}
          >
            <Text style={styles.closeButtonLabel}>×</Text>
          </Pressable>
        </View>

        <Text style={styles.message} accessibilityLiveRegion="polite">
          {suggestion.reason}
        </Text>

        <Text style={styles.improvement}>
          So wird die Erkennung um etwa {improvementPercent}% besser.
        </Text>

        <View style={styles.metaRow}>
          <View style={styles.gesturePill}>
            <Text style={styles.gesturePillText}>{suggestion.gesture}</Text>
          </View>
          <Text style={styles.timeEstimate}>
            {suggestion.timeEstimate} Minuten
          </Text>
        </View>

        <View style={styles.buttons}>
          <Pressable
            style={[styles.button, styles.acceptButton]}
            onPress={handleAccept}
            accessibilityRole="button"
            accessibilityLabel={`Ja, ${suggestion.gesture} jetzt üben`}
          >
            <Text style={styles.buttonText}>Ja</Text>
          </Pressable>

          <Pressable
            style={[styles.button, styles.laterButton]}
            onPress={handleLater}
            accessibilityRole="button"
            accessibilityLabel="Später üben"
          >
            <Text style={[styles.buttonText, styles.laterButtonText]}>Später</Text>
          </Pressable>

          <Pressable
            style={[styles.button, styles.declineButton]}
            onPress={handleDecline}
            accessibilityRole="button"
            accessibilityLabel="Übung ablehnen"
          >
            <Text style={[styles.buttonText, styles.declineButtonText]}>Nein</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
};

export default PracticeSuggestion;