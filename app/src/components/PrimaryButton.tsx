import React, { useMemo } from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { createButtonStyles } from '../styles/buttonStyles';
import { useAccessibility } from './AccessibilityContext';
import { COLORS } from '../constants/ui';

type ButtonVariant = 'primary' | 'secondary';

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
};

const baseStyles = createButtonStyles();

const variantStyles = StyleSheet.create({
  secondary: {
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.primaryAccent,
  },
  secondaryHC: {
    backgroundColor: COLORS.highContrastBackground,
    borderColor: COLORS.highContrastText,
  },
  secondaryText: {
    color: COLORS.primaryAccent,
  },
  secondaryTextHC: {
    color: COLORS.highContrastText,
  },
});

export default function PrimaryButton({
  label,
  onPress,
  disabled = false,
  testID,
  accessibilityLabel,
  accessibilityHint,
  variant = 'primary',
  style,
}: PrimaryButtonProps) {
  const { largeText, highContrast } = useAccessibility();

  const pressableStyle = useMemo(
    () =>
      ({ pressed }: { pressed: boolean }) => [
        baseStyles.button,
        highContrast && baseStyles.buttonHC,
        variant === 'secondary' && variantStyles.secondary,
        variant === 'secondary' && highContrast && variantStyles.secondaryHC,
        disabled && baseStyles.buttonDisabled,
        pressed && !disabled && (highContrast ? baseStyles.buttonPressedHC : baseStyles.buttonPressed),
        style,
      ],
    [disabled, highContrast, style, variant],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      style={pressableStyle}
      testID={testID}
    >
      <Text
        style={[
          baseStyles.buttonText,
          largeText && baseStyles.buttonTextLarge,
          highContrast && baseStyles.buttonTextHC,
          variant === 'secondary' && variantStyles.secondaryText,
          variant === 'secondary' && highContrast && variantStyles.secondaryTextHC,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
