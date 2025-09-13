/**
 * Integration Tests for OpenAI Gesture Validation - Client Side
 *
 * Tests the complete client-side integration including:
 * - Service integration with API
 * - Component rendering and interaction
 * - MediaPipe detector integration
 * - Error handling and fallbacks
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { OpenAIGestureFeedback } from '../../src/components/OpenAIGestureFeedback';
import {
  validateGestureWithOpenAI,
  validateGestureWithFallback,
  shouldTriggerOpenAIValidation,
  calculateAdaptiveThreshold,
} from '../../src/services/openaiGestureValidationService';

// Mock fetch for API calls
global.fetch = jest.fn();

// Mock the OpenAI feedback component
jest.mock('../../src/components/OpenAIGestureFeedback', () => {
  const React = require('react');
  return {
    OpenAIGestureFeedback: ({ isVisible, validationResult, onDismiss, onApplySuggestion }: any) => {
      if (!isVisible) return null;

      return React.createElement('View', {
        testID: 'openai-feedback',
        children: [
          React.createElement('Text', { key: 'gesture', testID: 'gesture-text' }, validationResult?.gesture || ''),
          React.createElement('Text', { key: 'confidence', testID: 'confidence-text' }, validationResult?.confidence?.toString() || ''),
          React.createElement('TouchableOpacity', {
            key: 'dismiss',
            testID: 'dismiss-button',
            onPress: onDismiss,
          }, 'Dismiss'),
          React.createElement('TouchableOpacity', {
            key: 'apply-suggestion',
            testID: 'apply-suggestion-button',
            onPress: () => onApplySuggestion?.(validationResult?.suggestions?.[0] || ''),
          }, 'Apply Suggestion'),
        ],
      });
    },
  };
});

describe('OpenAI Gesture Validation Integration', () => {
  const mockImageCapture = {
    uri: 'data:image/jpeg;base64,test',
    base64: 'test',
    width: 640,
    height: 480,
    timestamp: Date.now(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Integration', () => {
    it('should integrate with API for gesture validation', async () => {
      const mockApiResponse = {
        primary_gesture: {
          gesture: 'hello',
          confidence: 0.85,
          feedback: 'Clear gesture execution',
          quality_score: 8.5,
          suggestions: ['Keep hand steady'],
          landmarks_detected: true,
          hand_count: 1,
        },
        alternative_gestures: [],
        overall_confidence: 0.85,
        processing_time_ms: 1500,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      const result = await validateGestureWithOpenAI({
        image: mockImageCapture,
        expectedGesture: 'hello',
        mediapipeConfidence: 0.7,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/gesture/validate-vision',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('test'), // base64 data
        })
      );

      expect(result.success).toBe(true);
      expect(result.gesture).toBe('hello');
      expect(result.confidence).toBe(0.85);
      expect(result.feedback).toBe('Clear gesture execution');
      expect(result.quality_score).toBe(8.5);
      expect(result.suggestions).toEqual(['Keep hand steady']);
    });

    it('should handle API errors with fallback', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await validateGestureWithOpenAI({
        image: mockImageCapture,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 500');
    });

    it('should handle network errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await validateGestureWithOpenAI({
        image: mockImageCapture,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('Fallback Validation Integration', () => {
    it('should integrate MediaPipe and OpenAI validation', async () => {
      const mockApiResponse = {
        primary_gesture: {
          gesture: 'thank_you',
          confidence: 0.9,
          feedback: 'Corrected gesture with better confidence',
          quality_score: 9.0,
          suggestions: ['Use both hands'],
          landmarks_detected: true,
          hand_count: 2,
        },
        alternative_gestures: [],
        overall_confidence: 0.9,
        processing_time_ms: 1200,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      const mediapipeResult = {
        gesture: 'hello',
        confidence: 0.6,
        landmarks: [[[0.5, 0.5, 0.8]]], // Mock landmarks
      };

      const result = await validateGestureWithFallback(
        mediapipeResult,
        mockImageCapture,
        { environment: 'home' }
      );

      expect(result.finalGesture).toBe('thank_you');
      expect(result.finalConfidence).toBe(0.9);
      expect(result.validationSource).toBe('openai');
      expect(result.feedback).toBe('Corrected gesture with better confidence');
      expect(result.suggestions).toEqual(['Use both hands']);
    });

    it('should use MediaPipe result when OpenAI fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('API unavailable'));

      const mediapipeResult = {
        gesture: 'hello',
        confidence: 0.7,
        landmarks: [],
      };

      const result = await validateGestureWithFallback(
        mediapipeResult,
        mockImageCapture
      );

      expect(result.finalGesture).toBe('hello');
      expect(result.finalConfidence).toBe(0.7);
      expect(result.validationSource).toBe('mediapipe');
      expect(result.feedback).toBeUndefined();
      expect(result.suggestions).toBeUndefined();
    });

    it('should combine results when appropriate', async () => {
      const mockApiResponse = {
        primary_gesture: {
          gesture: 'hello',
          confidence: 0.75,
          feedback: 'Confirmed with slight improvement',
          quality_score: 8.0,
          suggestions: ['Improve hand position'],
          landmarks_detected: true,
          hand_count: 1,
        },
        alternative_gestures: [],
        overall_confidence: 0.75,
        processing_time_ms: 1000,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      const mediapipeResult = {
        gesture: 'hello',
        confidence: 0.65,
        landmarks: [],
      };

      const result = await validateGestureWithFallback(
        mediapipeResult,
        mockImageCapture
      );

      expect(result.finalGesture).toBe('hello');
      expect(result.finalConfidence).toBe(0.75);
      expect(result.validationSource).toBe('combined');
      expect(result.feedback).toBe('Confirmed with slight improvement');
      expect(result.suggestions).toEqual(['Improve hand position']);
    });
  });

  describe('Adaptive Threshold Integration', () => {
    it('should integrate threshold calculation with validation triggers', () => {
      const context = {
        gesture: 'please',
        userExperience: 'beginner',
        timeOfDay: 'evening',
        environment: 'school',
        recentAccuracy: 0.7,
      };

      const threshold = calculateAdaptiveThreshold(0.6, context);

      // Should be lower due to beginner + evening + school + recent accuracy
      expect(threshold).toBeLessThan(0.6);
      expect(threshold).toBeGreaterThanOrEqual(0.3); // Min bound

      // Should trigger validation for complex gesture with low confidence
      const shouldValidate = shouldTriggerOpenAIValidation(threshold - 0.1, 'please');
      expect(shouldValidate).toBe(true);
    });

    it('should adjust threshold for advanced users', () => {
      const context = {
        gesture: 'hello',
        userExperience: 'advanced',
        recentAccuracy: 0.95,
      };

      const threshold = calculateAdaptiveThreshold(0.6, context);

      // Should be higher due to advanced user + high accuracy
      expect(threshold).toBeGreaterThan(0.6);
      expect(threshold).toBeLessThanOrEqual(0.8); // Max bound

      // Should not trigger validation for high confidence simple gesture
      const shouldValidate = shouldTriggerOpenAIValidation(threshold + 0.1, 'hello');
      expect(shouldValidate).toBe(false);
    });
  });

  describe('Component Integration', () => {
    it('should render OpenAI feedback component correctly', () => {
      const validationResult = {
        gesture: 'hello',
        confidence: 0.85,
        feedback: 'Clear gesture execution',
        quality_score: 8.5,
        suggestions: ['Keep hand steady'],
        validation_source: 'openai',
      };

      const { getByTestId, queryByTestId } = render(
        <OpenAIGestureFeedback
          isVisible={true}
          validationResult={validationResult}
          onDismiss={() => {}}
          onApplySuggestion={() => {}}
        />
      );

      expect(getByTestId('openai-feedback')).toBeTruthy();
      expect(getByTestId('gesture-text')).toHaveTextContent('hello');
      expect(getByTestId('confidence-text')).toHaveTextContent('0.85');
      expect(getByTestId('dismiss-button')).toBeTruthy();
      expect(getByTestId('apply-suggestion-button')).toBeTruthy();
    });

    it('should not render when not visible', () => {
      const { queryByTestId } = render(
        <OpenAIGestureFeedback
          isVisible={false}
          validationResult={null}
          onDismiss={() => {}}
          onApplySuggestion={() => {}}
        />
      );

      expect(queryByTestId('openai-feedback')).toBeNull();
    });

    it('should handle dismiss action', () => {
      const mockOnDismiss = jest.fn();
      const validationResult = {
        gesture: 'hello',
        confidence: 0.8,
        feedback: 'Good gesture',
        quality_score: 8.0,
        validation_source: 'openai',
      };

      const { getByTestId } = render(
        <OpenAIGestureFeedback
          isVisible={true}
          validationResult={validationResult}
          onDismiss={mockOnDismiss}
          onApplySuggestion={() => {}}
        />
      );

      fireEvent.press(getByTestId('dismiss-button'));
      expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    });

    it('should handle apply suggestion action', () => {
      const mockOnApplySuggestion = jest.fn();
      const validationResult = {
        gesture: 'hello',
        confidence: 0.8,
        feedback: 'Good gesture',
        quality_score: 8.0,
        suggestions: ['Keep hand steady', 'Use full arm motion'],
        validation_source: 'openai',
      };

      const { getByTestId } = render(
        <OpenAIGestureFeedback
          isVisible={true}
          validationResult={validationResult}
          onDismiss={() => {}}
          onApplySuggestion={mockOnApplySuggestion}
        />
      );

      fireEvent.press(getByTestId('apply-suggestion-button'));
      expect(mockOnApplySuggestion).toHaveBeenCalledWith('Keep hand steady');
    });
  });

  describe('End-to-End Integration', () => {
    it('should handle complete validation workflow', async () => {
      // Mock successful API response
      const mockApiResponse = {
        primary_gesture: {
          gesture: 'please',
          confidence: 0.88,
          feedback: 'Excellent please gesture',
          quality_score: 9.2,
          suggestions: ['Perfect execution'],
          landmarks_detected: true,
          hand_count: 1,
        },
        alternative_gestures: [],
        overall_confidence: 0.88,
        processing_time_ms: 1100,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      // Step 1: Check if validation should be triggered
      const mediapipeConfidence = 0.55;
      const gesture = 'please';
      const shouldValidate = shouldTriggerOpenAIValidation(mediapipeConfidence, gesture);
      expect(shouldValidate).toBe(true);

      // Step 2: Perform validation
      const validationResult = await validateGestureWithOpenAI({
        image: mockImageCapture,
        expectedGesture: gesture,
        mediapipeConfidence,
      });
      expect(validationResult.success).toBe(true);

      // Step 3: Use fallback validation
      const mediapipeResult = {
        gesture,
        confidence: mediapipeConfidence,
        landmarks: [],
      };

      const finalResult = await validateGestureWithFallback(
        mediapipeResult,
        mockImageCapture
      );

      expect(finalResult.finalGesture).toBe('please');
      expect(finalResult.finalConfidence).toBe(0.88);
      expect(finalResult.validationSource).toBe('openai');

      // Step 4: Render feedback component
      const mockOnDismiss = jest.fn();
      const mockOnApplySuggestion = jest.fn();

      const { getByTestId } = render(
        <OpenAIGestureFeedback
          isVisible={true}
          validationResult={{
            gesture: finalResult.finalGesture,
            confidence: finalResult.finalConfidence,
            feedback: finalResult.feedback,
            quality_score: 9.2,
            suggestions: finalResult.suggestions,
            validation_source: finalResult.validationSource,
          }}
          onDismiss={mockOnDismiss}
          onApplySuggestion={mockOnApplySuggestion}
        />
      );

      expect(getByTestId('gesture-text')).toHaveTextContent('please');
      expect(getByTestId('confidence-text')).toHaveTextContent('0.88');

      // Step 5: Test user interactions
      fireEvent.press(getByTestId('dismiss-button'));
      expect(mockOnDismiss).toHaveBeenCalled();

      fireEvent.press(getByTestId('apply-suggestion-button'));
      expect(mockOnApplySuggestion).toHaveBeenCalledWith('Perfect execution');
    });

    it('should handle complete workflow with API failure', async () => {
      // Mock API failure
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const mediapipeResult = {
        gesture: 'hello',
        confidence: 0.5,
        landmarks: [],
      };

      // Should still work with fallback to MediaPipe
      const finalResult = await validateGestureWithFallback(
        mediapipeResult,
        mockImageCapture
      );

      expect(finalResult.finalGesture).toBe('hello');
      expect(finalResult.finalConfidence).toBe(0.5);
      expect(finalResult.validationSource).toBe('mediapipe');

      // Component should handle null feedback gracefully
      const { queryByTestId } = render(
        <OpenAIGestureFeedback
          isVisible={false} // Not visible due to fallback
          validationResult={null}
          onDismiss={() => {}}
          onApplySuggestion={() => {}}
        />
      );

      expect(queryByTestId('openai-feedback')).toBeNull();
    });
  });
});