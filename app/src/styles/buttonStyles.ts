import { COLORS, SPACING, DEFAULT_RADIUS } from '../constants/ui';

export const createButtonStyles = () => ({
  button: {
    backgroundColor: COLORS.primaryAccent,
    padding: SPACING.md,
    borderRadius: DEFAULT_RADIUS,
    minWidth: 120,
    alignItems: 'center' as const,
    marginVertical: SPACING.sm,
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
  buttonDisabled: {
    backgroundColor: COLORS.secondaryAccent,
    opacity: 0.6,
  },
  buttonText: {
    color: COLORS.highContrastText,
    fontSize: 16,
    fontWeight: 'bold' as const,
  },
  buttonTextLarge: {
    fontSize: 20,
  },
  buttonTextHC: {
    color: COLORS.highContrastBackground,
  },
});
