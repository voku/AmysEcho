import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (props: any) => React.createElement('View', props, props.children),
    Pressable: (props: any) => React.createElement('Pressable', props, props.children),
    Text: (props: any) => React.createElement('Text', props, props.children),
    StyleSheet: { create: (styles: any) => styles },
  };
});

const navigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate }),
}));

jest.mock('lucide-react-native', () => {
  const React = require('react');
  return {
    Hand: (props: any) => React.createElement('Hand', props, props.children),
    BookOpen: (props: any) => React.createElement('BookOpen', props, props.children),
    Settings: (props: any) => React.createElement('Settings', props, props.children),
  };
});

jest.mock('../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ highContrast: false }),
}));

jest.mock('../src/services/feedbackService', () => ({
  childHaptic: jest.fn(),
}));

import BottomNav from '../src/components/BottomNav';
import { COLORS } from '../src/constants/ui';

describe('BottomNav', () => {
  it('uses large touch targets with haptic feedback', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<BottomNav active="recognition" profileId="123" />);
    });
    const pressable = (component as renderer.ReactTestRenderer).root.findAllByType('Pressable')[0];
    const styleFn = pressable.props.style as (args: { pressed: boolean }) => any;
    const pressedStyle = styleFn({ pressed: true });
    expect(pressedStyle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ minWidth: 60, minHeight: 60 }),
        expect.objectContaining({ backgroundColor: COLORS.pressed }),
      ]),
    );
    const { childHaptic } = require('../src/services/feedbackService');
    act(() => {
      pressable.props.onPress();
    });
    expect(childHaptic).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('Recognition', { profileId: '123' });
  });

  it('exposes accessibility roles, labels, and hints', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<BottomNav active="recognition" profileId="123" />);
    });
    const pressables = (component as renderer.ReactTestRenderer).root.findAllByType('Pressable');
    expect(pressables).toHaveLength(3);
    const expected = [
      {
        label: 'Zuhören',
        hint: 'Gestenerkennung starten',
      },
      {
        label: 'Lernen',
        hint: 'Gesten aufnehmen oder üben',
      },
      {
        label: 'Menü',
        hint: 'Profil- und Einstellungsmenü öffnen',
      },
    ];
    pressables.forEach((p, idx) => {
      expect(p.props.accessibilityRole).toBe('button');
      expect(p.props.accessibilityLabel).toBe(expected[idx].label);
      expect(p.props.accessibilityHint).toBe(expected[idx].hint);
    });
  });
});
