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

import { PAW_PATROL_ASSETS } from './pawPatrolAssets';

export const PAW_PATROL_THEME: Theme = {
  name: 'pawPatrol',
  displayName: 'Paw Patrol',
  colors: {
    primary: '#1E40AF', // Deep blue like Chase
    secondary: '#DC2626', // Red like Marshall
    accent: '#F59E0B', // Gold like the Paw Patrol badge
    background: '#EFF6FF', // Light blue background
    surface: '#FFFFFF',
    text: '#1F2937',
    textMuted: '#6B7280',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
    border: '#E5E7EB',
    borderLight: '#F3F4F6',
    pressed: '#E0E7FF',
    disabled: '#9CA3AF',
    gradientStart: '#1E40AF',
    gradientEnd: '#3B82F6',
    themePrimary: '#1E40AF',
    themeSecondary: '#DC2626',
    themeAccent: '#F59E0B',
  },
  patterns: {
    backgroundPattern: 'pawPrint',
    buttonPattern: 'badge',
  },
  assets: {
    logo: PAW_PATROL_ASSETS.characters.chase,
    icons: {
      home: PAW_PATROL_ASSETS.icons.home,
      learn: PAW_PATROL_ASSETS.icons.learn,
      schedule: PAW_PATROL_ASSETS.icons.badge,
      menu: PAW_PATROL_ASSETS.icons.help,
      success: PAW_PATROL_ASSETS.icons.star,
    },
  },
};

export const RAINBOW_THEME: Theme = {
  name: 'rainbow',
  displayName: 'Regenbogen',
  colors: {
    primary: '#8B5CF6', // Purple
    secondary: '#06B6D4', // Cyan
    accent: '#F59E0B', // Amber
    background: '#FEF7FF', // Light purple
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
    primary: '#0369A1', // Ocean blue
    secondary: '#0891B2', // Teal
    accent: '#22D3EE', // Sky blue
    background: '#F0FDFA', // Light teal
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
    primary: '#166534', // Forest green
    secondary: '#16A34A', // Light green
    accent: '#84CC16', // Lime green
    background: '#F0FDF4', // Light green
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
    pressed: '#E0E7FF',
    disabled: '#9CA3AF',
    gradientStart: '#3B82F6',
    gradientEnd: '#60A5FA',
    themePrimary: '#3B82F6',
    themeSecondary: '#6B7280',
    themeAccent: '#F59E0B',
  },
  assets: {
    logo: '🎨',
    icons: {
      home: '🏠',
      learn: '🎯',
      schedule: '📅',
      menu: '⚙️',
      success: '✅',
    },
  },
};

export const THEMES: Record<string, Theme> = {
  pawPatrol: PAW_PATROL_THEME,
  rainbow: RAINBOW_THEME,
  ocean: OCEAN_THEME,
  forest: FOREST_THEME,
  classic: CLASSIC_THEME,
};

export const DEFAULT_THEME = 'classic';

export type ThemeName = keyof typeof THEMES;