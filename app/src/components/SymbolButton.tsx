import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { Symbol } from '../../db/models';
import { useAccessibility } from './AccessibilityContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';

interface Props {
  symbol: Symbol;
  onPress: (s: Symbol) => void;
}

export const SymbolButton = ({ symbol, onPress }: Props) => {
  const { largeText, highContrast } = useAccessibility();
  return (
    <Pressable
      style={[styles.button, highContrast && styles.buttonHC]}
      onPress={() => onPress(symbol)}
      accessibilityRole="button"
      accessibilityLabel={symbol.name}
    >
      <Text
        style={[styles.text, largeText && styles.textLarge, highContrast && styles.textHC]}
        accessibilityLabel={symbol.name}
      >
        {symbol.emoji} {symbol.name}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    padding: SPACING.md,
    margin: SPACING.sm,
    backgroundColor: COLORS.backgroundStart,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: COLORS.primaryAccent,
    minWidth: 120,
    alignItems: 'center',
  },
  buttonHC: {
    backgroundColor: COLORS.highContrastBackground,
    borderColor: COLORS.highContrastText,
  },
  text: { fontSize: 16, color: COLORS.text },
  textLarge: { fontSize: 20 },
  textHC: { color: COLORS.highContrastText },
});
