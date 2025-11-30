export { Colors, getColor } from './colors';
export type { ColorName } from './colors';

export { spacing, getSpacing } from './spacing';
export type { SpacingToken } from './spacing';

export { typography } from './typography';
export type { TypographyConfig } from './typography';

export {
  COLORS,
  SPACING,
  TYPOGRAPHY,
  RADIUS,
  DEFAULT_RADIUS,
  FONT_SIZES,
} from './ui';

export {
  GESTURE_MEANINGS,
  getGestureMeaningById,
  getGestureMeaningByGestureId,
  getGestureMeaningBySequenceId,
  findCoordinatedGestureMeaningByHands,
  findSequenceGestureMeaningByGestures,
  getGestureMeaningsByCategory,
  getGestureMeaningsByDifficulty,
  formatGestureMeaning,
  isCoordinatedGestureString,
  parseCoordinatedGestureString,
} from './gestureMeanings';
export type {
  GestureMeaningCategory,
  GestureMeaningDifficulty,
  SingleGestureMeaningDefinition,
  CoordinatedGestureMeaningDefinition,
  SequenceGestureMeaningDefinition,
  GestureMeaningDefinition,
} from './gestureMeanings';

export {
  AMY_ECHO_THEME,
  RAINBOW_THEME,
  OCEAN_THEME,
  FOREST_THEME,
  CLASSIC_THEME,
  HIGH_CONTRAST_THEME,
  AVAILABLE_THEMES,
  getThemeByName,
  getThemeNames,
  DEFAULT_THEME,
} from './themes';
export type { Theme } from './themes';

export { HAND_CONNECTIONS } from './hand';
