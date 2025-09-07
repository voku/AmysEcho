import React from 'react';
import { StyleSheet, SafeAreaView, Button } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS } from '../constants/ui';

export default function TeachScreen({ navigation }: any) {
  const { highContrast } = useAccessibility();
  const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  });
  const gradientColors = highContrast
    ? ([COLORS.highContrastBackground, COLORS.highContrastBackground] as const)
    : ([COLORS.backgroundStart, COLORS.backgroundEnd] as const);
  return (
    <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <Button
          title="Neue Gebärde hinzufügen"
          testID="btn-add-sign"
          accessibilityLabel="Neue Gebärde hinzufügen"
          onPress={() => navigation.navigate('Teaching')}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}
