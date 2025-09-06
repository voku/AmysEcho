import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (p: any) => React.createElement('View', p, p.children),
    StyleSheet: { create: (s: any) => s },
  } as any;
});

import ScheduleScreen from '../../src/screens/ScheduleScreen';

jest.mock('../../src/components/VisualSchedule', () => {
  return ({ onActivityPress, onScheduleComplete }: any) => {
    return React.createElement('VisualSchedule', {
      onActivityPress,
      onScheduleComplete,
      testID: 'visual-schedule'
    });
  };
});

jest.mock('../../src/components/BottomNav', () => {
  return ({ active, profileId }: any) => {
    return React.createElement('BottomNav', {
      active,
      profileId,
      testID: 'bottom-nav'
    });
  };
});

describe('ScheduleScreen', () => {
  let component: renderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (component) {
      act(() => component!.unmount());
      component = null;
    }
  });

  it('renders VisualSchedule and BottomNav', () => {
    const navigate = jest.fn();
    act(() => {
      component = renderer.create(<ScheduleScreen navigation={{ navigate } as any} />);
    });

    const visualSchedule = component!.root.findByProps({ testID: 'visual-schedule' });
    expect(visualSchedule).toBeTruthy();

    const bottomNav = component!.root.findByProps({ testID: 'bottom-nav' });
    expect(bottomNav.props.active).toBe('training');
    expect(bottomNav.props.profileId).toBe('default');
  });

  it('navigates to Practice screen when activity is pressed', () => {
    const navigate = jest.fn();
    act(() => {
      component = renderer.create(<ScheduleScreen navigation={{ navigate } as any} />);
    });

    const visualSchedule = component!.root.findByProps({ testID: 'visual-schedule' });
    act(() => {
      visualSchedule.props.onActivityPress({ id: '1', activity: 'test' });
    });

    expect(navigate).toHaveBeenCalledWith('Practice');
  });

  it('handles schedule complete', () => {
    const navigate = jest.fn();
    act(() => {
      component = renderer.create(<ScheduleScreen navigation={{ navigate } as any} />);
    });

    const visualSchedule = component!.root.findByProps({ testID: 'visual-schedule' });

    // Mock console.log to avoid console output in tests
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    act(() => {
      visualSchedule.props.onScheduleComplete();
    });

    expect(consoleSpy).toHaveBeenCalledWith('Schedule completed!');

    consoleSpy.mockRestore();
  });
});