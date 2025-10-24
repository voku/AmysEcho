import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Pressable } from 'react-native';
import type { ComponentProps } from 'react';
import type { GestureResponderEvent } from 'react-native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../src/navigation/types';

type NavigationSubset = StackNavigationProp<RootStackParamList, 'ProfileSelect'>;

const createNavigationStub = (): NavigationSubset =>
  ({
    navigate: jest.fn(),
    dispatch: jest.fn(),
    getState: jest.fn(() => ({
      type: 'stack',
      stale: false,
      key: 'stack-profile-select',
      index: 2,
      routeNames: ['Hero', 'App', 'ProfileSelect'],
      routes: [
        { key: 'Hero-1', name: 'Hero' },
        { key: 'App-1', name: 'App' },
        { key: 'ProfileSelect-1', name: 'ProfileSelect' },
      ],
      history: [],
    })),
  } as unknown as NavigationSubset);

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

jest.mock('../../src/services/feedbackService', () => ({
  childHaptic: jest.fn(),
}));

jest.mock('../../src/storage', () => ({
  __esModule: true,
  loadProfile: () => Promise.resolve({ id: 'profile-1', name: 'Amy' }),
}));

import ProfileSelectScreen from '../../src/screens/ProfileSelectScreen';

describe('ProfileSelectScreen interactions', () => {
  it('opens the parent flow through the parental gate', async () => {
    const navigation = createNavigationStub();
    let component!: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderer.create(<ProfileSelectScreen navigation={navigation} />);
      await Promise.resolve();
    });

    act(() => {
      const button = component.root.findByProps({ accessibilityLabel: 'Elternbereich öffnen' });
      (button.props as ComponentProps<typeof Pressable>).onPress?.({} as GestureResponderEvent);
    });

    expect(navigation.navigate).toHaveBeenCalledWith(
      'ParentalGate',
      { target: 'Parent' },
      { pop: true },
    );
  });

  it('opens the admin flow through the parental gate', async () => {
    const navigation = createNavigationStub();
    let component!: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderer.create(<ProfileSelectScreen navigation={navigation} />);
      await Promise.resolve();
    });

    act(() => {
      const button = component.root.findByProps({ accessibilityLabel: 'Adminbereich öffnen' });
      (button.props as ComponentProps<typeof Pressable>).onPress?.({} as GestureResponderEvent);
    });

    expect(navigation.navigate).toHaveBeenCalledWith(
      'ParentalGate',
      { target: 'Admin' },
      { pop: true },
    );
  });
});
