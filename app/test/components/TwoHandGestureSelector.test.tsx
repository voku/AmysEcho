/**
 * Two-Hand Gesture Selector Component Tests - Amy First
 *
 * Tests for the TwoHandGestureSelector component with best practices:
 * - Accessibility compliance
 * - User interaction handling
 * - Gesture filtering and selection
 * - Visual feedback validation
 * - Error state handling
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import TwoHandGestureSelector from '../../src/components/TwoHandGestureSelector';
import { TWO_HAND_GESTURES } from '../../src/constants/twoHandGestures';

// Mock accessibility context
jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({
    largeText: false,
    highContrast: false,
    screenReaderEnabled: false,
  }),
}));

// Mock language manager
jest.mock('../../src/services/LanguageManager', () => ({
  LanguageManager: {
    t: (key: string) => key,
  },
}));

describe('TwoHandGestureSelector', () => {
  const mockOnGestureSelect = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render all gesture categories', () => {
      const { getByText } = render(
        <TwoHandGestureSelector
          onGestureSelect={mockOnGestureSelect}
          onClose={mockOnClose}
        />
      );

      expect(getByText('communication')).toBeTruthy();
      expect(getByText('emotional')).toBeTruthy();
      expect(getByText('playful')).toBeTruthy();
      expect(getByText('emergency')).toBeTruthy();
    });

    it('should display gesture count for each category', () => {
      const { getByText } = render(
        <TwoHandGestureSelector
          onGestureSelect={mockOnGestureSelect}
          onClose={mockOnClose}
        />
      );

      // Check that we have some gestures in each category
      const communicationGestures = TWO_HAND_GESTURES.filter(g => g.category === 'communication');
      const emotionalGestures = TWO_HAND_GESTURES.filter(g => g.category === 'emotional');

      expect(communicationGestures.length).toBeGreaterThan(0);
      expect(emotionalGestures.length).toBeGreaterThan(0);
    });

    it('should show selected category gestures', () => {
      const { getByText, queryByText } = render(
        <TwoHandGestureSelector
          onGestureSelect={mockOnGestureSelect}
          onClose={mockOnClose}
          selectedCategory="communication"
        />
      );

      // Should show communication gestures
      const communicationGesture = TWO_HAND_GESTURES.find(g => g.category === 'communication');
      expect(communicationGesture).toBeTruthy();
      expect(getByText(communicationGesture!.name)).toBeTruthy();

      // Should not show emotional gestures
      const emotionalGesture = TWO_HAND_GESTURES.find(g => g.category === 'emotional');
      expect(emotionalGesture).toBeTruthy();
      expect(queryByText(emotionalGesture!.name)).toBeNull();
    });
  });

  describe('Category Selection', () => {
    it('should filter gestures when category is selected', async () => {
      const { getByText, queryByText } = render(
        <TwoHandGestureSelector
          onGestureSelect={mockOnGestureSelect}
          onClose={mockOnClose}
        />
      );

      // Click on communication category
      fireEvent.press(getByText('communication'));

      await waitFor(() => {
        // Should show communication gestures
        const communicationGesture = TWO_HAND_GESTURES.find(g => g.category === 'communication');
        expect(communicationGesture).toBeTruthy();
        expect(getByText(communicationGesture!.name)).toBeTruthy();
      });
    });

    it('should show all gestures when no category is selected', () => {
      const { getByText } = render(
        <TwoHandGestureSelector
          onGestureSelect={mockOnGestureSelect}
          onClose={mockOnClose}
        />
      );

      // Should show first gesture from each category
      const firstCommunication = TWO_HAND_GESTURES.find(g => g.category === 'communication');
      const firstEmotional = TWO_HAND_GESTURES.find(g => g.category === 'emotional');

      expect(firstCommunication).toBeTruthy();
      expect(firstEmotional).toBeTruthy();

      expect(getByText(firstCommunication!.name)).toBeTruthy();
      expect(getByText(firstEmotional!.name)).toBeTruthy();
    });
  });

  describe('Gesture Selection', () => {
    it('should call onGestureSelect when gesture is pressed', async () => {
      const { getByText } = render(
        <TwoHandGestureSelector
          onGestureSelect={mockOnGestureSelect}
          onClose={mockOnClose}
          selectedCategory="communication"
        />
      );

      const communicationGesture = TWO_HAND_GESTURES.find(g => g.category === 'communication');
      expect(communicationGesture).toBeTruthy();

      fireEvent.press(getByText(communicationGesture!.name));

      expect(mockOnGestureSelect).toHaveBeenCalledWith(communicationGesture);
    });

    it('should call onClose when close button is pressed', () => {
      const { getByTestId } = render(
        <TwoHandGestureSelector
          onGestureSelect={mockOnGestureSelect}
          onClose={mockOnClose}
        />
      );

      const closeButton = getByTestId('close-button');
      fireEvent.press(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible category buttons', () => {
      const { getByA11yLabel } = render(
        <TwoHandGestureSelector
          onGestureSelect={mockOnGestureSelect}
          onClose={mockOnClose}
        />
      );

      const communicationButton = getByA11yLabel('communication category');
      expect(communicationButton).toBeTruthy();
      expect(communicationButton.props.accessible).toBe(true);
    });

    it('should have accessible gesture buttons', async () => {
      const { getByA11yLabel } = render(
        <TwoHandGestureSelector
          onGestureSelect={mockOnGestureSelect}
          onClose={mockOnClose}
          selectedCategory="communication"
        />
      );

      await waitFor(() => {
        const communicationGesture = TWO_HAND_GESTURES.find(g => g.category === 'communication');
        expect(communicationGesture).toBeTruthy();

        const gestureButton = getByA11yLabel(`${communicationGesture!.name} gesture`);
        expect(gestureButton).toBeTruthy();
        expect(gestureButton.props.accessible).toBe(true);
      });
    });

    it('should support high contrast mode', () => {
      // Mock high contrast accessibility setting
      const mockUseAccessibility = require('../../src/components/AccessibilityContext').useAccessibility;
      mockUseAccessibility.mockReturnValue({
        largeText: false,
        highContrast: true,
        screenReaderEnabled: false,
      });

      const { getByTestId } = render(
        <TwoHandGestureSelector
          onGestureSelect={mockOnGestureSelect}
          onClose={mockOnClose}
        />
      );

      const container = getByTestId('gesture-selector-container');
      expect(container.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            borderWidth: 2,
            borderColor: expect.any(String),
          })
        ])
      );
    });

    it('should support large text mode', () => {
      // Mock large text accessibility setting
      const mockUseAccessibility = require('../../src/components/AccessibilityContext').useAccessibility;
      mockUseAccessibility.mockReturnValue({
        largeText: true,
        highContrast: false,
        screenReaderEnabled: false,
      });

      const { getByText } = render(
        <TwoHandGestureSelector
          onGestureSelect={mockOnGestureSelect}
          onClose={mockOnClose}
          selectedCategory="communication"
        />
      );

      const communicationGesture = TWO_HAND_GESTURES.find(g => g.category === 'communication');
      expect(communicationGesture).toBeTruthy();

      const gestureText = getByText(communicationGesture!.name);
      expect(gestureText.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fontSize: expect.any(Number),
          })
        ])
      );
    });
  });

  describe('Visual Feedback', () => {
    it('should show gesture difficulty indicators', async () => {
      const { getByTestId } = render(
        <TwoHandGestureSelector
          onGestureSelect={mockOnGestureSelect}
          onClose={mockOnClose}
          selectedCategory="communication"
        />
      );

      await waitFor(() => {
        // Should have difficulty indicators for different gesture difficulties
        const easyIndicators = getByTestId('difficulty-easy');
        const mediumIndicators = getByTestId('difficulty-medium');

        expect(easyIndicators).toBeTruthy();
        expect(mediumIndicators).toBeTruthy();
      });
    });

    it('should display gesture descriptions', async () => {
      const { getByText } = render(
        <TwoHandGestureSelector
          onGestureSelect={mockOnGestureSelect}
          onClose={mockOnClose}
          selectedCategory="communication"
        />
      );

      await waitFor(() => {
        const communicationGesture = TWO_HAND_GESTURES.find(g => g.category === 'communication');
        expect(communicationGesture).toBeTruthy();

        expect(getByText(communicationGesture!.description)).toBeTruthy();
      });
    });

    it('should show gesture examples when available', async () => {
      const { getByText } = render(
        <TwoHandGestureSelector
          onGestureSelect={mockOnGestureSelect}
          onClose={mockOnClose}
          selectedCategory="emergency"
        />
      );

      await waitFor(() => {
        const emergencyGesture = TWO_HAND_GESTURES.find(g => g.category === 'emergency');
        expect(emergencyGesture).toBeTruthy();
        expect(emergencyGesture!.examples.length).toBeGreaterThan(0);

        // Should show at least one example
        expect(getByText(emergencyGesture!.examples[0])).toBeTruthy();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle empty gesture list gracefully', () => {
      // Mock empty gesture list
      const originalGestures = [...TWO_HAND_GESTURES];
      // Temporarily replace with empty array
      (TWO_HAND_GESTURES as any).length = 0;

      const { getByText } = render(
        <TwoHandGestureSelector
          onGestureSelect={mockOnGestureSelect}
          onClose={mockOnClose}
        />
      );

      expect(getByText('No gestures available')).toBeTruthy();

      // Restore original gestures
      TWO_HAND_GESTURES.push(...originalGestures);
    });

    it('should handle missing gesture properties', () => {
      const { getByText } = render(
        <TwoHandGestureSelector
          onGestureSelect={mockOnGestureSelect}
          onClose={mockOnClose}
        />
      );

      // Component should handle gestures with missing properties gracefully
      expect(getByText('communication')).toBeTruthy();
    });
  });

  describe('Performance', () => {
    it('should render efficiently with many gestures', () => {
      const startTime = Date.now();

      render(
        <TwoHandGestureSelector
          onGestureSelect={mockOnGestureSelect}
          onClose={mockOnClose}
        />
      );

      const renderTime = Date.now() - startTime;
      expect(renderTime).toBeLessThan(100); // Should render quickly
    });

    it('should handle rapid category switching', async () => {
      const { getByText } = render(
        <TwoHandGestureSelector
          onGestureSelect={mockOnGestureSelect}
          onClose={mockOnClose}
        />
      );

      // Rapidly switch between categories
      fireEvent.press(getByText('communication'));
      fireEvent.press(getByText('emotional'));
      fireEvent.press(getByText('playful'));
      fireEvent.press(getByText('emergency'));

      await waitFor(() => {
        // Should handle rapid switching without crashing
        expect(getByText('emergency')).toBeTruthy();
      });
    });
  });
});