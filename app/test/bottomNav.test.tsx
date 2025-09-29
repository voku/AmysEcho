import React from 'react';
import renderer, { act } from 'react-test-renderer';

let mockHighContrast = false;

const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
  canGoBack: jest.fn(() => true),
  goBack: jest.fn(),
};
let mockRouteName = 'Recognition';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
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

jest.mock('../src/context/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        primary: '#007AFF',
        secondary: '#5856D6',
        background: '#FFFFFF',
        surface: '#F2F2F7',
        text: '#000000',
        textSecondary: '#8E8E93',
        border: '#C6C6C8',
        error: '#FF3B30',
        success: '#34C759',
        warning: '#FF9500',
      },
      isDark: false,
    },
  }),
}));

import BottomNav from '../src/components/BottomNav';
import { COLORS } from '../src/constants/ui';

describe('BottomNav', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockNavigation.goBack.mockClear();
    mockNavigation.canGoBack.mockReturnValue(true);
    mockRouteName = 'Recognition';
    mockHighContrast = false;
  });

  afterEach(() => {
    mockHighContrast = false;
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
    expect(mockNavigate).toHaveBeenCalledWith('Recognition', { profileId: '123' });
  });

  it('exposes accessibility roles, labels, and hints', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<BottomNav active="recognition" profileId="123" />);
    });
    const pressables = (component as renderer.ReactTestRenderer).root.findAllByType('Pressable');
    // Find the main navigation pressables (skip breadcrumb pressables)
    const navPressables = pressables.filter(p =>
      p.props.accessibilityLabel === 'Zurück zur Gestenerkennung' ||
      p.props.accessibilityLabel === 'Zuhören' ||
      p.props.accessibilityLabel === 'Tagesplan' ||
      p.props.accessibilityLabel === 'Lernen' ||
      p.props.accessibilityLabel === 'Menü'
    );
    expect(navPressables).toHaveLength(5); // Home button + 4 nav buttons
    const expected = [
      {
        label: 'Zurück zur Gestenerkennung',
        hint: 'Einfacher Weg zurück zur Hauptseite',
      },
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
    navPressables.forEach((p, idx) => {
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
    mockRouteName = 'Recognition';
  });

  it('navigates to different screens', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<BottomNav active="recognition" profileId="123" />);
    });

    const pressables = (component as renderer.ReactTestRenderer).root.findAllByType('Pressable');
    // Find the main navigation pressables (skip breadcrumb pressables)
    const navPressables = pressables.filter(p =>
      p.props.accessibilityLabel === 'Zurück zur Gestenerkennung' ||
      p.props.accessibilityLabel === 'Zuhören' ||
      p.props.accessibilityLabel === 'Tagesplan' ||
      p.props.accessibilityLabel === 'Lernen' ||
      p.props.accessibilityLabel === 'Menü'
    );

    // Test Schedule navigation (index 2 in filtered array)
    act(() => {
      navPressables[2].props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('Schedule');

    // Test Training navigation (index 3 in filtered array)
    act(() => {
      navPressables[3].props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('Training', { gestureLabel: undefined });

    // Test ProfileSelect navigation (index 4 in filtered array)
    act(() => {
      navPressables[4].props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('ProfileSelect');
  });
});
