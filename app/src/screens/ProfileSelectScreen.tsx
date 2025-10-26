import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, ScrollView } from 'react-native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { COLORS, SPACING } from '../constants/ui';
import { loadProfile, Profile } from '../storage';
import { useAccessibility } from '../components/AccessibilityContext';
import ScreenBackground from '../components/ScreenBackground';
import type { RootStackParamList } from '../navigation/types';
import { APP_TAB_ROUTES, ROOT_STACK_ROUTES } from '../navigation/types';
import SettingsOptionCard from '../components/settings/SettingsOptionCard';

type ProfileSelectNavigationProp = StackNavigationProp<
  RootStackParamList,
  typeof ROOT_STACK_ROUTES.ProfileSelect
>;

export default function ProfileSelectScreen({ navigation }: { navigation: ProfileSelectNavigationProp }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const { largeText, highContrast } = useAccessibility();

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollContainer: {
      flexGrow: 1,
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.xl,
      gap: SPACING.xl,
    },
    header: {
      alignItems: 'center',
      gap: SPACING.sm,
    },
    title: {
      fontSize: largeText ? 32 : 28,
      fontWeight: '700',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: largeText ? 18 : 16,
      color: highContrast ? COLORS.highContrastText : COLORS.textSecondary,
      textAlign: 'center',
    },
    cardStack: {
      gap: SPACING.md,
    },
    notice: {
      textAlign: 'center',
      color: highContrast ? COLORS.highContrastText : COLORS.textSecondary,
      fontSize: largeText ? 16 : 14,
    },
  });

  return (
    <ScreenBackground style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Wohin möchtest du als Nächstes?</Text>
          <Text style={styles.subtitle}>Wähle den Bereich aus, der jetzt am meisten unterstützt.</Text>
        </View>

        <View style={styles.cardStack}>
          <SettingsOptionCard
            title="Zuhören"
            subtitle={
              profile
                ? 'Starte den Erkennungsmodus und lass Amy sofort verstanden werden.'
                : 'Lege zuerst ein Profil an, damit wir wissen, wen wir begleiten.'
            }
            onPress={() => {
              if (!profile) {
                return;
              }
              navigation.navigate(
                ROOT_STACK_ROUTES.App,
                {
                  screen: APP_TAB_ROUTES.Recognition,
                  params: { profileId: profile.id },
                },
                { pop: true },
              );
            }}
            accessibilityLabel="Zum Erkennungsmodus"
            accessibilityHint="Öffnet Amys Gestenerkennung"
            disabled={!profile}
            playHaptic
          />
          <SettingsOptionCard
            title="Lernen"
            subtitle="Übe Gesten gemeinsam und sammle neue Trainingsbeispiele."
            onPress={() => {
              navigation.navigate(
                ROOT_STACK_ROUTES.App,
                {
                  screen: APP_TAB_ROUTES.Lernen,
                },
                { pop: true },
              );
            }}
            accessibilityLabel="Zum Lernmodus"
            accessibilityHint="Öffnet den Trainingsbereich"
            playHaptic
          />
        </View>

        <View style={styles.cardStack}>
          <SettingsOptionCard
            title="Elternbereich"
            subtitle="Einstellungen, Betreuungstools und Unterstützung für Pflegepersonen."
            onPress={() => {
              navigation.navigate(
                ROOT_STACK_ROUTES.ParentalGate,
                { target: ROOT_STACK_ROUTES.Parent },
                { pop: true },
              );
            }}
            accessibilityLabel="Elternbereich öffnen"
            accessibilityHint="Öffnet die Einstellungen für Betreuungspersonen"
            playHaptic
          />
          <SettingsOptionCard
            title="Adminbereich"
            subtitle="Modelle verwalten, Updates prüfen und technische Details anpassen."
            onPress={() => {
              navigation.navigate(
                ROOT_STACK_ROUTES.ParentalGate,
                { target: ROOT_STACK_ROUTES.Admin },
                { pop: true },
              );
            }}
            accessibilityLabel="Adminbereich öffnen"
            accessibilityHint="Öffnet die administrativen Werkzeuge"
            playHaptic
          />
          <SettingsOptionCard
            title="Profile verwalten"
            subtitle="Profile für Kinder anlegen, bearbeiten oder wechseln."
            onPress={() => {
              navigation.navigate(ROOT_STACK_ROUTES.ProfileManager, undefined, { pop: true });
            }}
            accessibilityLabel="Profile verwalten"
            accessibilityHint="Öffnet die Profilverwaltung"
            playHaptic
          />
        </View>

        {!profile ? (
          <Text style={styles.notice}>
            Kein Profil gefunden. Lege zuerst ein Profil an, damit Amy begleitet wird.
          </Text>
        ) : null}
      </ScrollView>
    </ScreenBackground>
  );
}
