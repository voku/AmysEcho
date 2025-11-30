import Colors from './colors';
import { spacing } from './spacing';
import typography from './typography';

export const COLORS = {
  ...Colors,
  primaryAccent: Colors.primary,
  secondaryAccent: Colors.accent,
  secondary: Colors.accent,
  background: Colors.background,
  surface: Colors.surface,
  backgroundStart: Colors.backgroundStart,
  backgroundEnd: Colors.backgroundEnd,
  textMuted: Colors.textMuted,
  textSecondary: Colors.textSecondary,
  warningBackground: Colors.warningBackground,
  vocabDrink: Colors.vocabDrink,
  vocabEat: Colors.vocabEat,
  vocabPlay: Colors.vocabPlay,
  border: Colors.outline,
  borderDark: Colors.neutral,
  pressed: Colors.actionSecondaryPressed,
  highContrastPressed: Colors.highContrastPressed,
  highContrastBackground: Colors.highContrastBackground,
  highContrastText: Colors.highContrastText,
  overlayBackdrop: 'rgba(12, 56, 60, 0.85)',
  overlaySurface: Colors.overlaySurface,
  overlaySurfaceMuted: Colors.overlaySurfaceMuted,
  overlayBorder: Colors.overlayBorder,
  overlayText: Colors.overlayText,
  overlayTextMuted: Colors.overlayTextMuted,
  overlayBadgeBackground: Colors.overlayBadgeBackground,
  overlayBadgeText: Colors.overlayBadgeText,
} as const;

export const SPACING = {
  ...spacing,
  md: spacing.md,
  lg: spacing.lg,
  xl: spacing.xl,
  xxl: spacing['2xl'],
} as const;

export const TYPOGRAPHY = typography;

// Default radius (md) with size shortcuts attached.
export const RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
} as const;

export const DEFAULT_RADIUS = RADIUS.md;

export const FONT_SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
} as const;
