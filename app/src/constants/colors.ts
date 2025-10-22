const colors = {
  /**
   * Core brand palette
   */
  primary: '#0F5257',
  primaryBright: '#1A6F73',
  secondary: '#F2E7DC',
  accent: '#FF8A5B',
  neutral: '#0D3A3D',
  background: '#F5F1EB',
  backgroundStart: '#05363A',
  backgroundEnd: '#0F5257',
  surface: '#FFFFFF',
  surfaceMuted: '#E3ECEC',
  inverseText: '#FCFEFE',
  text: '#14363A',
  textSecondary: '#366166',
  textMuted: '#5A8A8E',

  /**
   * Semantic tokens
   */
  success: '#46C49D',
  warning: '#E3B13C',
  warningBackground: '#FCF4DF',
  error: '#DC5B57',
  info: '#2F8EA2',
  outline: '#9CC9C9',
  outlineMuted: '#CBE1E1',

  /**
   * Overlay + scrim system
   */
  overlay: 'rgba(12, 56, 60, 0.28)',
  overlaySurface: 'rgba(255, 255, 255, 0.22)',
  overlaySurfaceMuted: 'rgba(255, 255, 255, 0.12)',
  overlaySurfaceSoft: 'rgba(255, 255, 255, 0.18)',
  overlayBorder: 'rgba(255, 255, 255, 0.28)',
  overlayBadgeBorder: 'rgba(19, 70, 76, 0.16)',
  overlayText: '#F2FAFA',
  overlayTextMuted: '#C7DFE1',
  overlayTextSoft: 'rgba(255, 255, 255, 0.68)',
  overlayPlaceholderBackground: 'rgba(255, 255, 255, 0.1)',
  overlayPlaceholderBorder: 'rgba(255, 255, 255, 0.24)',
  overlayBadgeBackground: 'rgba(255, 255, 255, 0.88)',
  overlayBadgeText: '#13464C',

  /**
   * Camera + CTA specifics
   */
  cameraFrame: '#F4D6AB',
  cameraGuideText: '#FDF7ED',
  cameraGuideTextMuted: '#E6D8C6',
  capturePulseBorder: '#FDF1DD',
  frameCorner: '#FDF1DD',
  cameraFrameBorder: 'rgba(253, 241, 221, 0.35)',
  actionPrimaryBackground: '#FDF1DD',
  actionPrimaryPressed: '#F1E0C2',
  actionPrimaryText: '#0D3A3D',
  actionSecondaryBackground: '#0F5257',
  actionSecondaryPressed: '#0C4144',
  actionSecondaryText: '#FDF7ED',
  actionSecondaryBackgroundMuted: 'rgba(15, 82, 87, 0.16)',
  actionTertiaryBackground: '#14363A',
  actionTertiaryPressed: '#0D2729',
  actionTertiaryText: '#F2E7DC',
  actionDisabledBackground: 'rgba(20, 54, 58, 0.32)',
  cameraActionConfirmBackground: '#E5E0CF',
  cameraActionConfirmPressed: '#D9D2BD',
  cameraActionConfirmText: '#002C2C',
  cameraActionLearnBackground: '#25706F',
  cameraActionLearnPressed: '#1E5B5B',
  cameraActionLearnText: '#E5E0CF',
  cameraActionAlternativesBackground: '#1C4A4B',
  cameraActionAlternativesPressed: '#143637',
  cameraActionAlternativesText: '#E5E0CF',

  /**
   * Status styling for the listening loop
   */
  statusListeningBackground: '#114B4E',
  statusListeningText: '#F6FBFB',
  statusRecognisingBackground: '#1A6F73',
  statusRecognisingText: '#FFFFFF',
  statusLearningBackground: '#F2E7DC',
  statusLearningText: '#10363A',
  statusErrorBackground: '#FFEDEA',
  statusErrorText: '#B42318',

  /**
   * Miscellaneous shared tokens
   */
  shadow: 'rgba(13, 58, 61, 0.18)',
  highContrastBackground: '#000000',
  highContrastText: '#FFFFFF',
  highContrastPressed: '#1F2937',
  vocabDrink: '#D0F2F2',
  vocabEat: '#F7E0B2',
  vocabPlay: '#F9C5D1',
  historyBadgeHigh: '#0F915E',
  historyBadgeMedium: '#CC8A29',
  historyBadgeLow: '#D95141',
  historyHighlightBackground: 'rgba(255, 255, 255, 0.95)',
  historyHighlightBorder: 'rgba(253, 241, 221, 0.48)',
  historyHighlightBadge: 'rgba(253, 241, 221, 0.72)',
  historyHighlightText: '#0D3A3D',
  historyHighlightMuted: '#355F63',
} as const;

export type ColorName = keyof typeof colors;

export const Colors = colors;

export const getColor = (name: ColorName) => Colors[name];

export default Colors;
