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
    padding: 16,
    margin: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
    minWidth: 120,
    alignItems: 'center',
  },
  buttonHC: {
    backgroundColor: '#000',
    borderColor: '#fff',
  },
  text: { fontSize: 16, color: '#333' },
  textLarge: { fontSize: 20 },
  textHC: { color: '#fff' },
});
