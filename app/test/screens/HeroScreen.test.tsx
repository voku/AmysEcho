import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import Colors from '../../src/constants/colors';

jest.mock('../../src/components/ScreenBackground', () => {
  return {
    __esModule: true,
    default: jest.fn(({ children }: { children: React.ReactNode }) => <>{children}</>),
  };
});

jest.mock('../../src/components/WorkflowSupportLinks', () => () => null);

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({
    largeText: false,
    highContrast: false,
  }),
}));

import ScreenBackground from '../../src/components/ScreenBackground';
import HeroScreen, { heroStyles } from '../../src/screens/HeroScreen';

describe('HeroScreen', () => {
  it('enables scrolling so primary actions remain reachable on small displays', () => {
    const ScreenBackgroundMock = ScreenBackground as jest.Mock;
    const navigation = {
      replace: jest.fn(),
      navigate: jest.fn(),
    } as any;

    act(() => {
      renderer.create(<HeroScreen navigation={navigation} />);
    });

    expect(ScreenBackgroundMock).toHaveBeenCalled();
    const props = ScreenBackgroundMock.mock.calls[0]?.[0];
    expect(props).toMatchObject({ scrollable: true, testID: 'hero-screen' });
  });

  it('uses high-contrast colors for hero copy on the gradient background', () => {
    const titleStyle = StyleSheet.flatten(heroStyles.title);
    const subtitleStyle = StyleSheet.flatten(heroStyles.subtitle);

    expect(titleStyle?.color).toBe(Colors.surface);
    expect(subtitleStyle?.color).toBe(Colors.inverseText);
  });
});
