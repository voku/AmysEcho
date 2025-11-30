export interface Theme {
  name: string;
  displayName: string;
  colors: {
    // Core colors
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textMuted: string;

    // Semantic colors
    success: string;
    warning: string;
    error: string;
    info: string;

    // UI elements
    border: string;
    borderLight: string;
    pressed: string;
    disabled: string;

    // Gradients
    gradientStart: string;
    gradientEnd: string;

    // Special theme colors
    themePrimary: string;
    themeSecondary: string;
    themeAccent: string;
  };
  patterns?: {
    backgroundPattern?: string;
    buttonPattern?: string;
  };
  assets?: {
    logo?: string;
    icons?: Record<string, string>;
  };
}

import Colors from './colors';

export const AMY_ECHO_THEME: Theme = {
  name: 'amyEcho',
  displayName: "Amy's Echo",
  colors: {
    primary: Colors.primary,
    secondary: Colors.secondary,
    accent: Colors.accent,
    background: Colors.background,
    surface: Colors.surface,
    text: Colors.text,
    textMuted: Colors.textMuted,
    success: Colors.success,
    warning: Colors.warning,
    error: Colors.error,
    info: Colors.info,
    border: Colors.outline,
    borderLight: Colors.outlineMuted,
    pressed: Colors.actionSecondaryPressed,
    disabled: Colors.actionDisabledBackground,
    gradientStart: Colors.backgroundStart,
    gradientEnd: Colors.backgroundEnd,
    themePrimary: Colors.primary,
    themeSecondary: Colors.secondary,
    themeAccent: Colors.accent,
  },
  patterns: {
    backgroundPattern: 'grain-soft',
    buttonPattern: 'rounded-slab',
  },
  assets: {
    logo: '🖐️',
    icons: {
      home: '🎥',
      learn: '📚',
      schedule: '🌀',
      menu: '🧭',
      success: '✨',
    },
  },
};

export const RAINBOW_THEME: Theme = {
  name: 'rainbow',
  displayName: 'Regenbogen',
  colors: {
    primary: '#8B5CF6',
    secondary: '#06B6D4',
    accent: '#F59E0B',
    background: '#FEF7FF',
    surface: '#FFFFFF',
    text: '#1F2937',
    textMuted: '#6B7280',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
    border: '#E5E7EB',
    borderLight: '#F3F4F6',
    pressed: '#F0F9FF',
    disabled: '#9CA3AF',
    gradientStart: '#8B5CF6',
    gradientEnd: '#06B6D4',
    themePrimary: '#8B5CF6',
    themeSecondary: '#06B6D4',
    themeAccent: '#F59E0B',
  },
  patterns: {
    backgroundPattern: 'rainbow',
    buttonPattern: 'colorful',
  },
  assets: {
    logo: '🌈',
    icons: {
      home: '🏠',
      learn: '🎯',
      schedule: '📅',
      menu: '⚙️',
      success: '✨',
    },
  },
};

export const OCEAN_THEME: Theme = {
  name: 'ocean',
  displayName: 'Ozean',
  colors: {
    primary: '#0369A1',
    secondary: '#0891B2',
    accent: '#22D3EE',
    background: '#F0FDFA',
    surface: '#FFFFFF',
    text: '#1F2937',
    textMuted: '#6B7280',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
    border: '#E5E7EB',
    borderLight: '#F3F4F6',
    pressed: '#CCFBF1',
    disabled: '#9CA3AF',
    gradientStart: '#0369A1',
    gradientEnd: '#0891B2',
    themePrimary: '#0369A1',
    themeSecondary: '#0891B2',
    themeAccent: '#22D3EE',
  },
  patterns: {
    backgroundPattern: 'waves',
    buttonPattern: 'bubble',
  },
  assets: {
    logo: '🌊',
    icons: {
      home: '🏠',
      learn: '🎯',
      schedule: '📅',
      menu: '⚙️',
      success: '🐠',
    },
  },
};

export const FOREST_THEME: Theme = {
  name: 'forest',
  displayName: 'Wald',
  colors: {
    primary: '#166534',
    secondary: '#16A34A',
    accent: '#84CC16',
    background: '#F0FDF4',
    surface: '#FFFFFF',
    text: '#1F2937',
    textMuted: '#6B7280',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
    border: '#E5E7EB',
    borderLight: '#F3F4F6',
    pressed: '#DCFCE7',
    disabled: '#9CA3AF',
    gradientStart: '#166534',
    gradientEnd: '#16A34A',
    themePrimary: '#166534',
    themeSecondary: '#16A34A',
    themeAccent: '#84CC16',
  },
  patterns: {
    backgroundPattern: 'leaves',
    buttonPattern: 'leaf',
  },
  assets: {
    logo: '🌳',
    icons: {
      home: '🏠',
      learn: '🎯',
      schedule: '📅',
      menu: '⚙️',
      success: '🌟',
    },
  },
};

export const CLASSIC_THEME: Theme = {
  name: 'classic',
  displayName: 'Klassisch',
  colors: {
    primary: '#3B82F6',
    secondary: '#6B7280',
    accent: '#F59E0B',
    background: '#EFF6FF',
    surface: '#FFFFFF',
    text: '#1F2937',
    textMuted: '#6B7280',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
    border: '#E5E7EB',
    borderLight: '#F3F4F6',
    pressed: '#DBEAFE',
    disabled: '#9CA3AF',
    gradientStart: '#3B82F6',
    gradientEnd: '#6366F1',
    themePrimary: '#3B82F6',
    themeSecondary: '#6B7280',
    themeAccent: '#F59E0B',
  },
  patterns: {
    backgroundPattern: 'none',
    buttonPattern: 'rounded',
  },
  assets: {
    logo: '🎨',
    icons: {
      home: '🏠',
      learn: '📖',
      schedule: '📆',
      menu: '☰',
      success: '⭐',
    },
  },
};

export const HIGH_CONTRAST_THEME: Theme = {
  name: 'highContrast',
  displayName: 'Hoher Kontrast',
  colors: {
    primary: '#000000',
    secondary: '#FFFFFF',
    accent: '#FFFF00',
    background: '#000000',
    surface: '#1F1F1F',
    text: '#FFFFFF',
    textMuted: '#CCCCCC',
    success: '#00FF00',
    warning: '#FFFF00',
    error: '#FF0000',
    info: '#00FFFF',
    border: '#FFFFFF',
    borderLight: '#666666',
    pressed: '#333333',
    disabled: '#666666',
    gradientStart: '#000000',
    gradientEnd: '#1F1F1F',
    themePrimary: '#000000',
    themeSecondary: '#FFFFFF',
    themeAccent: '#FFFF00',
  },
  patterns: {
    backgroundPattern: 'none',
    buttonPattern: 'highContrast',
  },
  assets: {
    logo: '👁️',
    icons: {
      home: '🏠',
      learn: '📖',
      schedule: '📆',
      menu: '☰',
      success: '✓',
    },
  },
};

export const AVAILABLE_THEMES: Theme[] = [
  AMY_ECHO_THEME,
  RAINBOW_THEME,
  OCEAN_THEME,
  FOREST_THEME,
  CLASSIC_THEME,
  HIGH_CONTRAST_THEME,
];

export function getThemeByName(name: string): Theme | undefined {
  return AVAILABLE_THEMES.find((theme) => theme.name === name);
}

export function getThemeNames(): string[] {
  return AVAILABLE_THEMES.map((theme) => theme.name);
}

export const DEFAULT_THEME = AMY_ECHO_THEME;
