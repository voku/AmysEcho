import React, { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, DEFAULT_RADIUS, SPACING } from '../../constants/ui';
import { useAccessibility } from '../AccessibilityContext';
import { childHaptic } from '../../services/feedbackService';

type SettingsOptionCardTone = 'default' | 'danger';

export type SettingsOptionCardProps = {
  title: string;
  subtitle?: string;
  onPress: () => void | Promise<void>;
  accessibilityLabel: string;
  accessibilityHint?: string;
  accessibilityValue?: string;
  tone?: SettingsOptionCardTone;
  playHaptic?: boolean;
  disabled?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  testID?: string;
};

export default function SettingsOptionCard({
  title,
  subtitle,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  accessibilityValue,
  tone = 'default',
  playHaptic = false,
  disabled = false,
  leading,
  trailing,
  testID,
}: SettingsOptionCardProps) {
  const { highContrast, largeText } = useAccessibility();

  const handlePress = () => {
    if (disabled) return;
    if (playHaptic) {
      void childHaptic();
    }
    void onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityValue={accessibilityValue ? { text: accessibilityValue } : undefined}
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.card,
        highContrast && styles.cardHC,
        tone === 'danger' && styles.cardDanger,
        highContrast && tone === 'danger' && styles.cardDangerHC,
        pressed && !disabled &&
          (highContrast
            ? tone === 'danger'
              ? styles.cardPressedDangerHC
              : styles.cardPressedHC
            : tone === 'danger'
            ? styles.cardPressedDanger
            : styles.cardPressed),
        disabled && styles.cardDisabled,
      ]}
      testID={testID}
    >
      <View style={styles.content}>
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <View style={styles.textContainer}>
          <Text
            style={[
              styles.title,
              largeText && styles.titleLarge,
              highContrast && styles.titleHC,
              tone === 'danger' && styles.titleDanger,
              highContrast && tone === 'danger' && styles.titleDangerHC,
            ]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[
                styles.subtitle,
                largeText && styles.subtitleLarge,
                highContrast && styles.subtitleHC,
                tone === 'danger' && styles.subtitleDanger,
                highContrast && tone === 'danger' && styles.subtitleDangerHC,
              ]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 68,
    borderRadius: DEFAULT_RADIUS,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outline,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  cardHC: {
    backgroundColor: COLORS.highContrastBackground,
    borderColor: COLORS.highContrastText,
    shadowOpacity: 0,
    elevation: 0,
  },
  cardDanger: {
    borderColor: COLORS.error,
  },
  cardDangerHC: {
    borderColor: COLORS.error,
  },
  cardPressed: {
    backgroundColor: COLORS.surfaceMuted,
  },
  cardPressedHC: {
    backgroundColor: COLORS.highContrastPressed,
  },
  cardPressedDanger: {
    backgroundColor: '#FBECEC',
  },
  cardPressedDangerHC: {
    backgroundColor: COLORS.highContrastPressed,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  leading: {
    marginRight: SPACING.md,
    marginTop: 2,
  },
  trailing: {
    marginLeft: SPACING.md,
    alignSelf: 'center',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  titleLarge: {
    fontSize: 20,
  },
  titleHC: {
    color: COLORS.highContrastText,
  },
  titleDanger: {
    color: COLORS.error,
  },
  titleDangerHC: {
    color: COLORS.error,
  },
  subtitle: {
    marginTop: SPACING.xs,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  subtitleLarge: {
    fontSize: 16,
  },
  subtitleHC: {
    color: COLORS.highContrastText,
  },
  subtitleDanger: {
    color: COLORS.error,
  },
  subtitleDangerHC: {
    color: COLORS.error,
  },
});
