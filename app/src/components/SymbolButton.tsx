import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { Symbol } from '../../db/models';

interface Props {
  symbol: Symbol;
  onPress: (s: Symbol) => void;
}

export const SymbolButton = ({ symbol, onPress }: Props) => (
  <Pressable
    style={styles.button}
    onPress={() => onPress(symbol)}
    accessibilityLabel={symbol.name}
  >
    <Text style={styles.text} accessibilityLabel={symbol.name}>
      {symbol.emoji} {symbol.name}
    </Text>
  </Pressable>
);

const styles = StyleSheet.create({
  button: { padding: 10, margin: 5, backgroundColor: '#eee', borderRadius: 8, minWidth: 120, alignItems: 'center' },
  text: { fontSize: 16 },
});
