export const COLORS = {
  backgroundStart: '#EFF6FF',
  backgroundEnd: '#F3F4F6',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#333333',
  textMuted: '#666666',
  textSecondary: '#6B7280',
  primary: '#3B82F6',
  secondary: '#6B7280',
  primaryAccent: '#3B82F6',
  secondaryAccent: '#6B7280',
  vocabDrink: '#AEDFF7',
  vocabEat: '#F7C5A8',
  vocabPlay: '#A8F7A8',
  success: '#4CAF50',
  warning: '#FFD700',
  error: '#EF4444',
  warningBackground: '#FDE68A',
  border: '#E5E7EB',
  borderDark: '#888888',
  pressed: '#E0E0E0',
  highContrastPressed: '#555555',
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
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

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
