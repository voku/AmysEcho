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
  primary: Colors.primary,
  accent: Colors.accent,
  secondary: Colors.surface,
};

const variantText: Record<ActionButtonVariant, string> = {
  primary: Colors.inverseText,
  accent: Colors.text,
  secondary: Colors.text,
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
  const resolvedBackground = backgroundColor ?? variantBackground[variant];
  const resolvedPressedBackground = pressedBackgroundColor ?? resolvedBackground;
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
        { backgroundColor: pressed ? resolvedPressedBackground : resolvedBackground },
        pressed && styles.pressed,
        disabled && styles.disabled,
        variant === 'secondary' && styles.secondaryBorder,
        style,
      ]}
      android_ripple={{ color: Colors.overlay }}
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
    borderRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    shadowColor: Colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: spacing.sm,
  },
  label: {
    fontSize: typography.sizes.subtitle,
    fontWeight: typography.weights.semibold as any,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.5,
  },
  secondaryBorder: {
    borderWidth: 2,
    borderColor: Colors.primary,
  },
});

export default ActionButton;
