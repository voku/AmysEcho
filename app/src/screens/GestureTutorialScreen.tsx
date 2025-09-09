import React from 'react';
import { Text, StyleSheet, Pressable, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { childHaptic } from '../services/feedbackService';

export default function GestureTutorialScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.lg,
      backgroundColor: 'transparent',
    },
    title: {
      fontSize: largeText ? 32 : 24,
      textAlign: 'center',
      marginBottom: SPACING.lg,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    text: {
      fontSize: largeText ? 22 : 16,
      textAlign: 'center',
      marginBottom: SPACING.md,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    button: {
      backgroundColor: COLORS.primaryAccent,
      padding: SPACING.md,
      borderRadius: RADIUS,
      minWidth: 120,
      alignItems: 'center',
      marginTop: SPACING.lg,
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
        <Text style={styles.title}>Wie man Gesten verwendet</Text>
        <Text style={styles.text}>1. Stelle sicher, dass deine Hand für die Kamera sichtbar ist.</Text>
        <Text style={styles.text}>2. Halte deine Hand ruhig, während du die Gebärde machst.</Text>
        <Text style={styles.text}>3. Warte auf den Ton, der die Erkennung bestätigt.</Text>
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
            navigation.replace('ProfileSelect');
          }}
          accessibilityRole="button"
          accessibilityLabel="Tutorial beenden"
        >
          <Text style={[
            styles.buttonText,
            largeText && styles.buttonTextLarge,
            highContrast && styles.buttonTextHC,
          ]}>
            Starten
          </Text>
        </Pressable>
      </SafeAreaView>
    </LinearGradient>
  );
}

