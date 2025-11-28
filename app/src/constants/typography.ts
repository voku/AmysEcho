export const typography = {
  sizes: {
    micro: 12,
    caption: 13,
    body: 17,
    bodyLg: 19,
    label: 18,
    subtitle: 21,
    titleSm: 26,
    title: 34,
    titleLg: 42,
    display: 50,
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
    relaxed: 30,
    hero: 48,
  },
} as const;

export type TypographyConfig = typeof typography;

export default typography;
