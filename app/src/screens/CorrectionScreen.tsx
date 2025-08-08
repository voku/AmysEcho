import React from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { logCorrection } from '../storage';
import { correctionService } from '../services/correctionService';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';

export default function CorrectionScreen({ navigation, route }: any) {
  const { largeText, highContrast } = useAccessibility();

  const handleSubmit = async () => {
    await correctionService.logCorrection('correction');
    await logCorrection('correction');
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
      marginBottom: SPACING.sm,
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
  });

  const gradientColors = highContrast
    ? ([COLORS.highContrastBackground, COLORS.highContrastBackground] as const)
    : ([COLORS.backgroundStart, COLORS.backgroundEnd] as const);
  return (
    <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Submit Correction</Text>
        <Pressable
          style={[styles.choiceButton, highContrast && styles.choiceButtonHC]}
          testID="btn-submit-correction"
          accessibilityRole="button"
          accessibilityLabel="Submit correction"
          onPress={handleSubmit}
        >
          <Text style={styles.choiceButtonText}>Submit Correction</Text>
        </Pressable>
        <Pressable
          style={[styles.choiceButton, highContrast && styles.choiceButtonHC]}
          testID="btn-cancel-correction"
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={handleCancel}
        >
          <Text style={styles.choiceButtonText}>Cancel</Text>
        </Pressable>
      </SafeAreaView>
    </LinearGradient>
  );
}
