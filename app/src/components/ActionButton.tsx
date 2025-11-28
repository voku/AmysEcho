import React, { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Colors from '../constants/colors';
import { spacing } from '../constants/spacing';
import typography from '../constants/typography';
import { useAccessibility } from './AccessibilityContext';

type ActionButtonVariant = 'primary' | 'accent' | 'secondary';

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  icon?: ReactNode;
  variant?: ActionButtonVariant;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  pressedBackgroundColor?: string;
  textColor?: string;
  labelStyle?: StyleProp<TextStyle>;
};

const variantBackground: Record<ActionButtonVariant, string> = {
  primary: Colors.actionPrimaryBackground,
  accent: Colors.actionTertiaryBackground,
  secondary: Colors.actionSecondaryBackground,
};

const variantPressedBackground: Record<ActionButtonVariant, string> = {
  primary: Colors.actionPrimaryPressed,
  accent: Colors.actionTertiaryPressed,
  secondary: Colors.actionSecondaryPressed,
};

const variantText: Record<ActionButtonVariant, string> = {
  primary: Colors.actionPrimaryText,
  accent: Colors.actionTertiaryText,
  secondary: Colors.actionSecondaryText,
};

const ActionButton: React.FC<ActionButtonProps> = ({
  label,
  icon,
  onPress,
  accessibilityLabel,
  variant = 'primary',
  disabled = false,
  testID,
  style,
  backgroundColor,
  pressedBackgroundColor,
  textColor,
  labelStyle,
}) => {
  const { highContrast } = useAccessibility();

  const resolvedBackground = backgroundColor ?? variantBackground[variant];
  const resolvedPressedBackground =
    pressedBackgroundColor ?? variantPressedBackground[variant];
  const resolvedTextColor = textColor ?? variantText[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed ? resolvedPressedBackground : resolvedBackground,
          borderColor: variant === 'primary' ? Colors.outline : 'transparent',
        },
        pressed && styles.pressed,
        disabled && styles.disabled,
        variant === 'accent' && styles.accentBorder,
        style,
      ]}
      android_ripple={{ color: highContrast ? Colors.highContrastText : Colors.overlay }}
      testID={testID}
    >
      <View style={styles.content}>
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        <Text style={[styles.label, { color: resolvedTextColor }, labelStyle]}>{label}</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    shadowColor: Colors.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: spacing.md,
  },
  label: {
    fontSize: typography.sizes.label,
    fontWeight: typography.weights.semibold as any,
    letterSpacing: 0.2,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.5,
  },
  accentBorder: {
    borderWidth: 1,
    borderColor: Colors.overlaySurface,
  },
});

export default ActionButton;
