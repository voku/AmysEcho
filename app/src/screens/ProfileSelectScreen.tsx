import React, { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet, Text, ScrollView } from 'react-native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import { loadProfile, Profile } from '../storage';
import { useAccessibility } from '../components/AccessibilityContext';
import { childHaptic } from '../services/feedbackService';
import ScreenBackground from '../components/ScreenBackground';
import type { RootStackParamList } from '../navigation/types';
import { APP_TAB_ROUTES, ROOT_STACK_ROUTES, type AppTabsParamList } from '../navigation/types';
import type { NavigatorScreenParams } from '@react-navigation/native';

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

  const goToAppTab = (
    screen: (typeof APP_TAB_ROUTES)[keyof typeof APP_TAB_ROUTES],
    params?: AppTabsParamList[keyof AppTabsParamList],
    dropCurrent: boolean = false,
  ) => {
    const nestedParams = (params === undefined ? { screen } : { screen, params }) as NavigatorScreenParams<AppTabsParamList>;

    if (typeof navigation.reset === 'function' && typeof navigation.getState === 'function') {
      const state = navigation.getState();
      const appIndex = state.routes.findIndex((route) => route.name === ROOT_STACK_ROUTES.App);
      const routes: Array<{
        name: keyof RootStackParamList;
        params?: RootStackParamList[keyof RootStackParamList];
      }> = [];

      const appendRoute = (route: (typeof state.routes)[number], index: number) => {
        if (route.name === ROOT_STACK_ROUTES.App) {
          return;
        }
        if (dropCurrent && index === state.index) {
          return;
        }
        routes.push({
          name: route.name as keyof RootStackParamList,
          params: route.params as RootStackParamList[keyof RootStackParamList] | undefined,
        });
      };

      if (appIndex >= 0) {
        state.routes.slice(0, appIndex).forEach(appendRoute);
      } else {
        state.routes.forEach(appendRoute);
      }

      routes.push({
        name: ROOT_STACK_ROUTES.App,
        params: nestedParams,
      });

      navigation.reset({ index: routes.length - 1, routes });
      return;
    }

    if (dropCurrent && typeof navigation.replace === 'function') {
      navigation.replace(ROOT_STACK_ROUTES.App, nestedParams);
    } else {
      navigation.navigate(ROOT_STACK_ROUTES.App, nestedParams);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: SPACING.xl,
    },
    scrollContainer: {
      flexGrow: 1,
      justifyContent: 'center',
      gap: SPACING.xl,
      paddingVertical: SPACING.xl,
    },
    titleWrapper: {
      alignItems: 'center',
      gap: SPACING.sm,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: COLORS.text,
      textAlign: 'center',
    },
    titleLarge: {
      fontSize: 28,
    },
    titleHC: {
      color: COLORS.highContrastText,
    },
    subtitle: {
      fontSize: 16,
      color: COLORS.textSecondary,
      textAlign: 'center',
    },
    subtitleLarge: {
      fontSize: 18,
    },
    subtitleHC: {
      color: COLORS.highContrastText,
    },
    buttonColumn: {
      gap: SPACING.md,
    },
    primaryButton: {
      backgroundColor: COLORS.primaryAccent,
      paddingVertical: SPACING.lg,
      paddingHorizontal: SPACING.lg,
      borderRadius: DEFAULT_RADIUS,
      alignItems: 'flex-start',
      gap: SPACING.xs,
    },
    primaryButtonHC: {
      backgroundColor: COLORS.highContrastText,
    },
    secondaryButton: {
      backgroundColor: COLORS.secondaryAccent,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      borderRadius: DEFAULT_RADIUS,
      alignItems: 'flex-start',
      gap: SPACING.xs,
    },
    secondaryButtonHC: {
      backgroundColor: COLORS.highContrastText,
    },
    buttonPressed: {
      backgroundColor: COLORS.pressed,
    },
    buttonPressedHC: {
      backgroundColor: COLORS.highContrastPressed,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonTitle: {
      color: COLORS.highContrastText,
      fontSize: 18,
      fontWeight: 'bold',
    },
    buttonTitleLarge: {
      fontSize: 22,
    },
    buttonTitleHC: {
      color: COLORS.highContrastBackground,
    },
    buttonDescription: {
      color: COLORS.highContrastText,
      fontSize: 14,
    },
    buttonDescriptionLarge: {
      fontSize: 16,
    },
    buttonDescriptionHC: {
      color: COLORS.highContrastBackground,
    },
    infoText: {
      textAlign: 'center',
      color: COLORS.textSecondary,
    },
    infoTextLarge: {
      fontSize: 16,
    },
    infoTextHC: {
      color: COLORS.highContrastText,
    },
  });

  const ButtonComponent = ({
    title,
    description,
    onPress,
    accessibilityLabel,
    disabled = false,
    variant = 'primary',
  }: {
    title: string;
    description?: string;
    onPress: () => void;
    accessibilityLabel: string;
    disabled?: boolean;
    variant?: 'primary' | 'secondary';
  }) => {
    const isPrimary = variant === 'primary';

    return (
      <Pressable
        style={({ pressed }) => [
          isPrimary ? styles.primaryButton : styles.secondaryButton,
          highContrast && (isPrimary ? styles.primaryButtonHC : styles.secondaryButtonHC),
          disabled && styles.buttonDisabled,
          pressed && !disabled && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
        ]}
        onPress={() => {
          if (!disabled) {
            void childHaptic();
            onPress();
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
      >
        <Text
          style={[
            styles.buttonTitle,
            largeText && styles.buttonTitleLarge,
            highContrast && styles.buttonTitleHC,
          ]}
        >
          {title}
        </Text>
        {description ? (
          <Text
            style={[
              styles.buttonDescription,
              largeText && styles.buttonDescriptionLarge,
              highContrast && styles.buttonDescriptionHC,
            ]}
          >
            {description}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  return (
    <ScreenBackground style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.titleWrapper}>
          <Text style={[styles.title, largeText && styles.titleLarge, highContrast && styles.titleHC]}>
            Wohin möchtest du als Nächstes?
          </Text>
          <Text style={[styles.subtitle, largeText && styles.subtitleLarge, highContrast && styles.subtitleHC]}>
            Wähle den Bereich aus, der jetzt am besten hilft.
          </Text>
        </View>
        <View style={styles.buttonColumn}>
          <ButtonComponent
            title="Zuhören"
            description={
              profile
                ? 'Starte den Erkennungsmodus und lass Amy sofort verstanden werden.'
                : 'Lege zuerst ein Profil an, damit wir wissen, wen wir begleiten.'
            }
            onPress={() => {
              if (profile) {
                goToAppTab(APP_TAB_ROUTES.Recognition, { profileId: profile.id }, true);
              }
            }}
            accessibilityLabel="Zum Erkennungsmodus"
            disabled={!profile}
          />
          <ButtonComponent
            title="Lernen"
            description="Übe Gesten gemeinsam und sammle neue Trainingsbeispiele."
            onPress={() => {
              goToAppTab(APP_TAB_ROUTES.Lernen, undefined, true);
            }}
            accessibilityLabel="Zum Lernmodus"
          />
        </View>
        <View style={styles.buttonColumn}>
          <ButtonComponent
            title="Elternbereich"
            description="Öffne den Elternbereich für Einstellungen und Unterstützung."
            onPress={() =>
              navigation.navigate(ROOT_STACK_ROUTES.ParentalGate, { target: ROOT_STACK_ROUTES.Parent })
            }
            accessibilityLabel="Elternbereich öffnen"
            variant="secondary"
          />
          <ButtonComponent
            title="Admin"
            description="Verwalte Modelle und technische Details."
            onPress={() =>
              navigation.navigate(ROOT_STACK_ROUTES.ParentalGate, { target: ROOT_STACK_ROUTES.Admin })
            }
            accessibilityLabel="Adminbereich öffnen"
            variant="secondary"
          />
          <ButtonComponent
            title="Profile verwalten"
            description="Bearbeite oder lege Profile für Kinder an."
            onPress={() => navigation.navigate(ROOT_STACK_ROUTES.ProfileManager)}
            accessibilityLabel="Profile verwalten"
            variant="secondary"
          />
        </View>
        {!profile ? (
          <Text
            style={[
              styles.infoText,
              largeText && styles.infoTextLarge,
              highContrast && styles.infoTextHC,
            ]}
          >
            Kein Profil gefunden. Lege zuerst ein Profil an, damit Amy begleitet wird.
          </Text>
        ) : null}
      </ScrollView>
    </ScreenBackground>
  );
}
