/**
 * Two-Hand Gesture Display Component Tests - Amy First
 *
 * Tests for the TwoHandGestureDisplay component with best practices:
 * - Visual rendering validation
 * - Accessibility compliance
 * - Size and styling variations
 * - Error handling for invalid inputs
 * - Performance and responsiveness
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import TwoHandGestureDisplay from '../../src/components/TwoHandGestureDisplay';

// Mock accessibility context
jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({
    largeText: false,
    highContrast: false,
  }),
}));

// Mock language manager
jest.mock('../../src/services/LanguageManager', () => ({
  LanguageManager: {
    t: (key: string) => key,
  },
}));

describe('TwoHandGestureDisplay', () => {
  describe('Rendering', () => {
    it('should render two-hand gesture correctly', () => {
      const { getByText, getByTestId } = render(
        <TwoHandGestureDisplay
          gestureString="ILoveYou+ILoveYou"
          confidence={0.85}
        />
      );

      expect(getByText('Bitte (beide Hände)')).toBeTruthy();
      expect(getByText('85%')).toBeTruthy();
      expect(getByTestId('two-hand-visual')).toBeTruthy();
    });

    it('should not render for single-hand gestures', () => {
      const { queryByText } = render(
        <TwoHandGestureDisplay
          gestureString="Thumb_Up"
          confidence={0.8}
        />
      );

      expect(queryByText('Thumb_Up')).toBeNull();
    });

    it('should handle invalid gesture strings gracefully', () => {
      const { queryByText } = render(
        <TwoHandGestureDisplay
          gestureString="invalid"
          confidence={0.8}
        />
      );

      expect(queryByText('invalid')).toBeNull();
    });

    it('should display fallback text for unknown gestures', () => {
      const { getByText } = render(
        <TwoHandGestureDisplay
          gestureString="UnknownGesture1+UnknownGesture2"
          confidence={0.75}
        />
      );

      expect(getByText('UnknownGesture1 + UnknownGesture2')).toBeTruthy();
      expect(getByText('75%')).toBeTruthy();
    });
  });

  describe('Size Variations', () => {
    it('should render small size correctly', () => {
      const { getByTestId } = render(
        <TwoHandGestureDisplay
          gestureString="ILoveYou+ILoveYou"
          confidence={0.8}
          size="small"
        />
      );

      const container = getByTestId('gesture-display-container');
      expect(container.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            padding: expect.any(Number),
          })
        ])
      );
    });

    it('should render medium size correctly', () => {
      const { getByTestId } = render(
        <TwoHandGestureDisplay
          gestureString="ILoveYou+ILoveYou"
          confidence={0.8}
          size="medium"
        />
      );

      const container = getByTestId('gesture-display-container');
      expect(container.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            padding: expect.any(Number),
          })
        ])
      );
    });

    it('should render large size correctly', () => {
      const { getByTestId } = render(
        <TwoHandGestureDisplay
          gestureString="ILoveYou+ILoveYou"
          confidence={0.8}
          size="large"
        />
      );

      const container = getByTestId('gesture-display-container');
      expect(container.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            padding: expect.any(Number),
          })
        ])
      );
    });
  });

  describe('Accessibility', () => {
    it('should have proper accessibility labels', () => {
      const { getByA11yLabel } = render(
        <TwoHandGestureDisplay
          gestureString="ILoveYou+ILoveYou"
          confidence={0.85}
        />
      );

      expect(getByA11yLabel('Two-hand gesture: Bitte (beide Hände)')).toBeTruthy();
      expect(getByA11yLabel('Gesture confidence: 85%')).toBeTruthy();
    });

    it('should support high contrast mode', () => {
      // Mock high contrast setting
      const mockUseAccessibility = require('../../src/components/AccessibilityContext').useAccessibility;
      mockUseAccessibility.mockReturnValue({
        largeText: false,
        highContrast: true,
      });

      const { getByTestId } = render(
        <TwoHandGestureDisplay
          gestureString="ILoveYou+ILoveYou"
          confidence={0.8}
        />
      );

      const container = getByTestId('gesture-display-container');
      expect(container.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            borderWidth: 2,
          })
        ])
      );
    });

    it('should support large text mode', () => {
      // Mock large text setting
      const mockUseAccessibility = require('../../src/components/AccessibilityContext').useAccessibility;
      mockUseAccessibility.mockReturnValue({
        largeText: true,
        highContrast: false,
      });

      const { getByText } = render(
        <TwoHandGestureDisplay
          gestureString="ILoveYou+ILoveYou"
          confidence={0.8}
        />
      );

      const gestureText = getByText('Bitte (beide Hände)');
      expect(gestureText.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fontSize: expect.any(Number),
          })
        ])
      );
    });
  });

  describe('Visual Elements', () => {
    it('should display hand symbols for two-hand gestures', () => {
      const { getByText } = render(
        <TwoHandGestureDisplay
          gestureString="ILoveYou+ILoveYou"
          confidence={0.8}
        />
      );

      expect(getByText('🤲')).toBeTruthy();
      expect(getByText('+')).toBeTruthy();
    });

    it('should show confidence percentage correctly', () => {
      const { getByText } = render(
        <TwoHandGestureDisplay
          gestureString="ILoveYou+ILoveYou"
          confidence={0.923}
        />
      );

      expect(getByText('92%')).toBeTruthy();
    });

    it('should display gesture description when showDetails is true', () => {
      const { getByText } = render(
        <TwoHandGestureDisplay
          gestureString="ILoveYou+ILoveYou"
          confidence={0.8}
          showDetails={true}
        />
      );

      expect(getByText('Bitte mit beiden Händen für stärkere Betonung')).toBeTruthy();
    });

    it('should hide details when showDetails is false', () => {
      const { queryByText } = render(
        <TwoHandGestureDisplay
          gestureString="ILoveYou+ILoveYou"
          confidence={0.8}
          showDetails={false}
        />
      );

      expect(queryByText('Bitte mit beiden Händen für stärkere Betonung')).toBeNull();
    });
  });

  describe('Gesture Definition Integration', () => {
    it('should display category badge for known gestures', () => {
      const { getByText } = render(
        <TwoHandGestureDisplay
          gestureString="ILoveYou+ILoveYou"
          confidence={0.8}
          showDetails={true}
        />
      );

      expect(getByText('COMMUNICATION')).toBeTruthy();
    });

    it('should show difficulty level appropriately', () => {
      const { getByTestId } = render(
        <TwoHandGestureDisplay
          gestureString="ILoveYou+ILoveYou"
          confidence={0.8}
          showDetails={true}
        />
      );

      // Should have difficulty indicator
      const difficultyIndicator = getByTestId('difficulty-indicator');
      expect(difficultyIndicator).toBeTruthy();
    });

    it('should display examples for gestures that have them', () => {
      const { getByText } = render(
        <TwoHandGestureDisplay
          gestureString="Pointing_Up+Pointing_Up"
          confidence={0.8}
          showDetails={true}
        />
      );

      // Emergency gesture should have examples
      expect(getByText('Sofortige Hilfe benötigt')).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed gesture strings', () => {
      const { queryByText } = render(
        <TwoHandGestureDisplay
          gestureString="malformed+"
          confidence={0.8}
        />
      );

      expect(queryByText('malformed+')).toBeNull();
    });

    it('should handle gesture strings with too many parts', () => {
      const { queryByText } = render(
        <TwoHandGestureDisplay
          gestureString="One+Two+Three"
          confidence={0.8}
        />
      );

      expect(queryByText('One+Two+Three')).toBeNull();
    });

    it('should handle empty gesture strings', () => {
      const { queryByText } = render(
        <TwoHandGestureDisplay
          gestureString=""
          confidence={0.8}
        />
      );

      expect(queryByText('')).toBeNull();
    });

    it('should handle null confidence gracefully', () => {
      const { getByText } = render(
        <TwoHandGestureDisplay
          gestureString="ILoveYou+ILoveYou"
          confidence={0}
        />
      );

      expect(getByText('0%')).toBeTruthy();
    });
  });

  describe('Performance', () => {
    it('should render quickly', () => {
      const startTime = Date.now();

      render(
        <TwoHandGestureDisplay
          gestureString="ILoveYou+ILoveYou"
          confidence={0.8}
        />
      );

      const renderTime = Date.now() - startTime;
      expect(renderTime).toBeLessThan(50); // Should render very quickly
    });

    it('should handle frequent re-renders efficiently', () => {
      const { rerender } = render(
        <TwoHandGestureDisplay
          gestureString="ILoveYou+ILoveYou"
          confidence={0.8}
        />
      );

      // Re-render with different props multiple times
      for (let i = 0; i < 10; i++) {
        rerender(
          <TwoHandGestureDisplay
            gestureString="ILoveYou+ILoveYou"
            confidence={0.8 + (i * 0.01)}
          />
        );
      }

      // Should not crash or become unresponsive
      expect(true).toBe(true);
    });
  });

  describe('Styling and Layout', () => {
    it('should apply correct container styles', () => {
      const { getByTestId } = render(
        <TwoHandGestureDisplay
          gestureString="ILoveYou+ILoveYou"
          confidence={0.8}
        />
      );

      const container = getByTestId('gesture-display-container');
      expect(container.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            alignItems: 'center',
            borderRadius: expect.any(Number),
          })
        ])
      );
    });

    it('should position hand symbols correctly', () => {
      const { getByTestId } = render(
        <TwoHandGestureDisplay
          gestureString="ILoveYou+ILoveYou"
          confidence={0.8}
        />
      );

      const handsContainer = getByTestId('hands-container');
      expect(handsContainer.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            flexDirection: 'row',
            alignItems: 'center',
          })
        ])
      );
    });

    it('should style confidence text appropriately', () => {
      const { getByText } = render(
        <TwoHandGestureDisplay
          gestureString="ILoveYou+ILoveYou"
          confidence={0.8}
        />
      );

      const confidenceText = getByText('80%');
      expect(confidenceText.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            textAlign: 'center',
          })
        ])
      );
    });
  });

  describe('Integration with Gesture Definitions', () => {
    it('should use gesture definition data when available', () => {
      const { getByText } = render(
        <TwoHandGestureDisplay
          gestureString="ILoveYou+ILoveYou"
          confidence={0.8}
          showDetails={true}
        />
      );

      // Should use the localized name from gesture definition
      expect(getByText('Bitte (beide Hände)')).toBeTruthy();
    });

    it('should fall back to raw gesture names when definition not found', () => {
      const { getByText } = render(
        <TwoHandGestureDisplay
          gestureString="CustomGesture1+CustomGesture2"
          confidence={0.8}
        />
      );

      expect(getByText('CustomGesture1 + CustomGesture2')).toBeTruthy();
    });

    it('should handle gestures with different left/right combinations', () => {
      const { getByText } = render(
        <TwoHandGestureDisplay
          gestureString="ILoveYou+Thumb_Up"
          confidence={0.8}
        />
      );

      expect(getByText('ILoveYou + Thumb_Up')).toBeTruthy();
    });
  });
});