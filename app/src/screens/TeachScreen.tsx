import React from 'react';
import { StyleSheet, SafeAreaView, Pressable, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { childHaptic } from '../services/feedbackService';

export default function TeachScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    button: {
      backgroundColor: COLORS.primaryAccent,
      padding: SPACING.md,
      borderRadius: RADIUS,
      minWidth: 200,
      alignItems: 'center',
    },
    buttonHC: {
      backgroundColor: COLORS.highContrastText,
    },
    buttonPressed: {
      backgroundColor: COLORS.pressed,
    },
    buttonPressedHC: {
      backgroundColor: COLORS.highContrastPressed,
    },
    buttonText: {
      color: COLORS.highContrastText,
      fontSize: 16,
      fontWeight: 'bold',
    },
    buttonTextLarge: {
      fontSize: 20,
    },
    buttonTextHC: {
      color: COLORS.highContrastBackground,
    },
  });
  const gradientColors = highContrast
    ? ([COLORS.highContrastBackground, COLORS.highContrastBackground] as const)
    : ([COLORS.backgroundStart, COLORS.backgroundEnd] as const);
  return (
    <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <Pressable
          style={({ pressed }) => [
          {
            minWidth: 60,
            minHeight: 60,
            padding: SPACING.md,
            alignItems: 'center',
            justifyContent: 'center',
          },
            styles.button,
            highContrast && styles.buttonHC,
            pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
          ]}
          onPress={() => {
            void childHaptic();
            navigation.navigate('Teaching');
          }}
          testID="btn-add-sign"
          accessibilityRole="button"
          accessibilityLabel="Neue Gebärde hinzufügen"
        >
          <Text style={[
            styles.buttonText,
            largeText && styles.buttonTextLarge,
            highContrast && styles.buttonTextHC,
          ]}>
            Neue Gebärde hinzufügen
          </Text>
        </Pressable>
      </SafeAreaView>
    </LinearGradient>
  );
}
