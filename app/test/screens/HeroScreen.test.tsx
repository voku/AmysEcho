import React from 'react';
import renderer, { act } from 'react-test-renderer';

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
import HeroScreen from '../../src/screens/HeroScreen';

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
});
