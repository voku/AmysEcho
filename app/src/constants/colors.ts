const colors = {
  primary: '#14B8A6',
  accent: '#EAB308',
  success: '#10B981',
  warning: '#F59E0B',
  warningBackground: '#FEF3C7',
  error: '#EF4444',
  background: '#F7F7F5',
  backgroundStart: '#D1FAE5',
  backgroundEnd: '#F0FDFA',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F5F9',
  text: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#475569',
  inverseText: '#F8FAFC',
  overlay: 'rgba(0,0,0,0.25)',
  overlaySurface: 'rgba(255, 255, 255, 0.28)',
  overlaySurfaceMuted: 'rgba(255, 255, 255, 0.18)',
  overlayBorder: 'rgba(255, 255, 255, 0.35)',
  overlayText: '#F9FAFB',
  overlayTextMuted: '#E2E8F0',
  overlayBadgeBackground: 'rgba(255, 255, 255, 0.85)',
  overlayBadgeText: '#0F172A',
  outline: '#CBD5E1',
  outlineMuted: '#E2E8F0',
  cameraFrame: '#FFFFFF',
  cameraGuideText: '#1E293B',
  shadow: 'rgba(15, 23, 42, 0.16)',
  highContrastBackground: '#000000',
  highContrastText: '#FFFFFF',
  highContrastPressed: '#1F2937',
  vocabDrink: '#CFFAFE',
  vocabEat: '#FDE68A',
  vocabPlay: '#FBCFE8',
  historyBadgeHigh: '#15803D',
  historyBadgeMedium: '#CA8A04',
  historyBadgeLow: '#DC2626',
} as const;

export type ColorName = keyof typeof colors;

export const Colors = colors;

export const getColor = (name: ColorName) => Colors[name];

export default Colors;
