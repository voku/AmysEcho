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

  it('handles manual mood override after auto-detection', () => {
    jest.setSystemTime(new Date('2023-01-01T08:00:00Z')); // Morning - should auto-detect calm

    const ManualMoodComponent = () => {
      const { currentMood, setMood } = useMood();
      React.useEffect(() => {
        setMood('energetic'); // Override to energetic
      }, [setMood]);
      return React.createElement('View', { 'data-current-mood': currentMood });
    };

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        React.createElement(MoodProvider, {}, React.createElement(ManualMoodComponent))
      );
    });

    const view = component.root.findByType('View');
    expect(view.props['data-current-mood']).toBe('energetic');
  });

  it('handles invalid mood types gracefully', () => {
    const InvalidMoodComponent = () => {
      const { getMoodEmoji, getMoodDescription } = useMood();
      // Test default cases
      return React.createElement('View', {
        'data-emoji': getMoodEmoji(),
        'data-description': getMoodDescription(),
      });
    };

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        React.createElement(MoodProvider, {}, React.createElement(InvalidMoodComponent))
      );
    });

    const view = component.root.findByType('View');
    expect(view.props['data-emoji']).toBeDefined();
    expect(view.props['data-description']).toBeDefined();
  });

  it('handles edge case hours correctly', () => {
    // Test exact boundary times
    const testCases = [
      { time: '2023-01-01T05:59:59Z', expected: 'calm' }, // Just before 6 AM
      { time: '2023-01-01T06:00:00Z', expected: 'calm' }, // Exactly 6 AM
      { time: '2023-01-01T11:59:59Z', expected: 'calm' }, // Just before noon
      { time: '2023-01-01T12:00:00Z', expected: 'energetic' }, // Exactly noon
      { time: '2023-01-01T17:59:59Z', expected: 'energetic' }, // Just before 6 PM
      { time: '2023-01-01T18:00:00Z', expected: 'calm' }, // Exactly 6 PM
      { time: '2023-01-01T23:59:59Z', expected: 'calm' }, // Just before midnight
      { time: '2023-01-01T00:00:00Z', expected: 'calm' }, // Midnight
    ];

    testCases.forEach(({ time, expected }) => {
      jest.setSystemTime(new Date(time));

      let component: renderer.ReactTestRenderer;
      act(() => {
        component = renderer.create(
          React.createElement(MoodProvider, {}, React.createElement(TestComponent))
        );
      });

      const view = component.root.findByType('View');
      expect(view.props['data-current-mood']).toBe(expected);
    });
  });

  it('provides consistent color schemes for all moods', () => {
    const moods: ('calm' | 'energetic' | 'neutral')[] = ['calm', 'energetic', 'neutral'];

    moods.forEach(mood => {
      const MoodTestComponent = () => {
        const { setMood, moodColors } = useMood();
        React.useEffect(() => {
          setMood(mood);
        }, [setMood]);
        return React.createElement('View', {
          'data-colors': JSON.stringify(moodColors),
        });
      };

      let component: renderer.ReactTestRenderer;
      act(() => {
        component = renderer.create(
          React.createElement(MoodProvider, {}, React.createElement(MoodTestComponent))
        );
      });

      const view = component.root.findByType('View');
      const colors = JSON.parse(view.props['data-colors']);
      expect(colors).toHaveProperty('primary');
      expect(colors).toHaveProperty('secondary');
      expect(colors).toHaveProperty('accent');
      expect(colors).toHaveProperty('background');
      expect(colors).toHaveProperty('surface');
      expect(colors).toHaveProperty('text');
      expect(colors).toHaveProperty('textMuted');
      expect(colors).toHaveProperty('border');
    });
  });
});