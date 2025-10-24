import React from 'react';
import renderer, { act } from 'react-test-renderer';
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
    type NavigationSubset = Pick<
      StackNavigationProp<RootStackParamList, 'ProfileManager'>,
      'navigate' | 'popTo'
    >;
    const navigation: NavigationSubset = {
      navigate: jest.fn(),
      popTo: jest.fn(),
    };

    let comp!: renderer.ReactTestRenderer;
    await act(async () => {
      comp = renderer.create(<ProfileManagerScreen navigation={navigation} />);
      await Promise.resolve();
    });
    const getPressableProps = (instance: renderer.ReactTestInstance) =>
      instance.props as ComponentProps<typeof Pressable>;

    const initialPressables = comp.root.findAllByType(Pressable);
    const toggleButtons = initialPressables.filter((instance) => {
      const props = getPressableProps(instance);
      return (
        typeof props.accessibilityLabel === 'string' &&
        props.accessibilityLabel.includes('Fortgeschrittene Betreuungstools')
      );
    });

    expect(toggleButtons.length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      toggleButtons.forEach((btn) => {
        getPressableProps(btn).onPress?.({} as GestureResponderEvent);
      });
    });

    const pressableInstances = comp.root.findAllByType(Pressable);
    const texts = comp.root
      .findAllByType(Text)
      .map((instance) =>
        React.Children.toArray(
          (instance.props as ComponentProps<typeof Text>).children,
        ).join(''),
      );
    expect(texts).toEqual(expect.arrayContaining(['Vertrauenswürdiges Gerät']));
    expect(texts).toEqual(expect.arrayContaining(['Gestengrößen-Toleranz']));
    expect(texts).toEqual(expect.arrayContaining(['Gestenverlauf & Analyse']));

    expect(pressableInstances.length).toBeGreaterThan(0);
    const labels = pressableInstances
      .map((instance) => getPressableProps(instance).accessibilityLabel)
      .filter(Boolean);
    expect(labels).toEqual(
      expect.arrayContaining(['Gerät als vertrauenswürdig einrichten']),
    );
    pressableInstances.forEach((instance) =>
      expect(getPressableProps(instance).accessibilityRole).toBe('button'),
    );
  });
});
