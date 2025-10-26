import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAccessibility } from '../components/AccessibilityContext';
import { useServices } from '../context/ServicesContext';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import { childHaptic } from '../services/feedbackService';
import ScreenBackground from '../components/ScreenBackground';
import { loadProfile, type Profile } from '../storage';
import { logger } from '../utils/logger';
import { APP_TAB_ROUTES, ROOT_STACK_ROUTES } from '../navigation/types';
import type { RootStackParamList } from '../navigation/types';

type ParentScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  typeof ROOT_STACK_ROUTES.Parent
>;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    width: '100%',
  },
  header: {
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: SPACING.sm,
    color: COLORS.text,
  },
  titleLarge: {
    fontSize: 28,
  },
  titleHC: {
    color: COLORS.highContrastText,
  },
  infoContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: DEFAULT_RADIUS,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.outlineMuted,
  },
  infoContainerHC: {
    backgroundColor: COLORS.highContrastBackground,
    borderColor: COLORS.highContrastText,
  },
  infoText: {
    fontSize: 16,
    color: COLORS.text,
  },
  infoTextLarge: {
    fontSize: 18,
  },
  infoTextHC: {
    color: COLORS.highContrastText,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: SPACING.md,
    color: COLORS.text,
  },
  sectionTitleLarge: {
    fontSize: 20,
  },
  sectionTitleHC: {
    color: COLORS.highContrastText,
  },
  optionWrapper: {
    marginBottom: SPACING.md,
  },
  optionCard: {
    borderRadius: DEFAULT_RADIUS,
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  optionCardPressed: {
    backgroundColor: COLORS.surfaceMuted,
  },
  optionCardHC: {
    backgroundColor: COLORS.highContrastBackground,
    borderColor: COLORS.highContrastText,
  },
  optionCardPressedHC: {
    backgroundColor: COLORS.highContrastPressed,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  optionTitleLarge: {
    fontSize: 20,
  },
  optionTitleHC: {
    color: COLORS.highContrastText,
  },
  optionSubtitle: {
    marginTop: SPACING.xs,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  optionSubtitleLarge: {
    fontSize: 16,
  },
  optionSubtitleHC: {
    color: COLORS.highContrastText,
  },
  footer: {
    marginTop: SPACING.lg,
  },
});

export default function ParentScreen({
  navigation,
}: {
  navigation: ParentScreenNavigationProp;
}) {
  const { largeText, highContrast } = useAccessibility();
  const [profile, setProfile] = useState<Profile | null>(null);
  useServices();

  useEffect(() => {
    let isMounted = true;
    loadProfile()
      .then((loadedProfile) => {
        if (isMounted) setProfile(loadedProfile);
      })
      .catch((error) => {
        logger.error('Failed to load profile', error);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const profileName = profile?.name?.trim();
  const optimizedFor = profileName && profileName.length > 0 ? profileName : 'dein Kind';

  const renderOption = (
    title: string,
    subtitle: string,
    onPress: () => void,
    accessibilityLabel: string,
  ) => (
    <View key={title} style={styles.optionWrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={subtitle}
        onPress={() => {
          void childHaptic();
          onPress();
        }}
        style={({ pressed }) => [
          styles.optionCard,
          highContrast && styles.optionCardHC,
          pressed && (highContrast ? styles.optionCardPressedHC : styles.optionCardPressed),
        ]}
      >
        <Text
          style={[
            styles.optionTitle,
            largeText && styles.optionTitleLarge,
            highContrast && styles.optionTitleHC,
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.optionSubtitle,
            largeText && styles.optionSubtitleLarge,
            highContrast && styles.optionSubtitleHC,
          ]}
        >
          {subtitle}
        </Text>
      </Pressable>
    </View>
  );

  const sections = [
    {
      title: 'Profile & Verwaltung',
      items: [
        {
          title: 'Profilverwaltung',
          subtitle: 'Profile anlegen, bearbeiten oder wechseln',
          onPress: () =>
            navigation.navigate(ROOT_STACK_ROUTES.ProfileManager, undefined, { pop: true }),
          accessibilityLabel: 'Profilverwaltung öffnen',
        },
        {
          title: 'Adminbereich',
          subtitle: 'Technische Werkzeuge und Datensicherung',
          onPress: () => navigation.navigate(ROOT_STACK_ROUTES.Admin, undefined, { pop: true }),
          accessibilityLabel: 'Adminbereich öffnen',
        },
      ],
    },
    {
      title: 'Berichte & Fortschritt',
      items: [
        {
          title: 'Analysen',
          subtitle: 'Trendberichte und Nutzungsdaten ansehen',
          onPress: () =>
            navigation.navigate(ROOT_STACK_ROUTES.Dashboard, undefined, { pop: true }),
          accessibilityLabel: 'Analysen ansehen',
        },
        {
          title: 'Lernfortschritt',
          subtitle: 'Zusammenfassung der Trainingsfortschritte',
          onPress: () =>
            navigation.navigate(ROOT_STACK_ROUTES.CaregiverReport, undefined, { pop: true }),
          accessibilityLabel: 'Lernfortschritt ansehen',
        },
        {
          title: 'Fortschritt',
          subtitle: 'Detailverlauf und Meilensteine verfolgen',
          onPress: () =>
            navigation.navigate(ROOT_STACK_ROUTES.Progress, undefined, { pop: true }),
          accessibilityLabel: 'Fortschritt ansehen',
        },
      ],
    },
    {
      title: 'Unterstützung & Training',
      items: [
        {
          title: 'Hilfe',
          subtitle: 'Antworten und Kontaktmöglichkeiten',
          onPress: () => navigation.navigate(ROOT_STACK_ROUTES.Help, undefined, { pop: true }),
          accessibilityLabel: 'Hilfe erhalten',
        },
        {
          title: 'Training starten',
          subtitle: 'Neue Beispiele aufnehmen oder üben',
          onPress: () =>
            navigation.navigate(
              ROOT_STACK_ROUTES.App,
              { screen: APP_TAB_ROUTES.Lernen },
              { pop: true },
            ),
          accessibilityLabel: 'Training öffnen',
        },
        {
          title: 'Erkennen',
          subtitle: 'Zur Live-Gestenerkennung wechseln',
          onPress: () =>
            navigation.navigate(
              ROOT_STACK_ROUTES.App,
              { screen: APP_TAB_ROUTES.Recognition },
              { pop: true },
            ),
          accessibilityLabel: 'Zur Erkennung wechseln',
        },
      ],
    },
    {
      title: 'Diagnose & Tests',
      items: [
        {
          title: 'Geringe Sicherheit simulieren',
          subtitle: 'Testet die Erkennung mit niedriger Konfidenz',
          onPress: () => {
            navigation.navigate(
              ROOT_STACK_ROUTES.App,
              {
                screen: APP_TAB_ROUTES.Recognition,
                params: { simulateLowConfidence: true },
              },
              { pop: true },
            );
          },
          accessibilityLabel: 'Geringe Sicherheit simulieren',
        },
      ],
    },
  ] as const;

  return (
    <ScreenBackground
      scrollable
      style={styles.container}
      contentContainerStyle={[styles.content]}
    >
      <View style={styles.header}>
        <Text
          style={[
            styles.title,
            largeText && styles.titleLarge,
            highContrast && styles.titleHC,
          ]}
        >
          Elternbereich
        </Text>
        <View style={[styles.infoContainer, highContrast && styles.infoContainerHC]}>
          <Text
            style={[
              styles.infoText,
              largeText && styles.infoTextLarge,
              highContrast && styles.infoTextHC,
            ]}
          >
            {`Alle wichtigen Einstellungen werden automatisch für ${optimizedFor} optimiert. Wähle einen Bereich aus, um schnell zu den wichtigsten Werkzeugen für Betreuung, Berichte und Unterstützung zu gelangen.`}
          </Text>
        </View>
      </View>
      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              largeText && styles.sectionTitleLarge,
              highContrast && styles.sectionTitleHC,
            ]}
          >
            {section.title}
          </Text>
          {section.items.map(({ title, subtitle, onPress, accessibilityLabel }) =>
            renderOption(title, subtitle, onPress, accessibilityLabel),
          )}
        </View>
      ))}
      <View style={styles.footer}>
        {renderOption(
          'Zurück',
          'Zur vorherigen Ansicht wechseln',
          () => navigation.goBack(),
          'Zurück',
        )}
      </View>
    </ScreenBackground>
  );
}
