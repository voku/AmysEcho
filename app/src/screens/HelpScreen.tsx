import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { loadProfile, Profile } from '../storage';
import BottomNav from '../components/BottomNav';
import { useAccessibility } from '../components/AccessibilityContext';
import { childHaptic } from '../services/feedbackService';

export default function HelpScreen({ navigation }: any) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const { largeText, highContrast } = useAccessibility();

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

  return (
    <View style={[styles.container, highContrast && styles.containerHC]}>
      <Text style={[styles.title, largeText && styles.titleLarge, highContrast && styles.titleHC]}>
        Wie du Amy helfen kannst
      </Text>
      <Text style={[styles.text, largeText && styles.textLarge, highContrast && styles.textHC]}>
        Wenn Amy Schwierigkeiten hat, verstanden zu werden, kannst du Folgendes tun:
      </Text>
      <Text style={[styles.text, largeText && styles.textLarge, highContrast && styles.textHC]}>
        • Ermutige sie, die Geste erneut und vielleicht deutlicher zu zeigen.
      </Text>
      <Text style={[styles.text, largeText && styles.textLarge, highContrast && styles.textHC]}>
        • Wenn die App ein Korrekturfenster zeigt, wähle das richtige Symbol aus.
      </Text>
      <Text style={[styles.text, largeText && styles.textLarge, highContrast && styles.textHC]}>
        • Wenn die App wiederholt falsch erkennt, sieh dir den Bereich "Training" an, um neue Gesten hinzuzufügen oder bestehende zu verfeinern.
      </Text>
      <Text style={[styles.text, largeText && styles.textLarge, highContrast && styles.textHC]}>
        • Achte darauf, dass Amy in einem gut beleuchteten Bereich ist und ihre Hände für die Kamera klar sichtbar sind.
      </Text>
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
          navigation.goBack();
        }}
        accessibilityRole="button"
        accessibilityLabel="Zurück zur vorherigen Seite"
      >
        <Text style={[styles.buttonText, largeText && styles.buttonTextLarge, highContrast && styles.buttonTextHC]}>
          Zurück
        </Text>
      </Pressable>
      {profile && <BottomNav active="parent" profileId={profile.id} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
  },
  containerHC: {
    backgroundColor: COLORS.highContrastBackground,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: SPACING.lg,
    color: COLORS.text,
  },
  titleLarge: {
    fontSize: 28,
  },
  titleHC: {
    color: COLORS.highContrastText,
  },
  text: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: SPACING.sm,
    color: COLORS.textMuted,
  },
  textLarge: {
    fontSize: 20,
  },
  textHC: {
    color: COLORS.highContrastText,
  },
  button: {
    backgroundColor: COLORS.primaryAccent,
    padding: SPACING.md,
    borderRadius: RADIUS,
    marginTop: SPACING.lg,
    minWidth: 120,
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