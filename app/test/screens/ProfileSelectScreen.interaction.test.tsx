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
  loadProfile: () => Promise.resolve({ id: 'profile-1', name: 'Amy' }),
}));

import ProfileSelectScreen from '../../src/screens/ProfileSelectScreen';

describe('ProfileSelectScreen interactions', () => {
  it('opens the parent flow through the parental gate', async () => {
    const navigate = jest.fn();
    let component!: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderer.create(<ProfileSelectScreen navigation={{ navigate }} />);
      await Promise.resolve();
    });

    act(() => {
      component.root.findByProps({ accessibilityLabel: 'Elternprofil' }).props.onPress();
    });

    expect(navigate).toHaveBeenCalledWith('ParentalGate', { target: 'Parent' });
  });

  it('opens the admin flow through the parental gate', async () => {
    const navigate = jest.fn();
    let component!: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderer.create(<ProfileSelectScreen navigation={{ navigate }} />);
      await Promise.resolve();
    });

    act(() => {
      component.root.findByProps({ accessibilityLabel: 'Adminbereich' }).props.onPress();
    });

    expect(navigate).toHaveBeenCalledWith('ParentalGate', { target: 'Admin' });
  });
});
