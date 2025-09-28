import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useMood } from '../context/MoodContext';
import { useAccessibility } from './AccessibilityContext';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';

export default function MoodSelector() {
  const { currentMood, setMood, getMoodEmoji, getMoodDescription } = useMood();
  const { largeText, highContrast } = useAccessibility();

  const moods = [
    { key: 'calm' as const, label: 'Ruhig', emoji: '😌' },
    { key: 'neutral' as const, label: 'Normal', emoji: '😐' },
    { key: 'energetic' as const, label: 'Energisch', emoji: '⚡' },
  ];

  const styles = StyleSheet.create({
    container: {
      padding: SPACING.md,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
      borderRadius: DEFAULT_RADIUS,
      margin: SPACING.md,
      borderWidth: highContrast ? 2 : 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
    },
    title: {
      fontSize: largeText ? 18 : 16,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: SPACING.md,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    moodContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
    },
    moodButton: {
      alignItems: 'center',
      padding: SPACING.md,
      borderRadius: DEFAULT_RADIUS,
      minWidth: 80,
    },
    moodButtonActive: {
      backgroundColor: highContrast ? COLORS.highContrastText : COLORS.primaryAccent,
    },
    moodButtonInactive: {
      backgroundColor: 'transparent',
    },
    moodEmoji: {
      fontSize: largeText ? 32 : 28,
      marginBottom: SPACING.xs,
    },
    moodLabel: {
      fontSize: largeText ? 16 : 14,
      fontWeight: 'bold',
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    moodLabelActive: {
      color: highContrast ? COLORS.highContrastBackground : COLORS.highContrastText,
    },
    currentMoodText: {
      fontSize: largeText ? 16 : 14,
      textAlign: 'center',
      marginTop: SPACING.md,
      color: highContrast ? COLORS.highContrastText : COLORS.textMuted,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Wie fühlst du dich?</Text>

      <View style={styles.moodContainer}>
        {moods.map((mood) => {
          const isActive = currentMood === mood.key;
          return (
            <Pressable
              key={mood.key}
              style={[
                styles.moodButton,
                isActive ? styles.moodButtonActive : styles.moodButtonInactive,
              ]}
              onPress={() => setMood(mood.key)}
              accessibilityLabel={`${mood.label} Modus ${isActive ? 'aktiv' : 'auswählen'}`}
              accessibilityRole="button"
              accessibilityHint={`Wechsle zur ${mood.label} Stimmung`}
            >
              <Text style={styles.moodEmoji}>{mood.emoji}</Text>
              <Text style={[
                styles.moodLabel,
                isActive && styles.moodLabelActive,
              ]}>
                {mood.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.currentMoodText}>
        {getMoodEmoji()} {getMoodDescription()}
      </Text>
    </View>
  );
}