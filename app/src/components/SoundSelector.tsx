import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { COLORS, SPACING } from '../constants/ui';
import { useAccessibility } from './AccessibilityContext';
import { audioService } from '../services';
import { childFriendlyStyles } from '../styles/touchTargets';
import * as Haptics from '../utils/haptics';

interface SoundSelectorProps {
  selectedSound: string;
  onSoundSelect: (sound: string) => void;
}

const AVAILABLE_SOUNDS = [
  { id: 'success', label: '🎉 Erfolg', description: 'Fröhlicher Erfolgston' },
  { id: 'celebration', label: '🎊 Feier', description: 'Langer Feierton' },
  { id: 'confirmation', label: '✅ Bestätigung', description: 'Sanfter Bestätigungston' },
  { id: 'gesture_recognized', label: '👋 Geste erkannt', description: 'Spezialton für Gesten' },
  { id: 'thinking', label: '💭 Denken', description: 'Nachdenklicher Ton' },
];

export default function SoundSelector({ selectedSound, onSoundSelect }: SoundSelectorProps) {
  const { largeText, highContrast } = useAccessibility();
  const [playingSound, setPlayingSound] = useState<string | null>(null);

  const handleSoundPress = useCallback(async (soundId: string) => {
    try {
      // Provide haptic feedback
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Play the sound for preview
      setPlayingSound(soundId);
      await audioService.playSound(soundId, { volume: 0.7 });

      // Select the sound after a short delay
      setTimeout(() => {
        onSoundSelect(soundId);
        setPlayingSound(null);
      }, 500);

    } catch {
      Alert.alert(
        'Ton nicht verfügbar',
        'Dieser Ton konnte nicht abgespielt werden. Versuche einen anderen Ton.',
        [{ text: 'OK' }]
      );
      setPlayingSound(null);
    }
  }, [onSoundSelect]);

  return (
    <View style={[styles.container, highContrast && styles.containerHC]}>
      <Text style={[styles.title, largeText && styles.titleLarge, highContrast && styles.titleHC]}>
        🎵 Wähle deinen Erfolgston
      </Text>

      <Text style={[styles.subtitle, largeText && styles.subtitleLarge, highContrast && styles.subtitleHC]}>
        Tippe auf einen Ton, um ihn auszuprobieren und auszuwählen
      </Text>

      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {AVAILABLE_SOUNDS.map((sound) => (
          <Pressable
            key={sound.id}
            onPress={() => handleSoundPress(sound.id)}
            style={({ pressed }) => [
              childFriendlyStyles.minTouchTarget,
              styles.soundOption,
              selectedSound === sound.id && styles.selectedSound,
              highContrast && styles.soundOptionHC,
              selectedSound === sound.id && highContrast && styles.selectedSoundHC,
              pressed && (highContrast ? styles.soundPressedHC : styles.soundPressed),
            ]}
            accessibilityLabel={`${sound.label} - ${sound.description}`}
            accessibilityRole="button"
            accessibilityHint="Ton abspielen und auswählen"
            accessibilityState={{
              selected: selectedSound === sound.id,
              busy: playingSound === sound.id,
            }}
          >
            <View style={styles.soundContent}>
              <Text style={[
                styles.soundLabel,
                largeText && styles.soundLabelLarge,
                highContrast && styles.soundLabelHC,
                selectedSound === sound.id && styles.selectedText,
                selectedSound === sound.id && highContrast && styles.selectedTextHC,
              ]}>
                {sound.label}
              </Text>

              <Text style={[
                styles.soundDescription,
                largeText && styles.soundDescriptionLarge,
                highContrast && styles.soundDescriptionHC,
                selectedSound === sound.id && styles.selectedText,
                selectedSound === sound.id && highContrast && styles.selectedTextHC,
              ]}>
                {sound.description}
              </Text>

              {playingSound === sound.id && (
                <Text style={[
                  styles.playingIndicator,
                  largeText && styles.playingIndicatorLarge,
                  highContrast && styles.playingIndicatorHC,
                ]}>
                  🔊 Spielt...
                </Text>
              )}

              {selectedSound === sound.id && (
                <Text style={[
                  styles.selectedIndicator,
                  largeText && styles.selectedIndicatorLarge,
                  highContrast && styles.selectedIndicatorHC,
                ]}>
                  ⭐ Ausgewählt
                </Text>
              )}
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={[styles.hint, largeText && styles.hintLarge, highContrast && styles.hintHC]}>
        💡 Du kannst deinen Ton jederzeit ändern
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    margin: SPACING.md,
    shadowColor: COLORS.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  containerHC: {
    backgroundColor: COLORS.highContrastBackground,
    borderColor: COLORS.highContrastText,
    borderWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  titleLarge: {
    fontSize: 24,
  },
  titleHC: {
    color: COLORS.highContrastText,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  subtitleLarge: {
    fontSize: 16,
  },
  subtitleHC: {
    color: COLORS.highContrastPressed,
  },
  scrollContainer: {
    maxHeight: 300,
  },
  soundOption: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  soundOptionHC: {
    backgroundColor: COLORS.highContrastBackground,
    borderColor: COLORS.highContrastText,
  },
  selectedSound: {
    backgroundColor: COLORS.primaryAccent,
    borderColor: COLORS.primaryAccent,
  },
  selectedSoundHC: {
    backgroundColor: COLORS.highContrastText,
    borderColor: COLORS.highContrastText,
  },
  soundPressed: {
    backgroundColor: COLORS.pressed,
  },
  soundPressedHC: {
    backgroundColor: COLORS.highContrastPressed,
  },
  soundContent: {
    alignItems: 'center',
  },
  soundLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  soundLabelLarge: {
    fontSize: 22,
  },
  soundLabelHC: {
    color: COLORS.highContrastText,
  },
  soundDescription: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  soundDescriptionLarge: {
    fontSize: 16,
  },
  soundDescriptionHC: {
    color: COLORS.highContrastPressed,
  },
  playingIndicator: {
    fontSize: 12,
    color: COLORS.primaryAccent,
    fontWeight: 'bold',
  },
  playingIndicatorLarge: {
    fontSize: 14,
  },
  playingIndicatorHC: {
    color: COLORS.highContrastText,
  },
  selectedIndicator: {
    fontSize: 12,
    color: COLORS.surface,
    fontWeight: 'bold',
  },
  selectedIndicatorLarge: {
    fontSize: 14,
  },
  selectedIndicatorHC: {
    color: COLORS.highContrastBackground,
  },
  selectedText: {
    color: COLORS.surface,
  },
  selectedTextHC: {
    color: COLORS.highContrastBackground,
  },
  hint: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.sm,
    fontStyle: 'italic',
  },
  hintLarge: {
    fontSize: 14,
  },
  hintHC: {
    color: COLORS.highContrastPressed,
  },
});