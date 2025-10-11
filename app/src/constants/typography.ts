export const typography = {
  sizes: {
    caption: 14,
    body: 16,
    subtitle: 18,
    titleSm: 24,
    title: 36,
    titleLg: 40,
    display: 48,
  },
  weights: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
  lineHeights: {
    compact: 18,
    default: 24,
    relaxed: 32,
    hero: 40,
  },
} as const;

export type TypographyConfig = typeof typography;

export default typography;
