import React from 'react';
import { View, Text, StyleSheet, Button, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING } from '../constants/ui';

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
      marginTop: SPACING.lg,
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
        <View style={styles.button}>
          <Button
            title="Starten"
            onPress={() => navigation.replace('ProfileSelect')}
            accessibilityLabel="Tutorial beenden"
            color={COLORS.primaryAccent}
          />
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

