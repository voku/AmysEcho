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

let mockRouteName = 'Recognition';
let mockHighContrast = false;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate }),
  useRoute: () => ({ name: mockRouteName }),
}));


jest.mock('react-native-svg', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: (props: any) => React.createElement('Svg', props, props.children),
    Path: (props: any) => React.createElement('Path', props, props.children),
    Circle: (props: any) => React.createElement('Circle', props, props.children),
    Rect: (props: any) => React.createElement('Rect', props, props.children),
  };
});

jest.mock('../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ highContrast: mockHighContrast }),
}));

jest.mock('../src/services/feedbackService', () => ({
  childHaptic: jest.fn(),
}));

import BottomNav from '../src/components/BottomNav';
import { COLORS } from '../src/constants/ui';

describe('BottomNav', () => {
  beforeEach(() => {
    navigate.mockClear();
  });

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
    expect(pressables).toHaveLength(4);
    const expected = [
      {
        label: 'Zuhören',
        hint: 'Zurück zur Gestenerkennung',
      },
      {
        label: 'Tagesplan',
        hint: 'Tagesplan mit Übungen anzeigen',
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

  it('handles different active states', () => {
    const activeStates: Array<'recognition' | 'training' | 'parent' | 'schedule'> = ['recognition', 'training', 'parent', 'schedule'];

    activeStates.forEach(active => {
      let component: renderer.ReactTestRenderer;
      act(() => {
        component = renderer.create(<BottomNav active={active} profileId="123" />);
      });
      expect(component).toBeTruthy();
    });
  });

  it('handles high contrast mode', () => {
    mockHighContrast = true;

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
        expect.objectContaining({ backgroundColor: COLORS.highContrastPressed }),
      ]),
    );

    mockHighContrast = false; // Reset
  });

  it('handles unknown route names', () => {
    mockRouteName = 'UnknownScreen';

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<BottomNav active="recognition" profileId="123" />);
    });

    const texts = (component as renderer.ReactTestRenderer).root.findAllByType('Text');
    const breadcrumbText = texts.find(text => text.props.children === 'UnknownScreen');
    expect(breadcrumbText).toBeTruthy();

    mockRouteName = 'Recognition'; // Reset
  });

  it('navigates to different screens', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<BottomNav active="recognition" profileId="123" />);
    });

    const pressables = (component as renderer.ReactTestRenderer).root.findAllByType('Pressable');

    // Test Schedule navigation
    act(() => {
      pressables[1].props.onPress();
    });
    expect(navigate).toHaveBeenCalledWith('Schedule');

    // Test Training navigation
    act(() => {
      pressables[2].props.onPress();
    });
    expect(navigate).toHaveBeenCalledWith('Training', { gestureLabel: undefined });

    // Test ProfileSelect navigation
    act(() => {
      pressables[3].props.onPress();
    });
    expect(navigate).toHaveBeenCalledWith('ProfileSelect');
  });
});
