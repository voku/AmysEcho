import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (p: any) => React.createElement('View', p, p.children),
    Text: (p: any) => React.createElement('Text', p, p.children),
    Pressable: (p: any) => React.createElement('Pressable', p, p.children),
    StyleSheet: {
      create: (s: any) => s,
      flatten: (style: any) => style,
    },
    Alert: { alert: jest.fn() },
    Switch: (p: any) => React.createElement('Switch', p),
    FlatList: ({ data, renderItem, ListEmptyComponent, keyExtractor }: any) =>
      React.createElement(
        'FlatList',
        null,
        data && data.length
          ? data.map((item: any, index: number) => {
              const element = renderItem({ item, index });
              const key = keyExtractor ? keyExtractor(item) : index;
              return React.cloneElement(element, { key });
            })
          : ListEmptyComponent || null,
      ),
  } as any;
});

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false, update: jest.fn() }),
}));

jest.mock('../../src/context/ThemeContext', () => ({
  useTheme: () => ({
    theme: { colors: { gradientStart: '#000000', gradientEnd: '#111111' } },
    themeName: 'default',
    setTheme: jest.fn(),
    availableThemes: {},
  }),
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
    let comp!: renderer.ReactTestRenderer;
    await act(async () => {
      comp = renderer.create(<ProfileManagerScreen navigation={{ navigate: jest.fn() }} />);
      await Promise.resolve();
    });
    const texts = comp.root.findAll((n) => n.type === 'Text').map((n) => n.props.children);
    expect(texts).toContain('Vertrauenswürdiges Gerät');
    expect(texts).toContain('Mobbing-Schutz');
    expect(texts).toContain('Gestengrößen-Toleranz');

    const pressables = comp.root.findAll((n) => n.type === 'Pressable');
    expect(pressables.length).toBeGreaterThan(0);
    const labels = pressables.map((p) => p.props.accessibilityLabel).filter(Boolean);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Gerät als vertrauenswürdig einrichten',
        expect.stringContaining('Mobbing-Schutz'),
      ]),
    );
    pressables.forEach((p) => expect(p.props.accessibilityRole).toBe('button'));
  });
});
