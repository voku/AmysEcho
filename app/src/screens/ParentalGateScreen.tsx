import React, { useState, useEffect } from 'react';
import { Text, TextInput, Pressable, StyleSheet, View } from 'react-native';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import { useAccessibility } from '../components/AccessibilityContext';
import { childHaptic } from '../services/feedbackService';
import ScreenBackground from '../components/ScreenBackground';
import { childFriendlyStyles } from '../styles/touchTargets';

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

  const cardBackground = highContrast ? COLORS.highContrastBackground : COLORS.surface;
  const styles = StyleSheet.create({
    background: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    backgroundContent: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SPACING.xxl,
      paddingHorizontal: SPACING.lg,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      paddingVertical: SPACING.xl,
      paddingHorizontal: SPACING.lg,
      borderRadius: DEFAULT_RADIUS * 2,
      alignItems: 'center',
      gap: SPACING.md,
      backgroundColor: cardBackground,
      borderWidth: highContrast ? 2 : StyleSheet.hairlineWidth,
      borderColor: highContrast ? COLORS.highContrastText : 'rgba(255, 255, 255, 0.4)',
      shadowColor: highContrast ? 'transparent' : COLORS.shadow,
      shadowOpacity: highContrast ? 0 : 0.2,
      shadowRadius: highContrast ? 0 : 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: highContrast ? 0 : 6,
    },
    title: {
      fontSize: largeText ? 32 : 28,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      textAlign: 'center',
    },
    description: {
      fontSize: largeText ? 18 : 16,
      color: highContrast ? COLORS.highContrastText : COLORS.textSecondary,
      textAlign: 'center',
    },
    input: {
      borderWidth: 1,
      borderColor: highContrast ? COLORS.highContrastText : COLORS.border,
      width: '100%',
      maxWidth: 220,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      textAlign: 'center',
      borderRadius: DEFAULT_RADIUS,
      fontSize: largeText ? 22 : 18,
      color: highContrast ? COLORS.highContrastText : COLORS.text,
      backgroundColor: highContrast ? COLORS.highContrastBackground : COLORS.surface,
    },
    buttonRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: SPACING.md,
      width: '100%',
      marginTop: SPACING.sm,
    },
    button: {
      backgroundColor: COLORS.primaryAccent,
      padding: SPACING.md,
      borderRadius: DEFAULT_RADIUS,
      minWidth: 140,
      alignItems: 'center',
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
    <ScreenBackground
      scrollable
      style={styles.background}
      contentContainerStyle={styles.backgroundContent}
    >
      <View style={styles.card}>
        <Text style={styles.title}>{problem}</Text>
        <Text style={styles.description}>
          Bitte beantworte die kurze Rechenaufgabe, um fortzufahren.
        </Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={answer}
          onChangeText={setAnswer}
          accessibilityLabel="Antwort auf Elternprüfung"
          placeholder="Antwort eingeben"
          placeholderTextColor={highContrast ? COLORS.highContrastText : COLORS.textMuted}
        />
        <View style={styles.buttonRow}>
          <Pressable
            style={({ pressed }) => [
              childFriendlyStyles.minTouchTarget,
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
            <Text
              style={[
                styles.buttonText,
                largeText && styles.buttonTextLarge,
                highContrast && styles.buttonTextHC,
              ]}
            >
              OK
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              childFriendlyStyles.minTouchTarget,
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
            <Text
              style={[
                styles.buttonText,
                largeText && styles.buttonTextLarge,
                highContrast && styles.buttonTextHC,
              ]}
            >
              Zurück
            </Text>
          </Pressable>
        </View>
      </View>
    </ScreenBackground>
  );
}
