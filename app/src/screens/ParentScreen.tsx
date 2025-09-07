import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Switch } from 'react-native';
import { useAccessibility } from '../components/AccessibilityContext';
import { useServices } from '../context/ServicesContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import { childFriendlyStyles } from '../styles/touchTargets';
import { childHaptic } from '../services/feedbackService';

export default function ParentScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  useServices();
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [useDgs, setUseDgs] = useState(false);

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
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
      width: '90%',
      paddingHorizontal: SPACING.md,
    },
    toggleLabel: {
      fontSize: largeText ? 18 : 16,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      flex: 1,
    },
    buttonContainer: {
      width: '90%',
      marginBottom: SPACING.sm,
    },
    button: {
      backgroundColor: COLORS.primaryAccent,
      padding: SPACING.md,
      borderRadius: RADIUS,
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
          childFriendlyStyles.minTouchTarget,
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
    <View style={[styles.container, highContrast && styles.containerHC]}>
      <Text style={[styles.title, largeText && styles.titleLarge, highContrast && styles.titleHC]}>
        Elternbereich
      </Text>
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Kamera aktiv</Text>
        <Switch
          value={isCameraActive}
          onValueChange={(value) => setIsCameraActive(value)}
          accessibilityLabel="Kamera umschalten"
        />
      </View>
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>DGS-Video anzeigen</Text>
        <Switch
          value={useDgs}
          onValueChange={setUseDgs}
          accessibilityLabel="DGS-Video zeigen"
        />
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
        title="Übungsplaner"
        onPress={() => navigation.navigate('PracticeScheduler')}
        accessibilityLabel="Übungsplaner"
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
        onPress={() => navigation.navigate('Recognition', { simulateLowConfidence: true })}
        accessibilityLabel="Geringe Sicherheit simulieren"
      />
      <ButtonComponent
        title="Menü"
        onPress={() => navigation.navigate('Parent')}
        accessibilityLabel="Menü öffnen"
      />
      <ButtonComponent
        title="Erkennen"
        onPress={() => navigation.navigate('Recognition')}
        accessibilityLabel="Zum Erkennungsmodus"
      />
      <ButtonComponent
        title="Zurück"
        onPress={() => navigation.goBack()}
        accessibilityLabel="Zurück"
      />
    </View>
  );
}
