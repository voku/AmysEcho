import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { Symbol } from '../../db/models';
import { useAccessibility } from './AccessibilityContext';

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
    padding: 10,
    margin: 5,
    backgroundColor: '#eee',
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  buttonHC: {
    backgroundColor: '#000',
  },
  text: { fontSize: 16, color: '#000' },
  textLarge: { fontSize: 20 },
  textHC: { color: '#fff' },
});
