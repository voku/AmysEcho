import React from 'react';
import { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable } from 'react-native';
import { gestureModel } from '../model';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';
import BottomNav from '../components/BottomNav';
import { loadProfile, Profile } from '../storage';
import { childHaptic } from '../services/feedbackService';

export default function CaregiverReportScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: SPACING.lg,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
    },
    title: {
      fontSize: largeText ? 24 : 20,
      marginBottom: SPACING.md,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    item: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.sm,
      paddingVertical: SPACING.sm,
    },
    label: {
      fontSize: largeText ? 20 : 16,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      flex: 1,
    },
    button: {
      backgroundColor: COLORS.primaryAccent,
      padding: SPACING.sm,
      borderRadius: RADIUS,
      minWidth: 80,
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
      fontSize: 14,
      fontWeight: 'bold',
    },
    buttonTextLarge: {
      fontSize: 16,
    },
    buttonTextHC: {
      color: COLORS.highContrastBackground,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Lernfortschritt</Text>
      <FlatList
        data={gestureModel.gestures}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.label}>{item.label}</Text>
            <Pressable
        style={({ pressed }) => [
          {
            minWidth: 60,
            minHeight: 60,
            padding: SPACING.sm,
            alignItems: 'center',
            justifyContent: 'center',
          },
          styles.button,
          highContrast && styles.buttonHC,
          pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
        ]}
              onPress={() => {
                void childHaptic();
                navigation.navigate('ProgressChart', { gestureId: item.id });
              }}
              accessibilityRole="button"
              accessibilityLabel={`Details für ${item.label} anzeigen`}
            >
              <Text style={[
                styles.buttonText,
                largeText && styles.buttonTextLarge,
                highContrast && styles.buttonTextHC,
              ]}>
                Details
              </Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.label}>Keine Gesten verfügbar</Text>}
      />
      <Pressable
        style={({ pressed }) => [
          {
            minWidth: 60,
            minHeight: 60,
            padding: SPACING.sm,
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
        accessibilityLabel="Zurück"
      >
        <Text style={[
          styles.buttonText,
          largeText && styles.buttonTextLarge,
          highContrast && styles.buttonTextHC,
        ]}>
          Zurück
        </Text>
      </Pressable>
      {profile && <BottomNav active="parent" profileId={profile.id} />}
    </View>
  );
}
