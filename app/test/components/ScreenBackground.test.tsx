import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StyleSheet, StyleProp, ViewStyle } from 'react-native';

import ScreenBackground from '../../src/components/ScreenBackground';
import { AccessibilityContext, AccessibilityContextType } from '../../src/components/AccessibilityContext';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { COLORS } from '../../src/constants/ui';
import { DEFAULT_THEME, THEMES } from '../../src/constants/themes';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../src/context/ThemeContext', () =>
  jest.requireActual('../../src/context/ThemeContext'),
);

interface LinearGradientProps {
  colors: readonly [string, string];
  style?: StyleProp<ViewStyle>;
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  children?: React.ReactNode;
}

const mockLinearGradient = jest.fn((props: LinearGradientProps) => <>{props.children}</>);

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: (props: LinearGradientProps) => mockLinearGradient(props),
}));

describe('ScreenBackground', () => {
  beforeEach(() => {
    mockLinearGradient.mockClear();
  });

  const defaultTheme = THEMES[DEFAULT_THEME];
  if (!defaultTheme) {
    throw new Error('Default theme is not registered for tests');
  }

  const renderScreenBackground = (options?: { highContrast?: boolean }) => {
    const { highContrast = false } = options ?? {};
    const accessibilityValue: AccessibilityContextType = {
      largeText: false,
      highContrast,
      update: jest.fn(),
    };

    let testRenderer: renderer.ReactTestRenderer | undefined;

    act(() => {
      testRenderer = renderer.create(
        <ThemeProvider>
          <AccessibilityContext.Provider value={accessibilityValue}>
            <ScreenBackground>
              <></>
            </ScreenBackground>
          </AccessibilityContext.Provider>
        </ThemeProvider>,
      );
    });

    return testRenderer!;
  };

  it('uses the themed gradient colors in normal contrast mode', () => {
    const rendererInstance = renderScreenBackground();

    expect(mockLinearGradient).toHaveBeenCalled();
    const gradientProps = mockLinearGradient.mock.calls[0]?.[0];
    expect(gradientProps?.colors).toEqual([
      defaultTheme.colors.gradientStart,
      defaultTheme.colors.gradientEnd,
    ]);

    const flattenedStyle = StyleSheet.flatten(gradientProps?.style);
    expect(flattenedStyle?.backgroundColor).toBe(defaultTheme.colors.background);

    act(() => {
      rendererInstance.unmount();
    });
  });

  it('falls back to the high-contrast palette when accessibility mode is enabled', () => {
    const rendererInstance = renderScreenBackground({ highContrast: true });

    expect(mockLinearGradient).toHaveBeenCalled();
    const gradientProps = mockLinearGradient.mock.calls[0]?.[0];
    expect(gradientProps?.colors).toEqual([
      COLORS.highContrastBackground,
      COLORS.highContrastBackground,
    ]);

    const flattenedStyle = StyleSheet.flatten(gradientProps?.style);
    expect(flattenedStyle?.backgroundColor).toBe(defaultTheme.colors.background);

    act(() => {
      rendererInstance.unmount();
    });
  });
});
