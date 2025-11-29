/**
 * Theme Context for Web
 * Provides theme switching and persistence.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface Theme {
  name: string;
  colors: {
    primary: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    accent: string;
    success: string;
    warning: string;
    error: string;
    border: string;
  };
  isDark: boolean;
}

export type ThemeName = 'light' | 'dark' | 'highContrast' | 'amyFirst';

export const THEMES: Record<ThemeName, Theme> = {
  light: {
    name: 'Hell',
    isDark: false,
    colors: {
      primary: '#4F8EF7',
      background: '#FFFFFF',
      surface: '#F5F5F5',
      text: '#1A1A1A',
      textSecondary: '#666666',
      accent: '#7C3AED',
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      border: '#E5E5E5',
    },
  },
  dark: {
    name: 'Dunkel',
    isDark: true,
    colors: {
      primary: '#6BA3FF',
      background: '#1A1A1A',
      surface: '#2D2D2D',
      text: '#FFFFFF',
      textSecondary: '#A0A0A0',
      accent: '#A78BFA',
      success: '#34D399',
      warning: '#FBBF24',
      error: '#F87171',
      border: '#404040',
    },
  },
  highContrast: {
    name: 'Hoher Kontrast',
    isDark: true,
    colors: {
      primary: '#FFFF00',
      background: '#000000',
      surface: '#1A1A1A',
      text: '#FFFFFF',
      textSecondary: '#FFFF00',
      accent: '#00FFFF',
      success: '#00FF00',
      warning: '#FFFF00',
      error: '#FF0000',
      border: '#FFFFFF',
    },
  },
  amyFirst: {
    name: 'Amy First',
    isDark: false,
    colors: {
      primary: '#4ECDC4',
      background: '#FFF9E6',
      surface: '#FFFFFF',
      text: '#2D3436',
      textSecondary: '#636E72',
      accent: '#FF6B6B',
      success: '#26DE81',
      warning: '#FFA502',
      error: '#EB4D4B',
      border: '#DFE6E9',
    },
  },
};

export const DEFAULT_THEME: ThemeName = 'amyFirst';

interface ThemeContextType {
  theme: Theme;
  themeName: ThemeName;
  setTheme: (themeName: ThemeName) => Promise<void>;
  availableThemes: Record<string, Theme>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [themeName, setThemeName] = useState<ThemeName>(DEFAULT_THEME);
  const defaultTheme = THEMES[DEFAULT_THEME];
  const [theme, setTheme] = useState<Theme>(defaultTheme);

  useEffect(() => {
    loadThemeFromStorage();
  }, []);

  useEffect(() => {
    const selectedTheme = THEMES[themeName];
    if (selectedTheme) {
      setTheme(selectedTheme);
      // Apply theme to document
      document.documentElement.setAttribute('data-theme', themeName);
      // Apply CSS variables
      const root = document.documentElement;
      Object.entries(selectedTheme.colors).forEach(([key, value]) => {
        root.style.setProperty(`--color-${key}`, value);
      });
    }
  }, [themeName]);

  const loadThemeFromStorage = () => {
    try {
      const storedTheme = localStorage.getItem('selectedTheme');
      if (storedTheme && storedTheme in THEMES) {
        setThemeName(storedTheme as ThemeName);
      }
    } catch (error) {
      console.warn('Failed to load theme from storage:', error);
    }
  };

  const setThemeAsync = async (newThemeName: ThemeName) => {
    try {
      setThemeName(newThemeName);
      localStorage.setItem('selectedTheme', newThemeName);
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  };

  const value: ThemeContextType = {
    theme,
    themeName,
    setTheme: setThemeAsync,
    availableThemes: THEMES,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
