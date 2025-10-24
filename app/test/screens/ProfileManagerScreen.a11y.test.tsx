import React from 'react';
import renderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { Pressable, Text } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../src/navigation/types';
import type { ComponentProps } from 'react';

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false, update: jest.fn() }),
}));

jest.mock('../../src/services/feedbackService', () => ({
  childHaptic: jest.fn(),
}));

jest.mock('../../src/components/SoundSelector', () => () => null);
jest.mock('../../src/components/ThemeSelector', () => () => null);
jest.mock('react-native-svg', () => {
  const React = require('react');
  return {
    default: (p: any) => React.createElement('Svg', p, p.children),
    Path: (p: any) => React.createElement('Path', p),
    Circle: (p: any) => React.createElement('Circle', p),
    Rect: (p: any) => React.createElement('Rect', p),
  };
});

jest.mock('../../src/storage', () => ({
  loadProfiles: jest.fn(async () => [{ id: 'p1', name: 'Amy' }]),
  setActiveProfileId: jest.fn(async () => {}),
  loadProfile: jest.fn(async () => ({ id: 'p1', name: 'Amy' })),
}));

jest.mock('../../db', () => ({
  database: {
    write: async (fn: any) => fn(),
    get: () => ({ find: async () => ({ update: async () => {} }) }),
  },
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (_cb: any) => {
    // No-op in unit test to avoid executing internal effects during render
    return () => {};
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

import ProfileManagerScreen from '../../src/screens/ProfileManagerScreen';

describe('ProfileManagerScreen accessibility', () => {
  it('renders key German labels and accessible buttons', async () => {
    type NavigationSubset = StackNavigationProp<RootStackParamList, 'ProfileManager'>;
    const navigation = ({
      navigate: jest.fn(),
      dispatch: jest.fn(),
      getState: jest.fn(() => ({
        type: 'stack',
        stale: false,
        key: 'stack-profile-manager',
        index: 2,
        routeNames: ['Hero', 'App', 'ProfileManager'],
        routes: [
          { key: 'Hero-1', name: 'Hero' },
          { key: 'App-1', name: 'App' },
          { key: 'ProfileManager-1', name: 'ProfileManager' },
        ],
        history: [],
      })),
    } as unknown) as NavigationSubset;

    let comp!: renderer.ReactTestRenderer;
    await act(async () => {
      comp = renderer.create(<ProfileManagerScreen navigation={navigation} />);
      await Promise.resolve();
    });
    const getPressableProps = (instance: renderer.ReactTestInstance) =>
      instance.props as ComponentProps<typeof Pressable>;

    const initialPressables = comp.root.findAllByType(Pressable);
    const toggleButtons = initialPressables.filter((instance: ReactTestInstance) => {
      const props = getPressableProps(instance);
      return (
        typeof props.accessibilityLabel === 'string' &&
        props.accessibilityLabel.includes('Fortgeschrittene Betreuungstools')
      );
    });

    expect(toggleButtons.length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      toggleButtons.forEach((btn: ReactTestInstance) => {
        getPressableProps(btn).onPress?.({} as GestureResponderEvent);
      });
    });

    const pressableInstances = comp.root.findAllByType(Pressable);
    const texts = comp.root
      .findAllByType(Text)
      .map((instance: ReactTestInstance) =>
        React.Children.toArray(
          (instance.props as ComponentProps<typeof Text>).children,
        ).join(''),
      );
    expect(texts).toEqual(expect.arrayContaining(['Vertrauenswürdiges Gerät']));
    expect(texts).toEqual(expect.arrayContaining(['Gestengrößen-Toleranz']));
    expect(texts).toEqual(expect.arrayContaining(['Gestenverlauf & Analyse']));

    expect(pressableInstances.length).toBeGreaterThan(0);
    const labels = pressableInstances
      .map((instance: ReactTestInstance) => getPressableProps(instance).accessibilityLabel)
      .filter(Boolean);
    expect(labels).toEqual(
      expect.arrayContaining(['Gerät als vertrauenswürdig einrichten']),
    );
    pressableInstances.forEach((instance: ReactTestInstance) =>
      expect(getPressableProps(instance).accessibilityRole).toBe('button'),
    );
  });
});
