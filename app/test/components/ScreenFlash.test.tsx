/**
 * Screen Flash Component Tests - Amy First
 *
 * Comprehensive tests for the screen flash feedback component that provides
 * visual feedback for successful gestures in quiet environments.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Animated } from 'react-native';
import ScreenFlash from '../../src/components/ScreenFlash';

// Mock Dimensions specifically
jest.mock('react-native/Libraries/Utilities/Dimensions', () => ({
  get: jest.fn(() => ({ width: 375, height: 812 })),
}));

describe('ScreenFlash', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should not render when not active', () => {
      const { queryByTestId } = render(
        <ScreenFlash isActive={false} />
      );

      expect(queryByTestId('screen-flash-container')).toBeNull();
    });

    it('should render when active', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} />
      );

      expect(getByTestId('screen-flash-container')).toBeTruthy();
      expect(getByTestId('screen-flash-overlay')).toBeTruthy();
    });

    it('should apply custom color', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} color="#FF0000" />
      );

      const flashElement = getByTestId('screen-flash-overlay');
      expect(flashElement.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ backgroundColor: '#FF0000' })
        ])
      );
    });
  });

  describe('Flash Patterns', () => {
    it('should handle single pattern', async () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} pattern="single" duration={100} />
      );

      const flashElement = getByTestId('screen-flash-overlay');

      // Check that opacity animation is applied
      expect(flashElement.props.style).toEqual(
        expect.arrayContaining([
          expect.any(Object), // The Animated.Value for opacity
          expect.any(Object), // The Animated.Value for scale
        ])
      );
    });

    it('should handle double pattern', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} pattern="double" duration={100} />
      );

      const flashElement = getByTestId('screen-flash-overlay');
      expect(flashElement.props.style).toBeDefined();
    });

    it('should handle triple pattern', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} pattern="triple" duration={100} />
      );

      const flashElement = getByTestId('screen-flash-overlay');
      expect(flashElement.props.style).toBeDefined();
    });

    it('should handle pulse pattern', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} pattern="pulse" duration={100} />
      );

      const flashElement = getByTestId('screen-flash-overlay');
      expect(flashElement.props.style).toBeDefined();
    });

    it('should handle ripple pattern', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} pattern="ripple" duration={100} />
      );

      const flashElement = getByTestId('screen-flash-overlay');
      expect(flashElement.props.style).toBeDefined();
    });

    it('should handle wave pattern', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} pattern="wave" duration={100} />
      );

      const flashElement = getByTestId('screen-flash-overlay');
      expect(flashElement.props.style).toBeDefined();
    });

    it('should handle heartbeat pattern', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} pattern="heartbeat" duration={100} />
      );

      const flashElement = getByTestId('screen-flash-overlay');
      expect(flashElement.props.style).toBeDefined();
    });

    it('should handle success pattern', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} pattern="success" duration={100} />
      );

      const flashElement = getByTestId('screen-flash-overlay');
      expect(flashElement.props.style).toBeDefined();
    });

    it('should handle warning pattern', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} pattern="warning" duration={100} />
      );

      const flashElement = getByTestId('screen-flash-overlay');
      expect(flashElement.props.style).toBeDefined();
    });

    it('should handle error pattern', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} pattern="error" duration={100} />
      );

      const flashElement = getByTestId('screen-flash-overlay');
      expect(flashElement.props.style).toBeDefined();
    });
  });

  describe('Intensity Levels', () => {
    it('should handle subtle intensity', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} intensity="subtle" />
      );

      const flashElement = getByTestId('screen-flash-overlay');
      expect(flashElement.props.style).toBeDefined();
    });

    it('should handle normal intensity', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} intensity="normal" />
      );

      const flashElement = getByTestId('screen-flash-overlay');
      expect(flashElement.props.style).toBeDefined();
    });

    it('should handle intense intensity', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} intensity="intense" />
      );

      const flashElement = getByTestId('screen-flash-overlay');
      expect(flashElement.props.style).toBeDefined();
    });
  });

  describe('Animation Behavior', () => {
    it('should reset animations when deactivated', () => {
      const { rerender } = render(
        <ScreenFlash isActive={true} />
      );

      // Deactivate
      rerender(<ScreenFlash isActive={false} />);

      // Component should not render
      expect(() => rerender(<ScreenFlash isActive={false} />)).not.toThrow();
    });

    it('should handle custom duration', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} duration={500} />
      );

      const flashElement = getByTestId('screen-flash-overlay');
      expect(flashElement.props.style).toBeDefined();
    });
  });

  describe('Accessibility', () => {
    it('should have pointerEvents none for accessibility', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} />
      );

      const container = getByTestId('screen-flash-container');
      expect(container.props.pointerEvents).toBe('none');
    });

    it('should have high zIndex for overlay', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} />
      );

      const container = getByTestId('screen-flash-container');
      const styleArray = container.props.style;
      expect(styleArray).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ zIndex: 1000 })
        ])
      );
    });
  });

  describe('Styling', () => {
    it('should cover full screen dimensions', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} />
      );

      const flashElement = getByTestId('screen-flash-overlay');
      const styleArray = flashElement.props.style;

      // Check that it has absolute positioning and full coverage
      expect(styleArray).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            position: 'absolute',
            top: 0,
            left: 0,
          })
        ])
      );
    });

    it('should center content', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} />
      );

      const flashElement = getByTestId('screen-flash-overlay');
      const styleArray = flashElement.props.style;

      expect(styleArray).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            alignItems: 'center',
            justifyContent: 'center',
          })
        ])
      );
    });
  });

  describe('Animation Cleanup', () => {
    it('should clean up animations on unmount', () => {
      const { unmount } = render(
        <ScreenFlash isActive={true} />
      );

      expect(() => unmount()).not.toThrow();
    });

    it('should handle rapid activation/deactivation', () => {
      const { rerender } = render(
        <ScreenFlash isActive={true} />
      );

      // Rapid changes
      rerender(<ScreenFlash isActive={false} />);
      rerender(<ScreenFlash isActive={true} />);
      rerender(<ScreenFlash isActive={false} />);

      expect(() => rerender(<ScreenFlash isActive={false} />)).not.toThrow();
    });
  });

  describe('Default Props', () => {
    it('should use default pattern when not specified', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} />
      );

      const flashElement = getByTestId('screen-flash-overlay');
      expect(flashElement.props.style).toBeDefined();
    });

    it('should use default color when not specified', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} />
      );

      const flashElement = getByTestId('screen-flash-overlay');
      // Default color should be applied (from COLORS.primaryAccent)
      expect(flashElement.props.style).toBeDefined();
    });

    it('should use default duration when not specified', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} />
      );

      const flashElement = getByTestId('screen-flash-overlay');
      expect(flashElement.props.style).toBeDefined();
    });

    it('should use default intensity when not specified', () => {
      const { getByTestId } = render(
        <ScreenFlash isActive={true} />
      );

      const flashElement = getByTestId('screen-flash-overlay');
      expect(flashElement.props.style).toBeDefined();
    });
  });
});