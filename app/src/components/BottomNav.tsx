import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { Hand, BookOpen, Settings } from 'lucide-react-native';
import type { RootStackParamList } from '../navigation/types';
import { COLORS, SPACING } from '../constants/ui';
import { useAccessibility } from './AccessibilityContext';
import { childFriendlyStyles } from '../styles/touchTargets';
import { childHaptic } from '../services/feedbackService';

interface Props {
  active: 'recognition' | 'training' | 'parent';
  profileId: string;
}

export default function BottomNav({ active, profileId }: Props) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { highContrast } = useAccessibility();
  return (
    <View style={[styles.container, highContrast && styles.containerHC]}>
      <Pressable
        onPress={() => {
          void childHaptic();
          navigation.navigate('Recognition', { profileId });
        }}
        style={({ pressed }) => [
          childFriendlyStyles.minTouchTarget,
          styles.item,
          pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
        ]}
        accessibilityLabel="Zuhören"
        accessibilityRole="button"
        accessibilityHint="Gestenerkennung starten"
      >
        <Hand
          size={24}
          color={
            highContrast
              ? active === 'recognition'
                ? COLORS.highContrastText
                : COLORS.highContrastPressed
              : active === 'recognition'
              ? COLORS.primaryAccent
              : COLORS.secondaryAccent
          }
          style={styles.icon}
        />
        <Text
          style={[
            styles.label,
            highContrast && styles.labelHC,
            active === 'recognition' && (highContrast ? styles.activeHC : styles.active),
          ]}
        >
          Zuhören
        </Text>
      </Pressable>
      <Pressable
        onPress={() => {
          void childHaptic();
          navigation.navigate('Training', { gestureLabel: undefined });
        }}
        style={({ pressed }) => [
          childFriendlyStyles.minTouchTarget,
          styles.item,
          pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
        ]}
        accessibilityLabel="Lernen"
        accessibilityRole="button"
        accessibilityHint="Gesten aufnehmen oder üben"
      >
        <BookOpen
          size={24}
          color={
            highContrast
              ? active === 'training'
                ? COLORS.highContrastText
                : COLORS.highContrastPressed
              : active === 'training'
              ? COLORS.primaryAccent
              : COLORS.secondaryAccent
          }
          style={styles.icon}
        />
        <Text
          style={[
            styles.label,
            highContrast && styles.labelHC,
            active === 'training' && (highContrast ? styles.activeHC : styles.active),
          ]}
        >
          Lernen
        </Text>
      </Pressable>
      <Pressable
        onPress={() => {
          void childHaptic();
          navigation.navigate('ProfileSelect');
        }}
        style={({ pressed }) => [
          childFriendlyStyles.minTouchTarget,
          styles.item,
          pressed && (highContrast ? styles.buttonPressedHC : styles.buttonPressed),
        ]}
        accessibilityLabel="Menü"
        accessibilityRole="button"
        accessibilityHint="Profil- und Einstellungsmenü öffnen"
      >
        <Settings
          size={24}
          color={
            highContrast
              ? active === 'parent'
                ? COLORS.highContrastText
                : COLORS.highContrastPressed
              : active === 'parent'
              ? COLORS.primaryAccent
              : COLORS.secondaryAccent
          }
          style={styles.icon}
        />
        <Text
          style={[
            styles.label,
            highContrast && styles.labelHC,
            active === 'parent' && (highContrast ? styles.activeHC : styles.active),
          ]}
        >
          Menü
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  containerHC: {
    backgroundColor: COLORS.highContrastBackground,
    borderColor: COLORS.highContrastText,
  },
  item: {
    alignItems: 'center',
  },
  buttonPressed: { backgroundColor: COLORS.pressed },
  buttonPressedHC: { backgroundColor: COLORS.highContrastPressed },
  icon: {
    marginBottom: SPACING.xs,
  },
  label: {
    fontSize: 12,
    color: COLORS.secondaryAccent,
  },
  labelHC: {
    color: COLORS.highContrastPressed,
  },
  active: {
    color: COLORS.primaryAccent,
    fontWeight: 'bold',
  },
  activeHC: {
    color: COLORS.highContrastText,
    fontWeight: 'bold',
  },
});
