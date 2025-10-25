import React from 'react';
import { StyleSheet, View, Pressable, Text } from 'react-native';
import { useAccessibility } from '../components/AccessibilityContext';
import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';
import { childHaptic } from '../services/feedbackService';
import ScreenBackground from '../components/ScreenBackground';
import { ROOT_STACK_ROUTES, type RootStackParamList } from '../navigation/types';
import type { StackNavigationProp } from '@react-navigation/stack';

type Navigation = StackNavigationProp<
  RootStackParamList,
  typeof ROOT_STACK_ROUTES.Teach
>;

export default function TeachScreen({ navigation }: { navigation: Navigation }) {
  const { largeText, highContrast } = useAccessibility();
  const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    button: {
      backgroundColor: COLORS.primaryAccent,
      padding: SPACING.md,
      borderRadius: DEFAULT_RADIUS,
      minWidth: 200,
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
    <ScreenBackground>
      <View style={styles.container}>
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
            navigation.navigate(ROOT_STACK_ROUTES.Teaching);
          }}
          testID="btn-add-sign"
          accessibilityRole="button"
          accessibilityLabel="Neue Gebärde hinzufügen"
        >
          <Text style={[
            styles.buttonText,
            largeText && styles.buttonTextLarge,
            highContrast && styles.buttonTextHC,
          ]}>
            Neue Gebärde hinzufügen
          </Text>
        </Pressable>
      </View>
    </ScreenBackground>
  );
}
