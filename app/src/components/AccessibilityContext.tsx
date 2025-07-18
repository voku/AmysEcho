import React, { createContext, useContext } from 'react';

export interface AccessibilitySettings {
  largeText: boolean;
  highContrast: boolean;
}

export interface AccessibilityContextType extends AccessibilitySettings {
  update: (settings: Partial<AccessibilitySettings>) => void;
}

export const AccessibilityContext = createContext<AccessibilityContextType>({
  largeText: false,
  highContrast: false,
  update: () => {},
});

export function useAccessibility(): AccessibilityContextType {
  return useContext(AccessibilityContext);
}
