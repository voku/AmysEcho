import React from 'react';
import { View, Button, StyleSheet, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS } from '../constants/ui';

export default function PracticeScreen({ navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    button: { margin: 20 },
  });
  const gradientColors = highContrast
    ? ([COLORS.highContrastBackground, COLORS.highContrastBackground] as const)
    : ([COLORS.backgroundStart, COLORS.backgroundEnd] as const);
  return (
    <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <Button
          title="Start Practice"
          testID="btn-start-practice"
          accessibilityLabel="Start Practice"
          onPress={() => navigation.navigate('Training', { isPractice: true })}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}
