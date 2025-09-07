import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAccessibility } from './AccessibilityContext';
import { COLORS, SPACING } from '../constants/ui';
import { useThemeMessages } from '../utils/themeMessages';
import { childFriendlyStyles } from '../styles/touchTargets';

interface GestureAttempt {
  id: string;
  label: string;
  confidence: number;
  timestamp: number;
}

interface GestureComparisonProps {
  userAttempt: GestureAttempt;
  correctGesture: {
    id: string;
    label: string;
    videoUri?: string;
    dgsVideoUri?: string;
  };
  onClose: () => void;
  onTryAgain: () => void;
}

export default function GestureComparison({
  userAttempt,
  correctGesture,
  onClose,
  onTryAgain
}: GestureComparisonProps) {
  const { largeText, highContrast } = useAccessibility();
  const { getTryAgainMessage } = useThemeMessages();

  const getEncouragingMessage = () => {
    return getTryAgainMessage();
  };

  const handleTryAgain = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onTryAgain();
  };

  const handleClose = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  return (
    <View style={[styles.overlay, highContrast && styles.overlayHC]} testID="gesture-comparison-overlay">
      <View style={[styles.container, highContrast && styles.containerHC]}>
        <Text style={[styles.title, largeText && styles.titleLarge, highContrast && styles.titleHC]}>
          🤝 Geste vergleichen
        </Text>

        <Text style={[styles.message, largeText && styles.messageLarge, highContrast && styles.messageHC]}>
          {getEncouragingMessage()}
        </Text>

        <View style={styles.comparisonContainer}>
          {/* User's Attempt */}
          <View style={[styles.gestureCard, highContrast && styles.gestureCardHC]}>
            <Text style={[styles.cardTitle, largeText && styles.cardTitleLarge, highContrast && styles.cardTitleHC]}>
              Dein Versuch
            </Text>
            <View style={[styles.gestureDisplay, styles.userAttempt]}>
              <Text style={[styles.gestureLabel, largeText && styles.gestureLabelLarge, highContrast && styles.gestureLabelHC]}>
                {userAttempt.label}
              </Text>
              <Text style={[styles.confidenceText, largeText && styles.confidenceTextLarge, highContrast && styles.confidenceTextHC]}>
                {Math.round(userAttempt.confidence * 100)}%
              </Text>
            </View>
            <Text style={[styles.encouragement, largeText && styles.encouragementLarge, highContrast && styles.encouragementHC]}>
              ⭐ Gut gemacht!
            </Text>
          </View>

          {/* Correct Gesture */}
          <View style={[styles.gestureCard, styles.correctCard, highContrast && styles.gestureCardHC]}>
            <Text style={[styles.cardTitle, largeText && styles.cardTitleLarge, highContrast && styles.cardTitleHC]}>
              So geht's
            </Text>
            <View style={[styles.gestureDisplay, styles.correctGesture]}>
              <Text style={[styles.gestureLabel, largeText && styles.gestureLabelLarge, highContrast && styles.gestureLabelHC]}>
                {correctGesture.label}
              </Text>
              <Text style={[styles.instructionText, largeText && styles.instructionTextLarge, highContrast && styles.instructionTextHC]}>
                Richtige Geste
              </Text>
            </View>
            <Text style={[styles.encouragement, largeText && styles.encouragementLarge, highContrast && styles.encouragementHC]}>
              🎯 Ziel
            </Text>
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <Pressable
            onPress={handleTryAgain}
            style={({ pressed }) => [
              childFriendlyStyles.minTouchTarget,
              styles.button,
              styles.tryAgainButton,
              pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
            ]}
            accessibilityLabel="Nochmal versuchen"
            accessibilityRole="button"
            accessibilityHint="Die Geste nochmal versuchen"
          >
            <Text style={[styles.buttonText, largeText && styles.buttonTextLarge, highContrast && styles.buttonTextHC]}>
              🔄 Nochmal versuchen
            </Text>
          </Pressable>

          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [
              childFriendlyStyles.minTouchTarget,
              styles.button,
              styles.closeButton,
              pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
            ]}
            accessibilityLabel="Schließen"
            accessibilityRole="button"
            accessibilityHint="Vergleich schließen"
          >
            <Text style={[styles.buttonText, largeText && styles.buttonTextLarge, highContrast && styles.buttonTextHC]}>
              ✅ Fertig
            </Text>
          </Pressable>
        </View>

        <Text style={[styles.hint, largeText && styles.hintLarge, highContrast && styles.hintHC]}>
          💡 Übung macht den Meister! Du schaffst das!
        </Text>
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
  overlayHC: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.lg,
    margin: SPACING.md,
    maxWidth: 400,
    width: '90%',
    shadowColor: COLORS.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  containerHC: {
    backgroundColor: COLORS.highContrastBackground,
    borderColor: COLORS.highContrastText,
    borderWidth: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  titleLarge: {
    fontSize: 28,
  },
  titleHC: {
    color: COLORS.highContrastText,
  },
  message: {
    fontSize: 16,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    lineHeight: 22,
  },
  messageLarge: {
    fontSize: 18,
    lineHeight: 24,
  },
  messageHC: {
    color: COLORS.highContrastPressed,
  },
  comparisonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
    gap: SPACING.md,
  },
  gestureCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  gestureCardHC: {
    backgroundColor: COLORS.highContrastBackground,
    borderColor: COLORS.highContrastText,
  },
  correctCard: {
    backgroundColor: COLORS.warningBackground,
    borderColor: COLORS.success,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  cardTitleLarge: {
    fontSize: 18,
  },
  cardTitleHC: {
    color: COLORS.highContrastText,
  },
  gestureDisplay: {
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: 8,
    marginBottom: SPACING.sm,
    minHeight: 80,
    justifyContent: 'center',
  },
  userAttempt: {
    backgroundColor: COLORS.primaryAccent,
  },
  correctGesture: {
    backgroundColor: COLORS.success,
  },
  gestureLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.surface,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  gestureLabelLarge: {
    fontSize: 22,
  },
  gestureLabelHC: {
    color: COLORS.highContrastBackground,
  },
  confidenceText: {
    fontSize: 14,
    color: COLORS.surface,
    opacity: 0.9,
  },
  confidenceTextLarge: {
    fontSize: 16,
  },
  confidenceTextHC: {
    color: COLORS.highContrastBackground,
  },
  instructionText: {
    fontSize: 12,
    color: COLORS.surface,
    opacity: 0.8,
    fontStyle: 'italic',
  },
  instructionTextLarge: {
    fontSize: 14,
  },
  instructionTextHC: {
    color: COLORS.highContrastBackground,
  },
  encouragement: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  encouragementLarge: {
    fontSize: 14,
  },
  encouragementHC: {
    color: COLORS.highContrastPressed,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  button: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tryAgainButton: {
    backgroundColor: COLORS.primaryAccent,
  },
  closeButton: {
    backgroundColor: COLORS.secondaryAccent,
  },
  buttonPressed: {
    backgroundColor: COLORS.pressed,
  },
  buttonPressedHC: {
    backgroundColor: COLORS.highContrastPressed,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.surface,
  },
  buttonTextLarge: {
    fontSize: 18,
  },
  buttonTextHC: {
    color: COLORS.highContrastBackground,
  },
  hint: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.sm,
    fontStyle: 'italic',
  },
  hintLarge: {
    fontSize: 14,
  },
  hintHC: {
    color: COLORS.highContrastPressed,
  },
});