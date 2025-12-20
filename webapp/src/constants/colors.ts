const colors = {
  /**
   * Core brand palette
   */
  primary: '#146C6E',
  primaryBright: '#25706F',
  secondary: '#E5E0CF',
  accent: '#F8F4E3',
  neutral: '#0F3A3B',
  background: '#1C4A4B',
  backgroundStart: '#1C4A4B',
  backgroundEnd: '#0F3A3B',
  surface: '#F8F4E3',
  surfaceMuted: '#E5E0CF',
  inverseText: '#FFFFFF',
  text: '#0D1B1B',
  textSecondary: '#1F4A4B',
  textMuted: '#476667',

  /**
   * Semantic tokens
   */
  success: '#4CD964',
  warning: '#F3C969',
  warningBackground: '#F8F4E3',
  error: '#D9534F',
  info: '#3C8E91',
  outline: 'rgba(229, 224, 207, 0.6)',
  outlineMuted: 'rgba(229, 224, 207, 0.3)',

  /**
   * Overlay + scrim system
   */
  overlay: 'rgba(28, 74, 75, 0.55)',
  overlaySurface: 'rgba(248, 244, 227, 0.92)',
  overlaySurfaceMuted: 'rgba(229, 224, 207, 0.88)',
  overlaySurfaceSoft: 'rgba(248, 244, 227, 0.75)',
  overlayBorder: 'rgba(229, 224, 207, 0.45)',
  overlayBadgeBorder: 'rgba(15, 58, 59, 0.2)',
  overlayText: '#FFFFFF',
  overlayTextMuted: 'rgba(255, 255, 255, 0.75)',
  overlayTextSoft: 'rgba(255, 255, 255, 0.6)',
  overlayPlaceholderBackground: 'rgba(255, 255, 255, 0.12)',
  overlayPlaceholderBorder: 'rgba(255, 255, 255, 0.3)',
  overlayBadgeBackground: 'rgba(248, 244, 227, 0.9)',
  overlayBadgeText: '#0D1B1B',

  /**
   * Camera + CTA specifics
   */
  cameraFrame: '#E5E0CF',
  cameraGuideText: '#F8F4E3',
  cameraGuideTextMuted: '#D3CCBB',
  capturePulseBorder: 'rgba(248, 244, 227, 0.8)',
  frameCorner: 'rgba(248, 244, 227, 0.8)',
  cameraFrameBorder: 'rgba(229, 224, 207, 0.45)',
  actionPrimaryBackground: '#E5E0CF',
  actionPrimaryPressed: '#D9D2BD',
  actionPrimaryText: '#0D1B1B',
  actionSecondaryBackground: '#146C6E',
  actionSecondaryPressed: '#0F585A',
  actionSecondaryText: '#F8F4E3',
  actionSecondaryBackgroundMuted: 'rgba(20, 108, 110, 0.2)',
  actionTertiaryBackground: '#0F3A3B',
  actionTertiaryPressed: '#0B2B2C',
  actionTertiaryText: '#F8F4E3',
  actionDisabledBackground: 'rgba(229, 224, 207, 0.35)',
  cameraActionConfirmBackground: '#E5E0CF',
  cameraActionConfirmPressed: '#D9D2BD',
  cameraActionConfirmText: '#002C2C',
  cameraActionLearnBackground: '#25706F',
  cameraActionLearnPressed: '#1E5B5B',
  cameraActionLearnText: '#E5E0CF',
  cameraActionAlternativesBackground: '#1C4A4B',
  cameraActionAlternativesPressed: '#143637',
  cameraActionAlternativesText: '#E5E0CF',
  panelBackground: 'rgba(255, 255, 255, 0.97)',
  panelBorder: 'rgba(255, 255, 255, 0.45)',
  detectionTextBackground: 'rgba(255, 255, 255, 0.82)',

  /**
   * Status styling for the listening loop
   */
  statusListeningBackground: '#25706F',
  statusListeningText: '#FFFFFF',
  statusRecognisingBackground: '#146C6E',
  statusRecognisingText: '#FFFFFF',
  statusLearningBackground: '#E5E0CF',
  statusLearningText: '#0D1B1B',
  statusErrorBackground: '#FBE7E6',
  statusErrorText: '#B42318',

  /**
   * Miscellaneous shared tokens
   */
  shadow: 'rgba(7, 28, 28, 0.22)',
  highContrastBackground: '#000000',
  highContrastText: '#FFFFFF',
  highContrastPressed: '#1F2937',
  vocabDrink: '#D0F2F2',
  vocabEat: '#F7E0B2',
  vocabPlay: '#F9C5D1',
  historyBadgeHigh: '#0F915E',
  historyBadgeMedium: '#CC8A29',
  historyBadgeLow: '#D95141',
  historyHighlightBackground: 'rgba(248, 244, 227, 0.95)',
  historyHighlightBorder: 'rgba(229, 224, 207, 0.6)',
  historyHighlightBadge: 'rgba(229, 224, 207, 0.85)',
  historyHighlightText: '#0D1B1B',
  historyHighlightMuted: '#2E5657',
} as const;

export type ColorName = keyof typeof colors;

export const Colors = colors;

export const getColor = (name: ColorName) => Colors[name];

export default Colors;
