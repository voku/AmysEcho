import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING, TYPOGRAPHY } from '../constants/ui';
import { useAccessibility } from './AccessibilityContext';

type Commitment = {
  id: string;
  emoji: string;
  title: string;
  description: string;
};

const COMMITMENTS: Commitment[] = [
  {
    id: 'no-interruption',
    emoji: '🚫',
    title: 'Keine Unterbrechung',
    description: 'Audio, Video und Text bleiben ohne Pause aktiv – auch bei Netzproblemen.',
  },
  {
    id: 'no-confusion',
    emoji: '🧭',
    title: 'Keine Verwirrung',
    description: 'Klare Symbole, einfache Wörter und sofortige Gestenübersetzung.',
  },
  {
    id: 'no-delay',
    emoji: '⚡️',
    title: 'Keine Verzögerung',
    description: 'Lokale Modelle und Fallbacks reagieren sofort, selbst offline.',
  },
  {
    id: 'no-failure',
    emoji: '🛡️',
    title: 'Keine Ausfälle',
    description: 'Cloud, MLP-Fallback und manuelle Bestätigung sichern jedes Gespräch.',
  },
  {
    id: 'no-judgement',
    emoji: '🎉',
    title: 'Kein Urteil',
    description: 'Jeder Versuch wird gefeiert – Fortschritt zählt mehr als Perfektion.',
  },
  {
    id: 'no-compromise',
    emoji: '🤍',
    title: 'Kein Kompromiss',
    description: 'Amy bestimmt Prioritäten. Alles andere richtet sich nach ihr.',
  },
];

export function AmyFirstCommitments() {
  const { largeText, highContrast } = useAccessibility();

  return (
    <View
      accessibilityRole="list"
      accessibilityLabel="Amy-First Versprechen"
      style={[
        styles.container,
        {
          backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
          borderColor: highContrast ? COLORS.highContrastText : COLORS.outline,
        },
      ]}
    >
      {COMMITMENTS.map((commitment) => (
        <View
          key={commitment.id}
          accessibilityRole="text"
          accessibilityLabel={`${commitment.title}: ${commitment.description}`}
          style={styles.row}
        >
          <View
            style={[
              styles.emojiBadge,
              {
                backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surfaceMuted,
                borderColor: highContrast ? COLORS.highContrastText : COLORS.outline,
              },
            ]}
          >
            <Text
              style={[
                styles.emoji,
                largeText && styles.emojiLarge,
                { color: highContrast ? COLORS.highContrastText : COLORS.primary },
              ]}
            >
              {commitment.emoji}
            </Text>
          </View>
          <View style={styles.textContainer}>
            <Text
              style={[
                styles.title,
                largeText && styles.titleLarge,
                { color: highContrast ? COLORS.highContrastText : COLORS.text },
              ]}
            >
              {commitment.title}
            </Text>
            <Text
              style={[
                styles.description,
                largeText && styles.descriptionLarge,
                { color: highContrast ? COLORS.highContrastText : COLORS.textMuted },
              ]}
            >
              {commitment.description}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    gap: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  emojiBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: TYPOGRAPHY.sizes.titleSm,
  },
  emojiLarge: {
    fontSize: TYPOGRAPHY.sizes.titleLg,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: TYPOGRAPHY.sizes.body,
    fontWeight: TYPOGRAPHY.weights.semibold,
    marginBottom: SPACING.xs,
  },
  titleLarge: {
    fontSize: TYPOGRAPHY.sizes.subtitle,
  },
  description: {
    fontSize: TYPOGRAPHY.sizes.caption,
    lineHeight: 20,
  },
  descriptionLarge: {
    fontSize: TYPOGRAPHY.sizes.body,
    lineHeight: 24,
  },
});
