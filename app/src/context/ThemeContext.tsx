import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Theme, THEMES, DEFAULT_THEME, ThemeName } from '../constants/themes';

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
  const defaultTheme = THEMES[DEFAULT_THEME] ?? Object.values(THEMES)[0];
  if (!defaultTheme) {
    throw new Error('Kein Standard-Theme verfügbar');
  }
  const [theme, setTheme] = useState<Theme>(defaultTheme);

  useEffect(() => {
    loadThemeFromStorage();
  }, []);

  useEffect(() => {
    const selectedTheme = THEMES[themeName];
    if (selectedTheme) {
      setTheme(selectedTheme);
    }
  }, [themeName]);

  const loadThemeFromStorage = async () => {
    try {
      const storedTheme = await AsyncStorage.getItem('selectedTheme');
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
      await AsyncStorage.setItem('selectedTheme', newThemeName);
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