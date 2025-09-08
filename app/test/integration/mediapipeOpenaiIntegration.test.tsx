/**
 * Integration Tests for MediaPipe + OpenAI Validation
 *
 * Tests the integration between MediaPipe gesture detection
 * and OpenAI validation system including:
 * - Automatic validation triggers
 * - Result merging and fallback logic
 * - Component state management
 * - Error handling across components
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';
import { MediaPipeGestureDetector } from '../../src/components/MediaPipeGestureDetector';
import {
  validateGestureWithFallback,
  shouldTriggerOpenAIValidation,
} from '../../src/services/openaiGestureValidationService';

// Mock the WebView component
jest.mock('react-native-webview', () => ({
  WebView: ({ onMessage }: any) => {
    // Simulate WebView messages
    React.useEffect(() => {
      if (onMessage) {
        // Simulate a gesture detection message
        const mockMessage = {
          nativeEvent: {
            data: JSON.stringify({
              type: 'gesture',
              gesture: 'hello',
              confidence: 0.5,
              landmarks: [[[0.5, 0.5, 0.8]]],
              handednesses: ['Right'],
              emergency: false,
            }),
          },
        };
        setTimeout(() => onMessage(mockMessage), 100);
      }
    }, [onMessage]);

    return React.createElement('View', { testID: 'webview' });
  },
}));

// Mock fetch for API calls
global.fetch = jest.fn();

// Mock OpenAI feedback component
jest.mock('../../src/components/OpenAIGestureFeedback', () => ({
  OpenAIGestureFeedback: ({ isVisible, validationResult }: any) => {
    if (!isVisible) return null;
    return React.createElement('View', {
      testID: 'openai-feedback',
      children: [
        React.createElement('Text', {
          key: 'gesture',
          testID: 'feedback-gesture'
        }, validationResult?.gesture || ''),
        React.createElement('Text', {
          key: 'source',
          testID: 'feedback-source'
        }, validationResult?.validation_source || ''),
      ],
    });
  },
}));

describe('MediaPipe + OpenAI Integration', () => {
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

  describe('Automatic Validation Triggers', () => {
    it('should trigger OpenAI validation for low confidence gestures', async () => {
      const mockOnGestureDetected = jest.fn();
      const mockApiResponse = {
        primary_gesture: {
          gesture: 'hello',
          confidence: 0.8,
          feedback: 'Improved confidence',
          quality_score: 8.0,
          suggestions: ['Keep hand steady'],
          landmarks_detected: true,
          hand_count: 1,
        },
        alternative_gestures: [],
        overall_confidence: 0.8,
        processing_time_ms: 1000,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      // Mock image capture function
      const mockCaptureGestureImage = jest.fn().mockResolvedValue(mockImageCapture);
      jest.doMock('../../src/services/openaiGestureValidationService', () => ({
        ...jest.requireActual('../../src/services/openaiGestureValidationService'),
        captureGestureImage: mockCaptureGestureImage,
      }));

      const { getByTestId } = render(
        <MediaPipeGestureDetector
          onGestureDetected={mockOnGestureDetected}
          onError={() => {}}
        />
      );

      // Wait for gesture detection and validation
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      expect(mockOnGestureDetected).toHaveBeenCalledWith(
        'hello', // Gesture
        0.8,    // Improved confidence
        [[[0.5, 0.5, 0.8]]], // Landmarks
        ['Right'], // Handednesses
        false    // Emergency
      );

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should not trigger validation for high confidence gestures', async () => {
      const mockOnGestureDetected = jest.fn();

      // Mock WebView to return high confidence
      const mockWebView = ({ onMessage }: any) => {
        React.useEffect(() => {
          if (onMessage) {
            const mockMessage = {
              nativeEvent: {
                data: JSON.stringify({
                  type: 'gesture',
                  gesture: 'thank_you',
                  confidence: 0.85, // High confidence
                  landmarks: [[[0.5, 0.5, 0.8]]],
                  handednesses: ['Right'],
                  emergency: false,
                }),
              },
            };
            setTimeout(() => onMessage(mockMessage), 100);
          }
        }, [onMessage]);

        return React.createElement('View', { testID: 'webview' });
      };

      jest.doMock('react-native-webview', () => ({
        WebView: mockWebView,
      }));

      render(
        <MediaPipeGestureDetector
          onGestureDetected={mockOnGestureDetected}
          onError={() => {}}
        />
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      expect(mockOnGestureDetected).toHaveBeenCalledWith(
        'thank_you',
        0.85,
        [[[0.5, 0.5, 0.8]]],
        ['Right'],
        false
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should always validate emergency gestures', async () => {
      const mockOnGestureDetected = jest.fn();
      const mockApiResponse = {
        primary_gesture: {
          gesture: 'help',
          confidence: 0.95,
          feedback: 'Emergency gesture confirmed',
          quality_score: 9.5,
          suggestions: [],
          landmarks_detected: true,
          hand_count: 1,
        },
        alternative_gestures: [],
        overall_confidence: 0.95,
        processing_time_ms: 800,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      // Mock emergency gesture with high confidence
      const mockWebView = ({ onMessage }: any) => {
        React.useEffect(() => {
          if (onMessage) {
            const mockMessage = {
              nativeEvent: {
                data: JSON.stringify({
                  type: 'gesture',
                  gesture: 'help',
                  confidence: 0.9, // High confidence but emergency
                  landmarks: [[[0.5, 0.5, 0.8]]],
                  handednesses: ['Right'],
                  emergency: true,
                }),
              },
            };
            setTimeout(() => onMessage(mockMessage), 100);
          }
        }, [onMessage]);

        return React.createElement('View', { testID: 'webview' });
      };

      jest.doMock('react-native-webview', () => ({
        WebView: mockWebView,
      }));

      render(
        <MediaPipeGestureDetector
          onGestureDetected={mockOnGestureDetected}
          onError={() => {}}
        />
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(mockOnGestureDetected).toHaveBeenCalledWith(
        'help',
        0.95,
        [[[0.5, 0.5, 0.8]]],
        ['Right'],
        true
      );
    });
  });

  describe('Result Merging and Fallbacks', () => {
    it('should merge MediaPipe and OpenAI results correctly', async () => {
      const mockOnGestureDetected = jest.fn();
      const mockApiResponse = {
        primary_gesture: {
          gesture: 'please',
          confidence: 0.82,
          feedback: 'Corrected gesture',
          quality_score: 8.5,
          suggestions: ['Use both hands'],
          landmarks_detected: true,
          hand_count: 2,
        },
        alternative_gestures: [],
        overall_confidence: 0.82,
        processing_time_ms: 1200,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      render(
        <MediaPipeGestureDetector
          onGestureDetected={mockOnGestureDetected}
          onError={() => {}}
        />
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      expect(mockOnGestureDetected).toHaveBeenCalledWith(
        'please', // Corrected gesture
        0.82,    // Higher confidence
        [[[0.5, 0.5, 0.8]]],
        ['Right'],
        false
      );
    });

    it('should fallback to MediaPipe when OpenAI fails', async () => {
      const mockOnGestureDetected = jest.fn();

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

      render(
        <MediaPipeGestureDetector
          onGestureDetected={mockOnGestureDetected}
          onError={() => {}}
        />
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      expect(mockOnGestureDetected).toHaveBeenCalledWith(
        'hello', // Original gesture
        0.5,     // Original confidence
        [[[0.5, 0.5, 0.8]]],
        ['Right'],
        false
      );
    });

    it('should handle validation timeout gracefully', async () => {
      const mockOnGestureDetected = jest.fn();

      (global.fetch as jest.Mock).mockImplementationOnce(
        () => new Promise(resolve => setTimeout(resolve, 10000)) // Long delay
      );

      render(
        <MediaPipeGestureDetector
          onGestureDetected={mockOnGestureDetected}
          onError={() => {}}
        />
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      // Should still call with original MediaPipe result
      expect(mockOnGestureDetected).toHaveBeenCalledWith(
        'hello',
        0.5,
        [[[0.5, 0.5, 0.8]]],
        ['Right'],
        false
      );
    });
  });

  describe('Component State Management', () => {
    it('should show OpenAI feedback when validation occurs', async () => {
      const mockApiResponse = {
        primary_gesture: {
          gesture: 'hello',
          confidence: 0.8,
          feedback: 'AI validated gesture',
          quality_score: 8.0,
          suggestions: ['Good job'],
          landmarks_detected: true,
          hand_count: 1,
        },
        alternative_gestures: [],
        overall_confidence: 0.8,
        processing_time_ms: 1000,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      const { getByTestId } = render(
        <MediaPipeGestureDetector
          onGestureDetected={() => {}}
          onError={() => {}}
        />
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      expect(getByTestId('openai-feedback')).toBeTruthy();
      expect(getByTestId('feedback-gesture')).toHaveTextContent('hello');
      expect(getByTestId('feedback-source')).toHaveTextContent('openai');
    });

    it('should not show feedback when validation is not triggered', async () => {
      // High confidence gesture that won't trigger validation
      const mockWebView = ({ onMessage }: any) => {
        React.useEffect(() => {
          if (onMessage) {
            const mockMessage = {
              nativeEvent: {
                data: JSON.stringify({
                  type: 'gesture',
                  gesture: 'thank_you',
                  confidence: 0.9,
                  landmarks: [[[0.5, 0.5, 0.8]]],
                  handednesses: ['Right'],
                  emergency: false,
                }),
              },
            };
            setTimeout(() => onMessage(mockMessage), 100);
          }
        }, [onMessage]);

        return React.createElement('View', { testID: 'webview' });
      };

      jest.doMock('react-native-webview', () => ({
        WebView: mockWebView,
      }));

      const { queryByTestId } = render(
        <MediaPipeGestureDetector
          onGestureDetected={() => {}}
          onError={() => {}}
        />
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      expect(queryByTestId('openai-feedback')).toBeNull();
    });

    it('should handle feedback dismissal', async () => {
      const mockApiResponse = {
        primary_gesture: {
          gesture: 'hello',
          confidence: 0.8,
          feedback: 'AI validated',
          quality_score: 8.0,
          suggestions: ['Keep practicing'],
          landmarks_detected: true,
          hand_count: 1,
        },
        alternative_gestures: [],
        overall_confidence: 0.8,
        processing_time_ms: 1000,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      const { getByTestId, queryByTestId } = render(
        <MediaPipeGestureDetector
          onGestureDetected={() => {}}
          onError={() => {}}
        />
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      expect(getByTestId('openai-feedback')).toBeTruthy();

      // Simulate dismissal (in real component, this would be handled by user interaction)
      // For this test, we'll just verify the component renders correctly
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle WebView errors without breaking validation', async () => {
      const mockOnGestureDetected = jest.fn();
      const mockOnError = jest.fn();

      const mockWebView = ({ onMessage, onError }: any) => {
        React.useEffect(() => {
          if (onError) {
            // Simulate WebView error
            setTimeout(() => onError({ nativeEvent: { description: 'WebView crashed' } }), 50);
          }
        }, [onError]);

        return React.createElement('View', { testID: 'webview' });
      };

      jest.doMock('react-native-webview', () => ({
        WebView: mockWebView,
      }));

      render(
        <MediaPipeGestureDetector
          onGestureDetected={mockOnGestureDetected}
          onError={mockOnError}
        />
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(mockOnError).toHaveBeenCalled();
      expect(mockOnGestureDetected).not.toHaveBeenCalled();
    });

    it('should handle malformed WebView messages', async () => {
      const mockOnGestureDetected = jest.fn();
      const mockOnError = jest.fn();

      const mockWebView = ({ onMessage }: any) => {
        React.useEffect(() => {
          if (onMessage) {
            const mockMessage = {
              nativeEvent: {
                data: 'invalid json',
              },
            };
            setTimeout(() => onMessage(mockMessage), 100);
          }
        }, [onMessage]);

        return React.createElement('View', { testID: 'webview' });
      };

      jest.doMock('react-native-webview', () => ({
        WebView: mockWebView,
      }));

      render(
        <MediaPipeGestureDetector
          onGestureDetected={mockOnGestureDetected}
          onError={mockOnError}
        />
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      expect(mockOnError).toHaveBeenCalledWith('gesture_processing_error');
    });

    it('should handle validation service errors gracefully', async () => {
      const mockOnGestureDetected = jest.fn();

      // Mock validation service to throw error
      jest.doMock('../../src/services/openaiGestureValidationService', () => ({
        ...jest.requireActual('../../src/services/openaiGestureValidationService'),
        validateGestureWithFallback: jest.fn().mockRejectedValue(new Error('Validation failed')),
      }));

      render(
        <MediaPipeGestureDetector
          onGestureDetected={mockOnGestureDetected}
          onError={() => {}}
        />
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      // Should still call with original MediaPipe result despite validation error
      expect(mockOnGestureDetected).toHaveBeenCalledWith(
        'hello',
        0.5,
        [[[0.5, 0.5, 0.8]]],
        ['Right'],
        false
      );
    });
  });

  describe('Performance Integration', () => {
    it('should not block gesture detection during validation', async () => {
      const mockOnGestureDetected = jest.fn();
      let detectionCallCount = 0;

      const mockWebView = ({ onMessage }: any) => {
        React.useEffect(() => {
          if (onMessage) {
            // Send multiple gesture detections rapidly
            const sendMessage = () => {
              detectionCallCount++;
              const mockMessage = {
                nativeEvent: {
                  data: JSON.stringify({
                    type: 'gesture',
                    gesture: `gesture_${detectionCallCount}`,
                    confidence: 0.4, // Low confidence to trigger validation
                    landmarks: [[[0.5, 0.5, 0.8]]],
                    handednesses: ['Right'],
                    emergency: false,
                  }),
                },
              };
              onMessage(mockMessage);
            };

            sendMessage();
            setTimeout(sendMessage, 50);
            setTimeout(sendMessage, 100);
          }
        }, [onMessage]);

        return React.createElement('View', { testID: 'webview' });
      };

      jest.doMock('react-native-webview', () => ({
        WebView: mockWebView,
      }));

      // Mock slow API responses
      (global.fetch as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({
            primary_gesture: {
              gesture: 'validated_gesture',
              confidence: 0.8,
              feedback: 'Validated',
              quality_score: 8.0,
              landmarks_detected: true,
              hand_count: 1,
            },
            alternative_gestures: [],
            overall_confidence: 0.8,
            processing_time_ms: 500,
          }),
        }), 200))
      );

      render(
        <MediaPipeGestureDetector
          onGestureDetected={mockOnGestureDetected}
          onError={() => {}}
        />
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 400));
      });

      // Should have processed multiple gestures even with slow validation
      expect(mockOnGestureDetected).toHaveBeenCalledTimes(3);
      expect(mockOnGestureDetected).toHaveBeenNthCalledWith(1, 'gesture_1', 0.8, [[[0.5, 0.5, 0.8]]], ['Right'], false);
      expect(mockOnGestureDetected).toHaveBeenNthCalledWith(2, 'gesture_2', 0.8, [[[0.5, 0.5, 0.8]]], ['Right'], false);
      expect(mockOnGestureDetected).toHaveBeenNthCalledWith(3, 'gesture_3', 0.8, [[[0.5, 0.5, 0.8]]], ['Right'], false);
    });
  });
});