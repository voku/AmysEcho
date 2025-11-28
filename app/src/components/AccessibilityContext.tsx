import { createContext, useContext } from 'react';

export interface AccessibilitySettings {
  largeText: boolean;
  highContrast: boolean;
}

export interface AccessibilityContextType extends AccessibilitySettings {
  update: (settings: Partial<AccessibilitySettings>) => void;
}

const defaultAccessibility: AccessibilityContextType = {
  largeText: false,
  highContrast: false,
  update: () => {},
};

export const AccessibilityContext = createContext<AccessibilityContextType>(defaultAccessibility);

export function useAccessibility(): AccessibilityContextType {
  return useContext(AccessibilityContext);
}
