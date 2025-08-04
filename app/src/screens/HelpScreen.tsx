import React from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { COLORS, SPACING } from '../constants/ui';

export default function HelpScreen({ navigation }: any) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>How to Help Amy</Text>
      <Text style={styles.text}>
        If Amy is struggling to be understood, here are some ways you can help:
      </Text>
      <Text style={styles.text}>
        • Encourage her to try the gesture again, perhaps more clearly.
      </Text>
      <Text style={styles.text}>
        • If the app shows a correction panel, select the correct symbol.
      </Text>
      <Text style={styles.text}>
        • If the app is consistently misunderstanding, consider reviewing the
        "Training" section to add new gestures or refine existing ones.
      </Text>
      <Text style={styles.text}>
        • Ensure Amy is in a well-lit area and her hands are clearly visible to the camera.
      </Text>
      <Button title="Go Back" onPress={() => navigation.goBack()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: SPACING.lg,
    color: COLORS.text,
  },
  text: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: SPACING.sm,
    color: COLORS.textMuted,
  },
});