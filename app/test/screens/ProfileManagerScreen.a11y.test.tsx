import React from 'react';
import renderer, { act } from 'react-test-renderer';

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
    let comp!: renderer.ReactTestRenderer;
    await act(async () => {
      comp = renderer.create(<ProfileManagerScreen navigation={{ navigate: jest.fn() }} />);
      await Promise.resolve();
    });
    const texts = comp.root.findAll((n) => n.type === 'Text').map((n) => n.props.children);
    expect(texts).toContain('Vertrauenswürdiges Gerät');
    expect(texts).toContain('Gestengrößen-Toleranz');

    const pressables = comp.root.findAll((n) => n.type === 'Pressable');
    expect(pressables.length).toBeGreaterThan(0);
    const labels = pressables.map((p) => p.props.accessibilityLabel).filter(Boolean);
    expect(labels).toEqual(
      expect.arrayContaining(['Gerät als vertrauenswürdig einrichten']),
    );
    pressables.forEach((p) => expect(p.props.accessibilityRole).toBe('button'));
  });
});
