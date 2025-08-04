import React from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { logCorrection } from '../storage';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING, RADIUS } from '../constants/ui';

export default function CorrectionScreen({ navigation, route }: any) {
  const { largeText, highContrast } = useAccessibility();
  const { suggestions } = route.params;

  const handleSelect = async (choice: string) => {
    await logCorrection(choice);
    navigation.goBack();
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'transparent',
    },
    title: {
      fontSize: largeText ? 24 : 20,
      marginBottom: SPACING.md,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
    },
    buttonRow: {
      width: '80%',
      flexWrap: 'wrap',
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: SPACING.sm,
      marginTop: SPACING.md,
    },
    choiceButton: {
      width: '48%',
      backgroundColor: COLORS.primaryAccent,
      paddingVertical: SPACING.md,
      borderRadius: RADIUS,
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    choiceButtonHC: {
      backgroundColor: COLORS.highContrastBackground,
      borderWidth: 1,
      borderColor: COLORS.highContrastText,
    },
    choiceButtonText: {
      color: COLORS.highContrastText,
      fontSize: largeText ? 20 : 16,
      fontWeight: 'bold',
    },
  });

  const gradientColors = highContrast
    ? ([COLORS.highContrastBackground, COLORS.highContrastBackground] as const)
    : ([COLORS.backgroundStart, COLORS.backgroundEnd] as const);
  return (
    <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Which sign was this?</Text>
        <View style={styles.buttonRow}>
          {suggestions.map((s: string) => (
            <Pressable
              key={s}
              style={[styles.choiceButton, highContrast && styles.choiceButtonHC]}
              onPress={() => handleSelect(s)}
              accessibilityRole="button"
              accessibilityLabel={s}
            >
              <Text style={styles.choiceButtonText}>{s}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
