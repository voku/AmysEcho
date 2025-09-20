/**
 * ScreenFlash Component Tests
 *
 * Verifies that the visual feedback overlay renders correctly when active
 * and that core animation hooks are invoked for the most important patterns.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import ScreenFlash from '../../src/components/ScreenFlash';
import { ScreenFlashPattern } from '../../src/hooks/useRecognitionState';

const createAnimationMock = () => ({
  start: jest.fn(callback => {
    if (callback) {
      callback();
    }
  }),
});

const animatedMocks = {
  valueInstances: [] as any[],
};

jest.mock('react-native', () => {
  const React = require('react');

  class MockAnimatedValue {
    value: number;
    setValue = jest.fn((next: number) => {
      this.value = next;
    });
    interpolate = jest.fn(() => this);

    constructor(initial: number) {
      this.value = initial;
      animatedMocks.valueInstances.push(this);
    }
  }

  const Animated = {
    Value: MockAnimatedValue,
    timing: jest.fn(() => createAnimationMock()),
    sequence: jest.fn(() => createAnimationMock()),
    parallel: jest.fn(() => createAnimationMock()),
    loop: jest.fn(() => createAnimationMock()),
    delay: jest.fn(() => createAnimationMock()),
    View: (props: any) => React.createElement('AnimatedView', props, props.children),
  };

  const StyleSheet = {
    create: (styles: any) => styles,
    flatten: (style: any) => style,
  };

  const Dimensions = {
    get: jest.fn(() => ({ width: 375, height: 812 })),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };

  return {
    Animated,
    Dimensions,
    StyleSheet,
    View: (props: any) => React.createElement('View', props, props.children),
  };
});

describe('ScreenFlash', () => {
  const { Animated, Dimensions } = require('react-native');

  beforeEach(() => {
    jest.clearAllMocks();
    animatedMocks.valueInstances.length = 0;
    Dimensions.get.mockReturnValue({ width: 375, height: 812 });
    Animated.timing.mockImplementation(() => createAnimationMock());
    Animated.sequence.mockImplementation(() => createAnimationMock());
    Animated.parallel.mockImplementation(() => createAnimationMock());
    Animated.loop.mockImplementation(() => createAnimationMock());
    Animated.delay.mockImplementation(() => createAnimationMock());
  });

  it('renders nothing when inactive', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<ScreenFlash isActive={false} />);
    });
    expect(tree.toJSON()).toBeNull();
  });

  it('renders overlay when active', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<ScreenFlash isActive />);
    });
    const overlay = tree.root.findByProps({ testID: 'screen-flash-overlay' });
    expect(overlay.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ backgroundColor: expect.any(String) }),
      ]),
    );
  });

  it('applies custom color and dimensions', () => {
    Dimensions.get.mockReturnValue({ width: 400, height: 900 });

    let tree: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<ScreenFlash isActive color="#FF0000" />);
    });
    const overlay = tree.root.findByProps({ testID: 'screen-flash-overlay' });

    expect(overlay.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ backgroundColor: '#FF0000' }),
        expect.objectContaining({ width: 400, height: 900 }),
      ]),
    );
  });

  it('runs sequence animation for double pattern', () => {
    act(() => {
      renderer.create(
        <ScreenFlash isActive pattern={ScreenFlashPattern.Double} duration={120} />,
      );
    });

    expect(Animated.sequence).toHaveBeenCalled();
    expect(Animated.timing).toHaveBeenCalled();
  });

  it('resets animations when deactivated after being active', () => {
    let testRenderer: ReactTestRenderer;
    act(() => {
      testRenderer = renderer.create(<ScreenFlash isActive />);
    });

    act(() => {
      testRenderer.update(<ScreenFlash isActive={false} />);
    });

    const [opacityValue, scaleValue] = animatedMocks.valueInstances;
    expect(opacityValue.setValue).toHaveBeenCalledWith(0);
    expect(scaleValue.setValue).toHaveBeenCalledWith(1);
  });
});
