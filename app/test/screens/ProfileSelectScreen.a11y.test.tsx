import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (p: any) => React.createElement('View', p, p.children),
    Text: (p: any) => React.createElement('Text', p, p.children),
    Pressable: (p: any) => React.createElement('Pressable', p, p.children),
    StyleSheet: { create: (s: any) => s },
  } as any;
});

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

jest.mock('../../src/services/feedbackService', () => ({
  childHaptic: jest.fn(),
}));

jest.mock('../../src/storage', () => ({
  __esModule: true,
  loadProfile: () => Promise.resolve({ id: 'p1', name: 'Amy' }),
}));

import ProfileSelectScreen from '../../src/screens/ProfileSelectScreen';

describe('ProfileSelectScreen accessibility', () => {
  it('renders German title and accessible actions', async () => {
    let comp!: renderer.ReactTestRenderer;
    await act(async () => {
      comp = renderer.create(<ProfileSelectScreen navigation={{ navigate: jest.fn() }} />);
      await Promise.resolve();
    });
    const textNodes = comp.root.findAll((n) => n.type === 'Text');
    const labels = textNodes.map((n) => n.props.children);
    expect(labels).toContain('Was möchtest du tun?');
    expect(labels).toContain('Zuhören');
    expect(labels).toContain('Lernen');
    expect(labels).toContain('Eltern');
    expect(labels).toContain('Admin');
    expect(labels).toContain('Profile verwalten');

    const pressables = comp.root.findAll((n) => n.type === 'Pressable');
    const a11yLabels = pressables.map((p) => p.props.accessibilityLabel);
    expect(a11yLabels).toEqual(
      expect.arrayContaining([
        'Zum Erkennungsmodus',
        'Zum Lernmodus',
        'Elternprofil',
        'Adminbereich',
        'Profile verwalten',
      ]),
    );
  });
});
