export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
} as const;

export type SpacingToken = keyof typeof spacing;

export const getSpacing = (token: SpacingToken) => spacing[token];

export default spacing;
