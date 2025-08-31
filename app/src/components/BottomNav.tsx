import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import Svg, { Path, Circle } from 'react-native-svg';
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
        <HandIcon
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
        <BookIcon
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
        <SettingsIcon
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

interface IconProps {
  size: number;
  color: string;
  style?: StyleProp<ViewStyle>;
}

function HandIcon({ size, color, style }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <Path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
      <Path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
      <Path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
      <Path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </Svg>
  );
}

function BookIcon({ size, color, style }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <Path d="M12 7v14" />
      <Path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </Svg>
  );
}

function SettingsIcon({ size, color, style }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <Path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
      <Circle cx="12" cy="12" r="3" />
    </Svg>
  );
}
