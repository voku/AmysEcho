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
import type { RootStackParamList } from '../navigation/types';
import { popToExistingRoute } from '../navigation/navigationHelpers';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: SPACING.lg,
    color: COLORS.text,
    textAlign: 'center',
  },
  titleLarge: {
    fontSize: 28,
  },
  titleHC: {
    color: COLORS.highContrastText,
  },
  infoContainer: {
    width: '90%',
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: DEFAULT_RADIUS,
    padding: SPACING.md,
  },
  infoContainerHC: {
    backgroundColor: COLORS.highContrastBackground,
  },
  infoText: {
    fontSize: 16,
    color: COLORS.text,
    textAlign: 'center',
  },
  infoTextLarge: {
    fontSize: 18,
  },
  infoTextHC: {
    color: COLORS.highContrastText,
  },
  buttonContainer: {
    width: '90%',
    marginBottom: SPACING.sm,
  },
  button: {
    backgroundColor: COLORS.primaryAccent,
    padding: SPACING.md,
    borderRadius: DEFAULT_RADIUS,
    alignItems: 'center',
    minHeight: 48,
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

type ParentScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Parent'>;

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

  const ButtonComponent = ({
    title,
    onPress,
    accessibilityLabel
  }: {
    title: string;
    onPress: () => void;
    accessibilityLabel: string;
  }) => (
    <View style={styles.buttonContainer}>
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
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <Text style={[
          styles.buttonText,
          largeText && styles.buttonTextLarge,
          highContrast && styles.buttonTextHC,
        ]}>
          {title}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <ScreenBackground scrollable style={styles.container}>
      <Text style={[styles.title, largeText && styles.titleLarge, highContrast && styles.titleHC]}>
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
          {`Alle wichtigen Einstellungen werden automatisch für ${optimizedFor} optimiert. Nutze die Bereiche unten, um Unterstützung, Berichte und Verwaltung schnell zu erreichen.`}
        </Text>
      </View>
      <ButtonComponent
        title="Profilverwaltung"
        onPress={() => navigation.navigate('ProfileManager')}
        accessibilityLabel="Profilverwaltung"
      />
      <ButtonComponent
        title="Zugangsprüfung"
        onPress={() => navigation.navigate('ParentalGate', { target: 'Parent' })}
        accessibilityLabel="Zugangsprüfung"
      />
      <ButtonComponent
        title="Verwaltung"
        onPress={() => navigation.navigate('Admin')}
        accessibilityLabel="Verwaltung"
      />
      <ButtonComponent
        title="Analysen"
        onPress={() => navigation.navigate('Dashboard')}
        accessibilityLabel="Analysen ansehen"
      />
      <ButtonComponent
        title="Lernfortschritt"
        onPress={() => navigation.navigate('CaregiverReport')}
        accessibilityLabel="Lernfortschritt ansehen"
      />
      <ButtonComponent
        title="Fortschritt"
        onPress={() => navigation.navigate('Progress')}
        accessibilityLabel="Fortschritt ansehen"
      />
      <ButtonComponent
        title="Hilfe"
        onPress={() => navigation.navigate('Help')}
        accessibilityLabel="Hilfe erhalten"
      />
      <ButtonComponent
        title="Geringe Sicherheit simulieren"
        onPress={() => {
          popToExistingRoute(navigation, 'App');
          navigation.navigate('App', {
            screen: 'Recognition',
            params: { simulateLowConfidence: true },
          });
        }}
        accessibilityLabel="Geringe Sicherheit simulieren"
      />
      <ButtonComponent
        title="Menü"
        onPress={() => {
          const popped = popToExistingRoute(navigation, 'Parent');
          if (!popped) {
            navigation.navigate('Parent');
          }
        }}
        accessibilityLabel="Menü öffnen"
      />
      <ButtonComponent
        title="Erkennen"
        onPress={() => {
          popToExistingRoute(navigation, 'App');
          navigation.navigate('App', { screen: 'Recognition' });
        }}
        accessibilityLabel="Zum Erkennungsmodus"
      />
      <ButtonComponent
        title="Zurück"
        onPress={() => navigation.goBack()}
        accessibilityLabel="Zurück"
      />
    </ScreenBackground>
  );
}
