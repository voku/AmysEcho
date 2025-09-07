import React, { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet, Text } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { loadProfile, Profile } from '../storage';
import { useAccessibility } from '../components/AccessibilityContext';
import { childHaptic } from '../services/feedbackService';

export default function ProfileSelectScreen({ navigation }: any) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const { largeText, highContrast } = useAccessibility();

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

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
      textAlign: 'center',
    },
    titleLarge: {
      fontSize: 28,
    },
    titleHC: {
      color: COLORS.highContrastText,
    },
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: SPACING.md,
      marginBottom: SPACING.lg,
    },
    button: {
      backgroundColor: COLORS.primaryAccent,
      padding: SPACING.md,
      borderRadius: RADIUS,
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
    buttonDisabled: {
      backgroundColor: COLORS.secondaryAccent,
      opacity: 0.6,
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

  const ButtonComponent = ({
    title,
    onPress,
    accessibilityLabel,
    disabled = false
  }: {
    title: string;
    onPress: () => void;
    accessibilityLabel: string;
    disabled?: boolean;
  }) => (
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
      <Text style={[
        styles.buttonText,
        largeText && styles.buttonTextLarge,
        highContrast && styles.buttonTextHC,
      ]}>
        {title}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.container, highContrast && styles.containerHC]}>
      <Text style={[styles.title, largeText && styles.titleLarge, highContrast && styles.titleHC]}>
        Was möchtest du tun?
      </Text>
      <View style={styles.row}>
        <ButtonComponent
          title="Zuhören"
          onPress={() => profile && navigation.navigate('Recognition', { profileId: profile.id })}
          accessibilityLabel="Zum Erkennungsmodus"
          disabled={!profile}
        />
        <ButtonComponent
          title="Lernen"
          onPress={() => navigation.navigate('Training', { gestureLabel: undefined })}
          accessibilityLabel="Zum Lernmodus"
        />
      </View>
      <View style={styles.row}>
        <ButtonComponent
          title="Eltern"
          onPress={() => navigation.navigate('ParentalGate', { target: 'Parent' })}
          accessibilityLabel="Elternprofil"
        />
        <ButtonComponent
          title="Admin"
          onPress={() => navigation.navigate('ParentalGate', { target: 'Admin' })}
          accessibilityLabel="Adminbereich"
        />
        <ButtonComponent
          title="Profile verwalten"
          onPress={() => navigation.navigate('ProfileManager')}
          accessibilityLabel="Profile verwalten"
        />
      </View>
    </View>
  );
}
