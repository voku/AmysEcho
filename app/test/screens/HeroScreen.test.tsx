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

  it('renders hero copy with light tokens for gradient legibility', () => {
    const navigation = {
      replace: jest.fn(),
      navigate: jest.fn(),
    } as any;

    act(() => {
      renderer.create(<HeroScreen navigation={navigation} />);
    });

    const ScreenBackgroundMock = ScreenBackground as jest.Mock;
    const mockChildren = ScreenBackgroundMock.mock.calls[0]?.[0]?.children;
    expect(mockChildren).toBeDefined();

    const header = mockChildren?.props?.children?.[0];
    const headerChildren = Array.isArray(header?.props?.children)
      ? header?.props?.children
      : header?.props?.children
        ? [header?.props?.children]
        : [];

    const title = headerChildren?.find((child: any) => child?.props?.testID === 'hero-title');
    const subtitle = headerChildren?.find((child: any) => child?.props?.testID === 'hero-subtitle');

    expect(title).toBeDefined();
    expect(subtitle).toBeDefined();

    const titleStyle = StyleSheet.flatten(title!.props.style);
    const subtitleStyle = StyleSheet.flatten(subtitle!.props.style);

    // The hero copy sits directly on the gradient background, so enforce the
    // light accessibility tokens that keep the text legible.
    expect(titleStyle?.color).toBe(Colors.inverseText);
    expect(subtitleStyle?.color).toBe(Colors.inverseText);

  });
});
