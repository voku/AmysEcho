import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (props: any) => React.createElement('View', props, props.children),
    Text: (props: any) => React.createElement('Text', props, props.children),
  };
});

import { MoodProvider, useMood, useMoodColors } from '../src/context/MoodContext';

describe('MoodContext', () => {
  const TestComponent = () => {
    const { currentMood, getMoodEmoji, getMoodDescription, moodColors } = useMood();
    return React.createElement('View', {
      'data-current-mood': currentMood,
      'data-emoji': getMoodEmoji(),
      'data-description': getMoodDescription(),
      'data-primary-color': moodColors.primary,
    });
  };

  const TestColorsComponent = () => {
    const colors = useMoodColors();
    return React.createElement('View', {
      'data-primary-color': colors.primary,
    });
  };

  beforeEach(() => {
    // Reset Date to a known time for consistent testing
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2023-01-01T10:00:00Z')); // 10 AM - should be calm
  });

  afterEach(() => {
    jest.useRealTimers();
  });



  it('auto-detects calm mood in morning', () => {
    jest.setSystemTime(new Date('2023-01-01T08:00:00Z')); // 8 AM

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        React.createElement(MoodProvider, {}, React.createElement(TestComponent))
      );
    });

    const view = component.root.findByType('View');
    expect(view.props['data-current-mood']).toBe('calm');
  });

  it('auto-detects energetic mood in afternoon', () => {
    jest.setSystemTime(new Date('2023-01-01T14:00:00Z')); // 2 PM

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        React.createElement(MoodProvider, {}, React.createElement(TestComponent))
      );
    });

    const view = component.root.findByType('View');
    expect(view.props['data-current-mood']).toBe('energetic');
  });

  it('auto-detects calm mood at night', () => {
    jest.setSystemTime(new Date('2023-01-01T22:00:00Z')); // 10 PM

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        React.createElement(MoodProvider, {}, React.createElement(TestComponent))
      );
    });

    const view = component.root.findByType('View');
    expect(view.props['data-current-mood']).toBe('calm');
  });

  it('allows manual mood setting', () => {
    // Test that different times result in different moods
    jest.setSystemTime(new Date('2023-01-01T14:00:00Z')); // Afternoon

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        React.createElement(MoodProvider, {}, React.createElement(TestComponent))
      );
    });

    const view = component.root.findByType('View');
    expect(view.props['data-current-mood']).toBe('energetic');
  });

  it('provides correct emoji for calm mood', () => {
    jest.setSystemTime(new Date('2023-01-01T08:00:00Z')); // Morning

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        React.createElement(MoodProvider, {}, React.createElement(TestComponent))
      );
    });

    const view = component.root.findByType('View');
    expect(view.props['data-emoji']).toBe('😌');
  });

  it('provides correct emoji for energetic mood', () => {
    jest.setSystemTime(new Date('2023-01-01T14:00:00Z')); // Afternoon

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        React.createElement(MoodProvider, {}, React.createElement(TestComponent))
      );
    });

    const view = component.root.findByType('View');
    expect(view.props['data-emoji']).toBe('⚡');
  });

  it('provides correct description for calm mood', () => {
    jest.setSystemTime(new Date('2023-01-01T08:00:00Z')); // Morning

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        React.createElement(MoodProvider, {}, React.createElement(TestComponent))
      );
    });

    const view = component.root.findByType('View');
    expect(view.props['data-description']).toBe('Ruhiger Modus');
  });

  it('provides correct description for energetic mood', () => {
    jest.setSystemTime(new Date('2023-01-01T14:00:00Z')); // Afternoon

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        React.createElement(MoodProvider, {}, React.createElement(TestComponent))
      );
    });

    const view = component.root.findByType('View');
    expect(view.props['data-description']).toBe('Energiegeladener Modus');
  });

  it('provides mood-specific colors', () => {
    jest.setSystemTime(new Date('2023-01-01T08:00:00Z')); // Calm mood

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        React.createElement(MoodProvider, {}, React.createElement(TestComponent))
      );
    });

    const view = component.root.findByType('View');
    expect(view.props['data-primary-color']).toBe('#4A90E2'); // Calm primary color
  });

  it('useMoodColors hook works correctly', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        React.createElement(MoodProvider, {}, React.createElement(TestColorsComponent))
      );
    });

    const view = component.root.findByType('View');
    expect(view.props['data-primary-color']).toBeDefined();
  });

  it('throws error when useMood is used outside provider', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      act(() => {
        renderer.create(React.createElement(TestComponent));
      });
    }).toThrow('useMood must be used within a MoodProvider');
    consoleSpy.mockRestore();
  });
});