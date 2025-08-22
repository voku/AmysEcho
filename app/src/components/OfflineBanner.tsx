import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../constants/ui';

interface Props {
  visible: boolean;
}

export default function OfflineBanner({ visible }: Props) {
  if (!visible) return null;
  return (
    <View style={styles.container} accessibilityRole="text" accessibilityLabel="Offline mode">
      <Text style={styles.text}>Offline mode</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.warningBackground,
    padding: SPACING.sm,
    alignItems: 'center',
    zIndex: 1,
  },
  text: {
    fontWeight: 'bold',
  },
});
