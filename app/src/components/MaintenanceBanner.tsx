import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';

export default function MaintenanceBanner({ onPractice }: { onPractice: () => void }) {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text style={styles.text}>Lass uns dieses Zeichen üben.</Text>
      <Button title="Üben" onPress={onPractice} accessibilityLabel="Üben" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fde68a',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  text: { fontWeight: 'bold' },
});
