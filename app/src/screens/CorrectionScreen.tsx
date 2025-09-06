import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, FlatList } from 'react-native';
import PulsingCircle from '../components/PulsingCircle';
import { LinearGradient } from 'expo-linear-gradient';
import { logCorrection } from '../storage';
import { correctionService } from '../services/correctionService';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { logHIPEvent } from '../services/hipEvents';
import { gestureModel } from '../model';
import { childHaptic } from '../services/feedbackService';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function CorrectionScreen({ navigation, route }: any) {
  const { largeText, highContrast } = useAccessibility();
  const [suggestions, setSuggestions] = useState<Array<{id: string; label: string; confidence: number}>>([]);
  const attemptedGesture = route?.params?.attemptedGesture;

  useEffect(() => {
    if (attemptedGesture) {
      generateSuggestions(attemptedGesture);
    }
  }, [attemptedGesture]);

  const generateSuggestions = (attempted: string) => {
    // Generate suggestions based on attempted gesture
    const allGestures = gestureModel.gestures;
    const suggestionsList: Array<{id: string; label: string; confidence: number}> = [];

    // Add some common alternatives based on gesture categories
    const gestureCategories: Record<string, string[]> = {
      'hello': ['goodbye', 'thank_you', 'please'],
      'goodbye': ['hello', 'thank_you', 'please'],
      'thank_you': ['please', 'hello', 'sorry'],
      'please': ['thank_you', 'hello', 'sorry'],
      'yes': ['no', 'maybe', 'hello'],
      'no': ['yes', 'maybe', 'stop'],
      'stop': ['go', 'wait', 'no'],
      'go': ['stop', 'wait', 'come'],
      'come': ['go', 'wait', 'hello'],
      'wait': ['go', 'stop', 'please'],
      'eat': ['drink', 'food', 'hungry'],
      'drink': ['eat', 'water', 'thirsty'],
      'play': ['game', 'fun', 'happy'],
      'help': ['please', 'sorry', 'stop'],
      'sorry': ['please', 'thank_you', 'help'],
    };

    // Get suggestions from category
    const categorySuggestions = gestureCategories[attempted] || [];
    categorySuggestions.forEach(suggestionId => {
      const gesture = allGestures.find(g => g.id === suggestionId);
      if (gesture) {
        suggestionsList.push({
          id: gesture.id,
          label: gesture.label,
          confidence: 0.8 // High confidence for category matches
        });
      }
    });

    // Add some random common gestures as additional suggestions
    const commonGestures = ['hello', 'thank_you', 'please', 'yes', 'no', 'help'];
    commonGestures.forEach(gestureId => {
      if (gestureId !== attempted && !suggestionsList.find(s => s.id === gestureId)) {
        const gesture = allGestures.find(g => g.id === gestureId);
        if (gesture) {
          suggestionsList.push({
            id: gesture.id,
            label: gesture.label,
            confidence: 0.5 // Medium confidence for common gestures
          });
        }
      }
    });

    // Limit to 6 suggestions
    setSuggestions(suggestionsList.slice(0, 6));
  };

  const handleSuggestionSelect = async (gestureId: string) => {
    void childHaptic();
    await correctionService.logCorrection(gestureId);
    await logCorrection(gestureId);
    void logHIPEvent('HIP_3', 'correction_suggestion_selected', { selected: gestureId, attempted: attemptedGesture });
    navigation.goBack();
  };

  const handleSubmit = async () => {
    await correctionService.logCorrection('correction');
    await logCorrection('correction');
    void logHIPEvent('HIP_3', 'correction_submitted', { actual: 'correction' });
    navigation.goBack();
  };

  const handleCancel = () => {
    navigation.goBack();
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'transparent',
    },
    title: {
      fontSize: largeText ? 24 : 20,
      marginBottom: SPACING.md,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    choiceButton: {
      width: '48%',
      backgroundColor: COLORS.primaryAccent,
      paddingVertical: SPACING.md,
      borderRadius: RADIUS,
      alignItems: 'center',
    },
    choiceButtonHC: {
      backgroundColor: COLORS.highContrastBackground,
      borderWidth: 1,
      borderColor: COLORS.highContrastText,
    },
    choiceButtonText: {
      color: COLORS.highContrastText,
      fontSize: largeText ? 20 : 16,
      fontWeight: 'bold',
    },
    pulseWrapper: {
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.sm,
    },
    suggestionsContainer: {
      width: '100%',
      maxWidth: 400,
      marginBottom: SPACING.lg,
    },
    subtitle: {
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      textAlign: 'center',
      marginBottom: SPACING.md,
    },
    subtitleHC: {
      color: COLORS.highContrastText,
    },
    suggestionsList: {
      alignItems: 'center',
    },
    suggestionButton: {
      backgroundColor: COLORS.surface,
      borderWidth: 2,
      borderColor: COLORS.primaryAccent,
      borderRadius: RADIUS,
      padding: SPACING.md,
      margin: SPACING.xs,
      minWidth: 120,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: COLORS.primaryAccent,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 3,
    },
    suggestionButtonHC: {
      backgroundColor: COLORS.highContrastBackground,
      borderColor: COLORS.highContrastText,
    },
    suggestionText: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: COLORS.primaryAccent,
      textAlign: 'center',
    },
    suggestionTextHC: {
      color: COLORS.highContrastText,
    },
    confidenceIndicator: {
      position: 'absolute',
      top: -5,
      right: -5,
      fontSize: 16,
    },
  });

  const gradientColors = highContrast
    ? ([COLORS.highContrastBackground, COLORS.highContrastBackground] as const)
    : ([COLORS.backgroundStart, COLORS.backgroundEnd] as const);
  return (
    <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>
          {attemptedGesture ? `War das "${attemptedGesture}"?` : 'Korrektur senden'}
        </Text>

        {suggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            <Text style={[styles.subtitle, highContrast && styles.subtitleHC]}>
              Vielleicht meinst du:
            </Text>
            <FlatList
              data={suggestions}
              keyExtractor={(item) => item.id}
              numColumns={2}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.suggestionButton, highContrast && styles.suggestionButtonHC]}
                  onPress={() => handleSuggestionSelect(item.id)}
                  accessibilityLabel={`Korrigiere zu ${item.label}`}
                  accessibilityRole="button"
                >
                  <Text style={[styles.suggestionText, highContrast && styles.suggestionTextHC]}>
                    {item.label}
                  </Text>
                  {item.confidence > 0.7 && (
                    <Text style={styles.confidenceIndicator}>⭐</Text>
                  )}
                </Pressable>
              )}
              contentContainerStyle={styles.suggestionsList}
            />
          </View>
        )}

        <View style={styles.pulseWrapper}>
          <PulsingCircle size={120} color={highContrast ? COLORS.highContrastText : '#ffffff'} />
          <Pressable
            style={[styles.choiceButton, highContrast && styles.choiceButtonHC]}
            testID="btn-submit-correction"
            accessibilityRole="button"
            accessibilityLabel="Korrektur senden"
            onPress={handleSubmit}
          >
            <Text style={styles.choiceButtonText}>Korrektur senden</Text>
          </Pressable>
        </View>
        <View style={{ marginBottom: SPACING.sm }}>
          <Pressable
            style={[styles.choiceButton, highContrast && styles.choiceButtonHC]}
            testID="btn-cancel-correction"
            accessibilityRole="button"
            accessibilityLabel="Abbrechen"
            onPress={handleCancel}
          >
            <Text style={styles.choiceButtonText}>Abbrechen</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
