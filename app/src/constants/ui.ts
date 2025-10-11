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
  backgroundStart: '#D1FAE5',
  backgroundEnd: '#F0FDFA',
  textMuted: '#475569',
  textSecondary: '#334155',
  border: '#E2E8F0',
  borderDark: '#94A3B8',
  pressed: '#0F766E',
  highContrastPressed: '#1F2937',
  highContrastBackground: '#000000',
  highContrastText: '#FFFFFF',
  overlayBackdrop: 'rgba(15, 23, 42, 0.85)',
  overlaySurface: 'rgba(255, 255, 255, 0.28)',
  overlaySurfaceMuted: 'rgba(255, 255, 255, 0.18)',
  overlayBorder: 'rgba(255, 255, 255, 0.35)',
  overlayText: '#F9FAFB',
  overlayTextMuted: '#E2E8F0',
  overlayBadgeBackground: 'rgba(255, 255, 255, 0.85)',
  overlayBadgeText: '#0F172A',
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
