import React, { createContext, useContext } from 'react';

export interface AccessibilitySettings {
  largeText: boolean;
  highContrast: boolean;
}

export const AccessibilityContext = createContext<AccessibilitySettings>({
  largeText: false,
  highContrast: false,
});

export function useAccessibility(): AccessibilitySettings {
  return useContext(AccessibilityContext);
}
