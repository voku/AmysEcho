import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';

import ScreenBackground from '../../src/components/ScreenBackground';
import { COLORS } from '../../src/constants/ui';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockLinearGradient = jest.fn(({ children }: { children: React.ReactNode }) => <>{children}</>);

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: (props: any) => mockLinearGradient(props),
}));

const mockUseAccessibility = jest.fn();

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => mockUseAccessibility(),
}));

const mockUseTheme = jest.fn();

jest.mock('../../src/context/ThemeContext', () => ({
  useTheme: () => mockUseTheme(),
}));

describe('ScreenBackground', () => {
  beforeEach(() => {
    mockLinearGradient.mockClear();
    mockUseAccessibility.mockReset();
    mockUseTheme.mockReset();
  });

  const baseTheme = {
    theme: {
      colors: {
        gradientStart: '#123456',
        gradientEnd: '#654321',
        background: '#abcdef',
      },
    },
  };

  it('uses the themed gradient colors in normal contrast mode', () => {
    mockUseAccessibility.mockReturnValue({ highContrast: false });
    mockUseTheme.mockReturnValue(baseTheme);

    act(() => {
      renderer.create(
        <ScreenBackground>
          <></>
        </ScreenBackground>,
      );
    });

    expect(mockLinearGradient).toHaveBeenCalled();
    const gradientProps = mockLinearGradient.mock.calls[0]?.[0];
    expect(gradientProps?.colors).toEqual([
      baseTheme.theme.colors.gradientStart,
      baseTheme.theme.colors.gradientEnd,
    ]);

    const flattenedStyle = StyleSheet.flatten(gradientProps?.style);
    expect(flattenedStyle?.backgroundColor).toBe(baseTheme.theme.colors.background);
  });

  it('falls back to the high-contrast palette when accessibility mode is enabled', () => {
    mockUseAccessibility.mockReturnValue({ highContrast: true });
    mockUseTheme.mockReturnValue(baseTheme);

    act(() => {
      renderer.create(
        <ScreenBackground>
          <></>
        </ScreenBackground>,
      );
    });

    expect(mockLinearGradient).toHaveBeenCalled();
    const gradientProps = mockLinearGradient.mock.calls[0]?.[0];
    expect(gradientProps?.colors).toEqual([
      COLORS.highContrastBackground,
      COLORS.highContrastBackground,
    ]);

    const flattenedStyle = StyleSheet.flatten(gradientProps?.style);
    expect(flattenedStyle?.backgroundColor).toBe(baseTheme.theme.colors.background);
  });
});
