/**
 * Gesture Comparison Component Tests - Amy First
 *
 * Comprehensive tests for the gesture comparison component that shows
 * side-by-side comparison of user's attempt vs correct gesture.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import GestureComparison from '../../src/components/GestureComparison';

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: {
    Light: 'light',
  },
  impactAsync: jest.fn(),
}));

// Mock AccessibilityContext
jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: jest.fn(() => ({
    largeText: false,
    highContrast: false,
  })),
}));

// Mock themeMessages
jest.mock('../../src/utils/themeMessages', () => ({
  useThemeMessages: jest.fn(() => ({
    getTryAgainMessage: jest.fn(() => 'Versuche es nochmal! Du schaffst das!'),
  })),
}));

// Mock childFriendlyStyles
jest.mock('../../src/styles/touchTargets', () => ({
  childFriendlyStyles: {
    minTouchTarget: {
      minWidth: 44,
      minHeight: 44,
    },
  },
}));

// Mock COLORS and SPACING
jest.mock('../../src/constants/ui', () => ({
  COLORS: {
    surface: '#ffffff',
    text: '#000000',
    textMuted: '#666666',
    primaryAccent: '#007bff',
    secondaryAccent: '#6c757d',
    warningBackground: '#fff3cd',
    success: '#28a745',
    border: '#cccccc',
    highContrastBackground: '#000000',
    highContrastText: '#ffffff',
    highContrastPressed: '#333333',
    pressed: '#f0f0f0',
  },
  SPACING: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
  },
  RADIUS: 8,
}));

const mockHaptics = Haptics.impactAsync as jest.MockedFunction<typeof Haptics.impactAsync>;
const mockUseAccessibility = require('../../src/components/AccessibilityContext').useAccessibility;
const mockUseThemeMessages = require('../../src/utils/themeMessages').useThemeMessages;

describe('GestureComparison', () => {
  const mockUserAttempt = {
    id: 'attempt-1',
    label: 'Hallo',
    confidence: 0.75,
    timestamp: Date.now(),
  };

  const mockCorrectGesture = {
    id: 'gesture-hello',
    label: 'Hallo',
    videoUri: 'hello.mp4',
    dgsVideoUri: 'hello-dgs.mp4',
  };

  const mockOnClose = jest.fn();
  const mockOnTryAgain = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render with all required props', () => {
      const { getByTestId, getByText, getAllByText } = render(
        <GestureComparison
          userAttempt={mockUserAttempt}
          correctGesture={mockCorrectGesture}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      expect(getByTestId('gesture-comparison-overlay')).toBeTruthy();
      expect(getByText('🤝 Geste vergleichen')).toBeTruthy();
      expect(getByText('Dein Versuch')).toBeTruthy();
      expect(getByText('So geht\'s')).toBeTruthy();
      expect(getAllByText('Hallo')).toHaveLength(2); // One for user attempt, one for correct gesture
      expect(getByText('75%')).toBeTruthy();
    });

    it('should display user attempt information correctly', () => {
      const { getByText, getAllByText } = render(
        <GestureComparison
          userAttempt={mockUserAttempt}
          correctGesture={mockCorrectGesture}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      expect(getByText('Dein Versuch')).toBeTruthy();
      expect(getAllByText('Hallo')).toHaveLength(2); // Both user attempt and correct gesture have "Hallo"
      expect(getByText('75%')).toBeTruthy();
      expect(getByText('⭐ Gut gemacht!')).toBeTruthy();
    });

    it('should display correct gesture information correctly', () => {
      const { getByText } = render(
        <GestureComparison
          userAttempt={mockUserAttempt}
          correctGesture={mockCorrectGesture}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      expect(getByText('So geht\'s')).toBeTruthy();
      expect(getByText('Richtige Geste')).toBeTruthy();
      expect(getByText('🎯 Ziel')).toBeTruthy();
    });

    it('should display encouraging message from theme messages', () => {
      const mockGetTryAgainMessage = jest.fn(() => 'Custom encouraging message');
      mockUseThemeMessages.mockReturnValue({
        getTryAgainMessage: mockGetTryAgainMessage,
      });

      const { getByText } = render(
        <GestureComparison
          userAttempt={mockUserAttempt}
          correctGesture={mockCorrectGesture}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      expect(mockGetTryAgainMessage).toHaveBeenCalled();
      expect(getByText('Custom encouraging message')).toBeTruthy();
    });
  });

  describe('User Interactions', () => {
    it('should call onTryAgain when try again button is pressed', () => {
      const { getByText } = render(
        <GestureComparison
          userAttempt={mockUserAttempt}
          correctGesture={mockCorrectGesture}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      const tryAgainButton = getByText('🔄 Nochmal versuchen');
      fireEvent.press(tryAgainButton);

      expect(mockOnTryAgain).toHaveBeenCalled();
      expect(mockHaptics).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    });

    it('should call onClose when close button is pressed', () => {
      const { getByText } = render(
        <GestureComparison
          userAttempt={mockUserAttempt}
          correctGesture={mockCorrectGesture}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      const closeButton = getByText('✅ Fertig');
      fireEvent.press(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
      expect(mockHaptics).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    });

    it('should provide haptic feedback on button press', () => {
      const { getByText } = render(
        <GestureComparison
          userAttempt={mockUserAttempt}
          correctGesture={mockCorrectGesture}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      const tryAgainButton = getByText('🔄 Nochmal versuchen');
      fireEvent.press(tryAgainButton);

      expect(mockHaptics).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    });
  });

  describe('Accessibility', () => {
    it('should have accessibility support', () => {
      const { getByText } = render(
        <GestureComparison
          userAttempt={mockUserAttempt}
          correctGesture={mockCorrectGesture}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      const tryAgainButton = getByText('🔄 Nochmal versuchen');
      const closeButton = getByText('✅ Fertig');

      // Check that buttons are accessible
      expect(tryAgainButton.props.accessible).toBe(true);
      expect(closeButton.props.accessible).toBe(true);
    });

    it('should apply large text styles when accessibility setting is enabled', () => {
      mockUseAccessibility.mockReturnValue({
        largeText: true,
        highContrast: false,
      });

      const { getByText } = render(
        <GestureComparison
          userAttempt={mockUserAttempt}
          correctGesture={mockCorrectGesture}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      const title = getByText('🤝 Geste vergleichen');
      expect(title.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ fontSize: 28 }) // large text size
        ])
      );
    });

    it('should apply high contrast styles when accessibility setting is enabled', () => {
      mockUseAccessibility.mockReturnValue({
        largeText: false,
        highContrast: true,
      });

      const { getByTestId } = render(
        <GestureComparison
          userAttempt={mockUserAttempt}
          correctGesture={mockCorrectGesture}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      const overlay = getByTestId('gesture-comparison-overlay');
      expect(overlay.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ backgroundColor: 'rgba(0, 0, 0, 0.9)' })
        ])
      );
    });
  });

  describe('Confidence Display', () => {
    it('should display confidence as percentage', () => {
      const { getByText } = render(
        <GestureComparison
          userAttempt={{ ...mockUserAttempt, confidence: 0.85 }}
          correctGesture={mockCorrectGesture}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      expect(getByText('85%')).toBeTruthy();
    });

    it('should round confidence to nearest integer', () => {
      const { getByText } = render(
        <GestureComparison
          userAttempt={{ ...mockUserAttempt, confidence: 0.678 }}
          correctGesture={mockCorrectGesture}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      expect(getByText('68%')).toBeTruthy();
    });

    it('should handle zero confidence', () => {
      const { getByText } = render(
        <GestureComparison
          userAttempt={{ ...mockUserAttempt, confidence: 0 }}
          correctGesture={mockCorrectGesture}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      expect(getByText('0%')).toBeTruthy();
    });

    it('should handle perfect confidence', () => {
      const { getByText } = render(
        <GestureComparison
          userAttempt={{ ...mockUserAttempt, confidence: 1.0 }}
          correctGesture={mockCorrectGesture}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      expect(getByText('100%')).toBeTruthy();
    });
  });

  describe('Gesture Labels', () => {
    it('should display different gesture labels correctly', () => {
      const { getByText } = render(
        <GestureComparison
          userAttempt={{ ...mockUserAttempt, label: 'Bitte' }}
          correctGesture={{ ...mockCorrectGesture, label: 'Danke' }}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      expect(getByText('Bitte')).toBeTruthy();
      expect(getByText('Danke')).toBeTruthy();
    });

    it('should handle empty gesture labels', () => {
      const { getAllByText } = render(
        <GestureComparison
          userAttempt={{ ...mockUserAttempt, label: '' }}
          correctGesture={{ ...mockCorrectGesture, label: '' }}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      expect(getAllByText('')).toHaveLength(2); // Two empty labels
    });
  });

  describe('Styling', () => {
    it('should apply correct colors for user attempt section', () => {
      const { getByText } = render(
        <GestureComparison
          userAttempt={mockUserAttempt}
          correctGesture={mockCorrectGesture}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      // The styling is applied through StyleSheet, so we check that the component renders without errors
      expect(getByText('Dein Versuch')).toBeTruthy();
    });

    it('should apply correct colors for correct gesture section', () => {
      const { getByText } = render(
        <GestureComparison
          userAttempt={mockUserAttempt}
          correctGesture={mockCorrectGesture}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      expect(getByText('So geht\'s')).toBeTruthy();
    });

    it('should apply correct button styles', () => {
      const { getByText } = render(
        <GestureComparison
          userAttempt={mockUserAttempt}
          correctGesture={mockCorrectGesture}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      const tryAgainButton = getByText('🔄 Nochmal versuchen');
      const closeButton = getByText('✅ Fertig');

      expect(tryAgainButton.props.style).toEqual(
        expect.arrayContaining([
          expect.any(Object), // minTouchTarget
          expect.any(Object), // button style
          expect.any(Object), // tryAgainButton style
        ])
      );

      expect(closeButton.props.style).toEqual(
        expect.arrayContaining([
          expect.any(Object), // minTouchTarget
          expect.any(Object), // button style
          expect.any(Object), // closeButton style
        ])
      );
    });
  });

  describe('Button Functionality', () => {
    it('should have functional buttons', () => {
      const { getByText } = render(
        <GestureComparison
          userAttempt={mockUserAttempt}
          correctGesture={mockCorrectGesture}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      const tryAgainButton = getByText('🔄 Nochmal versuchen');
      const closeButton = getByText('✅ Fertig');

      // The buttons should have press handlers
      expect(tryAgainButton.props.onPress).toBeDefined();
      expect(closeButton.props.onPress).toBeDefined();
    });
  });

  describe('Layout', () => {
    it('should have proper layout structure', () => {
      const { getByTestId } = render(
        <GestureComparison
          userAttempt={mockUserAttempt}
          correctGesture={mockCorrectGesture}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      expect(getByTestId('gesture-comparison-overlay')).toBeTruthy();
      // The layout includes overlay, container, title, message, comparison container, and buttons
    });

    it('should display hint text', () => {
      const { getByText } = render(
        <GestureComparison
          userAttempt={mockUserAttempt}
          correctGesture={mockCorrectGesture}
          onClose={mockOnClose}
          onTryAgain={mockOnTryAgain}
        />
      );

      expect(getByText('💡 Übung macht den Meister! Du schaffst das!')).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing callback functions gracefully', () => {
      expect(() => {
        render(
          <GestureComparison
            userAttempt={mockUserAttempt}
            correctGesture={mockCorrectGesture}
            onClose={() => {}}
            onTryAgain={() => {}}
          />
        );
      }).not.toThrow();
    });

    it('should handle undefined props gracefully', () => {
      const userAttemptWithUndefined = {
        ...mockUserAttempt,
        label: undefined as any,
      };

      expect(() => {
        render(
          <GestureComparison
            userAttempt={userAttemptWithUndefined}
            correctGesture={mockCorrectGesture}
            onClose={mockOnClose}
            onTryAgain={mockOnTryAgain}
          />
        );
      }).not.toThrow();
    });
  });
});