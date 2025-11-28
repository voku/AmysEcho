import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { AccessibilityContext } from '../../src/components/AccessibilityContext';
import { MessageProvider } from '../../src/context/MessageContext';

export function withProviders(children: React.ReactElement) {
  const a11y = { largeText: false, highContrast: false, update: () => {} } as any;
  // Use real provider since the hook enforces provider usage
  return (
    <NavigationContainer>
      <ThemeProvider>
        <AccessibilityContext.Provider value={a11y}>
          <MessageProvider>
            {children}
          </MessageProvider>
        </AccessibilityContext.Provider>
      </ThemeProvider>
    </NavigationContainer>
  );
}
