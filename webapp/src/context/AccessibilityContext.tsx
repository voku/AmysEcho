/**
 * Accessibility Context for Web
 * Provides accessibility settings and preferences.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

interface AccessibilitySettings {
  largeText: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  screenReaderEnabled: boolean;
}

interface AccessibilityContextType extends AccessibilitySettings {
  setLargeText: (value: boolean) => void;
  setHighContrast: (value: boolean) => void;
  setReducedMotion: (value: boolean) => void;
}

const STORAGE_KEY = 'amy_accessibility_settings';

const defaultSettings: AccessibilitySettings = {
  largeText: false,
  highContrast: false,
  reducedMotion: false,
  screenReaderEnabled: false,
};

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

interface AccessibilityProviderProps {
  children: ReactNode;
}

export function AccessibilityProvider({ children }: AccessibilityProviderProps) {
  const [settings, setSettings] = useState<AccessibilitySettings>(defaultSettings);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings((prev) => ({ ...prev, ...parsed }));
      }
    } catch (error) {
      console.warn('Failed to load accessibility settings:', error);
    }

    // Detect system preferences
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const prefersHighContrast = window.matchMedia('(forced-colors: active)').matches;
    
    setSettings((prev) => ({
      ...prev,
      reducedMotion: prev.reducedMotion || prefersReducedMotion,
      highContrast: prev.highContrast || prefersHighContrast,
    }));
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        largeText: settings.largeText,
        highContrast: settings.highContrast,
        reducedMotion: settings.reducedMotion,
      }));
    } catch (error) {
      console.warn('Failed to save accessibility settings:', error);
    }

    // Apply settings to document
    document.documentElement.classList.toggle('large-text', settings.largeText);
    document.documentElement.classList.toggle('high-contrast', settings.highContrast);
    document.documentElement.classList.toggle('reduced-motion', settings.reducedMotion);
  }, [settings]);

  const setLargeText = useCallback((value: boolean) => {
    setSettings((prev) => ({ ...prev, largeText: value }));
  }, []);

  const setHighContrast = useCallback((value: boolean) => {
    setSettings((prev) => ({ ...prev, highContrast: value }));
  }, []);

  const setReducedMotion = useCallback((value: boolean) => {
    setSettings((prev) => ({ ...prev, reducedMotion: value }));
  }, []);

  const value: AccessibilityContextType = {
    ...settings,
    setLargeText,
    setHighContrast,
    setReducedMotion,
  };

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility(): AccessibilityContextType {
  const context = useContext(AccessibilityContext);
  if (context === undefined) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return context;
}
