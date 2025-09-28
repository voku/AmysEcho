import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import { useAccessibility } from '../components/AccessibilityContext';
import { childHaptic } from '../services/feedbackService';

export default function ParentalGateScreen({ route, navigation }: any) {
  const { largeText, highContrast } = useAccessibility();
  const { target } = route.params as { target: string };
  const [problem, setProblem] = useState('');
  const [answer, setAnswer] = useState('');
  const [solution, setSolution] = useState<number>(0);

  useEffect(() => {
    const a = Math.floor(Math.random() * 10) + 2; // 2..11
    const b = Math.floor(Math.random() * 10) + 2;
    setProblem(`${a} × ${b} = ?`);
    setSolution(a * b);
  }, []);

  const handleCheck = () => {
    if (parseInt(answer, 10) === solution) {
      navigation.replace(target);
    } else {
      setAnswer('');
      const a = Math.floor(Math.random() * 10) + 2;
      const b = Math.floor(Math.random() * 10) + 2;
      setProblem(`${a} × ${b} = ?`);
      setSolution(a * b);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.lg,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
    },
    title: {
      fontSize: largeText ? 28 : 24,
      marginBottom: SPACING.lg,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      textAlign: 'center',
    },
    input: {
      borderWidth: 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
      width: largeText ? 140 : 120,
      padding: SPACING.sm,
      textAlign: 'center',
      marginBottom: SPACING.lg,
      borderRadius: DEFAULT_RADIUS,
      fontSize: largeText ? 20 : 16,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
    },
    button: {
      backgroundColor: COLORS.primaryAccent,
      padding: SPACING.md,
      borderRadius: DEFAULT_RADIUS,
      minWidth: 100,
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    buttonHC: {
      backgroundColor: COLORS.highContrastText,
    },
    buttonPressed: {
      backgroundColor: COLORS.pressed,
    },
    buttonPressedHC: {
      backgroundColor: COLORS.highContrastPressed,
    },
    buttonText: {
      color: COLORS.highContrastText,
      fontSize: 16,
      fontWeight: 'bold',
    },
    buttonTextLarge: {
      fontSize: 20,
    },
    buttonTextHC: {
      color: COLORS.highContrastBackground,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{problem}</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={answer}
        onChangeText={setAnswer}
        accessibilityLabel="Antwort auf Elternprüfung"
        placeholder="Antwort eingeben"
        placeholderTextColor={highContrast ? COLORS.highContrastText : COLORS.textMuted}
      />
      <Pressable
        style={({ pressed }) => [
          {
            minWidth: 60,
            minHeight: 60,
            padding: SPACING.md,
            alignItems: 'center',
            justifyContent: 'center',
          },
          styles.button,
          highContrast && styles.buttonHC,
          pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
        ]}
        onPress={() => {
          void childHaptic();
          handleCheck();
        }}
        accessibilityRole="button"
        accessibilityLabel="Antwort bestätigen"
      >
        <Text style={[
          styles.buttonText,
          largeText && styles.buttonTextLarge,
          highContrast && styles.buttonTextHC,
        ]}>
          OK
        </Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          {
            minWidth: 60,
            minHeight: 60,
            padding: SPACING.md,
            alignItems: 'center',
            justifyContent: 'center',
          },
          styles.button,
          highContrast && styles.buttonHC,
          pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
        ]}
        onPress={() => {
          void childHaptic();
          navigation.goBack();
        }}
        accessibilityRole="button"
        accessibilityLabel="Zurück"
      >
        <Text style={[
          styles.buttonText,
          largeText && styles.buttonTextLarge,
          highContrast && styles.buttonTextHC,
        ]}>
          Zurück
        </Text>
      </Pressable>
    </View>
  );
}
