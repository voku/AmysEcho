const colors = {
  primary: '#14B8A6',
  accent: '#EAB308',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  background: '#F7F7F5',
  text: '#0F172A',
  inverseText: '#F8FAFC',
  overlay: 'rgba(0,0,0,0.25)',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F5F9',
  outline: '#CBD5E1',
  outlineMuted: '#E2E8F0',
  cameraFrame: '#FFFFFF',
  cameraGuideText: '#1E293B',
  shadow: 'rgba(15, 23, 42, 0.16)',
  historyBadgeHigh: '#15803D',
  historyBadgeMedium: '#CA8A04',
  historyBadgeLow: '#DC2626',
} as const;

export type ColorName = keyof typeof colors;

export const Colors = colors;

export const getColor = (name: ColorName) => Colors[name];

export default Colors;
