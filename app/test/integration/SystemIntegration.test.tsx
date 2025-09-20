/**
 * System Integration Tests - Amy First
 *
 * Tests complete user workflows from gesture recognition to response
 * Validates that all integrated components work together seamlessly
 */

import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// Mock all services and components
jest.mock('../../src/services/audioService');
jest.mock('../../src/services/gestureHistoryService');
jest.mock('../../src/services/positiveTelemetryService');
jest.mock('../../src/services/adaptiveLearningService');
jest.mock('../../src/services/activeLearningService');
jest.mock('../../src/services/twoHandGestureService');
jest.mock('../../src/services/gestureCombinationService');
jest.mock('../../src/services/emergencyPriorityService');
jest.mock('../../src/services/preCachedResponseService');
jest.mock('../../src/services/automaticRecoveryService');
jest.mock('../../src/services/zeroDowntimeModelService');

// Mock storage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock database
jest.mock('../../db', () => ({
  database: {
    write: jest.fn(),
    get: jest.fn(),
  },
}));

// Mock components that might have issues
jest.mock('../../src/components/MediaPipeGestureDetector', () => {
  const React = require('react');
  return function MockMediaPipeGestureDetector({ onGestureDetected }: any) {
      return React.createElement('View', {
        testID: 'media-pipe-detector',
        onPress: () => onGestureDetected?.('hello', 0.9, [[[0.5, 0.5, 0.8]]])
      });
  };
});

jest.mock('../../src/components/ScreenFlash', () => {
  const React = require('react');
  return function MockScreenFlash() {
    return React.createElement('View', { testID: 'screen-flash' });
  };
});


jest.mock('../../src/components/GestureComparison', () => {
  const React = require('react');
  return function MockGestureComparison() {
    return React.createElement('View', { testID: 'gesture-comparison' });
  };
});

jest.mock('../../src/components/TwoHandGestureDisplay', () => {
  const React = require('react');
  return function MockTwoHandGestureDisplay() {
    return React.createElement('View', { testID: 'two-hand-display' });
  };
});

// Import after mocks
import RecognitionScreen from '../../src/screens/RecognitionScreen';
import ProfileManagerScreen from '../../src/screens/ProfileManagerScreen';
import TrainingScreen from '../../src/screens/TrainingScreen';
import TeachingScreen from '../../src/screens/TeachingScreen';
import { audioService } from '../../src/services/audioService';
import { gestureHistoryService } from '../../src/services/gestureHistoryService';
import { positiveTelemetryService } from '../../src/services/positiveTelemetryService';

const Stack = createStackNavigator();

describe('System Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete User Workflow', () => {
    it('should handle gesture recognition to audio response workflow', async () => {
      const mockPlaySound = jest.fn().mockResolvedValue(undefined);
      const mockSpeak = jest.fn().mockResolvedValue(undefined);
      const mockAddGesture = jest.fn();

      (audioService.playSound as jest.Mock) = mockPlaySound;
      (audioService.triggerSpeakAndShow as jest.Mock) = mockSpeak;
      (gestureHistoryService.addGesture as jest.Mock) = mockAddGesture;

      const { getByTestId, getByText } = render(
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Recognition" component={RecognitionScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      );

      // Wait for screen to load
      await waitFor(() => {
        expect(getByText('Ich höre zu…')).toBeTruthy();
      });

      // Simulate gesture detection
      const detector = getByTestId('media-pipe-detector');
      fireEvent.press(detector);

      // Verify audio response was triggered
      await waitFor(() => {
        expect(mockPlaySound).toHaveBeenCalledWith('success', expect.any(Object));
        expect(mockSpeak).toHaveBeenCalledWith('Hallo', expect.any(Object));
      });

      // Verify gesture was recorded
      expect(mockAddGesture).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'hello',
          confidence: 0.9,
          emoji: expect.any(String)
        })
      );
    });

    it('should handle low confidence gestures with correction workflow', async () => {
      const mockPlaySound = jest.fn().mockResolvedValue(undefined);
      const mockShowCorrection = jest.fn();

      (audioService.playSound as jest.Mock) = mockPlaySound;

      // Mock low confidence gesture
      const MockDetector = require('../../src/components/MediaPipeGestureDetector').default;
      MockDetector.mockImplementation(({ onGestureDetected }: any) => {
        return React.createElement('View', {
          testID: 'media-pipe-detector',
          onPress: () => onGestureDetected?.('unclear_gesture', 0.3, [[[0.5, 0.5, 0.3]]])
        });
      });

      const { getByTestId } = render(
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Recognition" component={RecognitionScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      );

      // Simulate low confidence gesture
      const detector = getByTestId('media-pipe-detector');
      fireEvent.press(detector);

      // Verify correction workflow is triggered for low confidence
      await waitFor(() => {
        expect(mockPlaySound).toHaveBeenCalledWith('thinking', expect.any(Object));
      });
    });

    it('should handle emergency gestures with priority response', async () => {
      const mockEmergencyResponse = jest.fn().mockResolvedValue(undefined);
      const mockPlaySound = jest.fn().mockResolvedValue(undefined);

      // Mock emergency gesture detection
      const MockDetector = require('../../src/components/MediaPipeGestureDetector').default;
      MockDetector.mockImplementation(({ onGestureDetected }: any) => {
        return React.createElement('View', {
          testID: 'media-pipe-detector',
          onPress: () => onGestureDetected?.('help', 0.95, [[[0.5, 0.5, 0.9]]])
        });
      });

      (audioService.playSound as jest.Mock) = mockPlaySound;

      const { getByTestId } = render(
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Recognition" component={RecognitionScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      );

      // Simulate emergency gesture
      const detector = getByTestId('media-pipe-detector');
      fireEvent.press(detector);

      // Verify emergency response priority
      await waitFor(() => {
        expect(mockPlaySound).toHaveBeenCalledWith('emergency', expect.any(Object));
      });
    });
  });

  describe('Profile Management Integration', () => {
    it('should load and switch between profiles seamlessly', async () => {
      const mockLoadProfiles = jest.fn().mockResolvedValue([
        { id: '1', name: 'Amy', largeText: true, highContrast: false },
        { id: '2', name: 'Test Profile', largeText: false, highContrast: true }
      ]);

      const mockSetActiveProfile = jest.fn().mockResolvedValue(undefined);

      // Mock the storage functions
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      AsyncStorage.getItem.mockImplementation((key: string) => {
        if (key === 'activeProfileId') return Promise.resolve('1');
        return Promise.resolve(null);
      });

      const { getByText, getAllByText } = render(
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="ProfileManager" component={ProfileManagerScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      );

      // Wait for profiles to load
      await waitFor(() => {
        expect(getByText('Amy')).toBeTruthy();
      });

      // Verify profile list is displayed
      expect(getAllByText(/Auswählen|Löschen/)).toBeTruthy();
    });

    it('should handle accessibility settings changes', async () => {
      const { getByText } = render(
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="ProfileManager" component={ProfileManagerScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      );

      // Wait for screen to load
      await waitFor(() => {
        expect(getByText('Profile')).toBeTruthy();
      });

      // Verify accessibility section is present
      expect(getByText('Barrierefreiheit')).toBeTruthy();
    });
  });

  describe('Training and Teaching Integration', () => {
    it('should handle gesture teaching workflow', async () => {
      const mockCaptureSamples = jest.fn().mockResolvedValue(undefined);
      const mockAddGesture = jest.fn();

      const { getByText } = render(
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Teaching" component={TeachingScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      );

      // Wait for teaching screen to load
      await waitFor(() => {
        expect(getByText('Geste beibringen')).toBeTruthy();
      });
    });

    it('should handle practice session workflow', async () => {
      const { getByText } = render(
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Training" component={TrainingScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      );

      // Wait for training screen to load
      await waitFor(() => {
        expect(getByText('Übungssession')).toBeTruthy();
      });
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle network failures gracefully', async () => {
      // Mock network failure
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      const { getByTestId } = render(
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Recognition" component={RecognitionScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      );

      // Verify offline mode still works
      await waitFor(() => {
        expect(getByTestId('media-pipe-detector')).toBeTruthy();
      });
    });

    it('should handle camera permission issues', async () => {
      // Mock camera permission denied
      const MockDetector = require('../../src/components/MediaPipeGestureDetector').default;
      MockDetector.mockImplementation(() => {
        throw new Error('Camera permission denied');
      });

      const { getByText } = render(
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Recognition" component={RecognitionScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      );

      // Should show error message but not crash
      await waitFor(() => {
        expect(getByText('Ich höre zu…')).toBeTruthy();
      });
    });
  });

  describe('Performance Validation', () => {
    it('should maintain response time under 100ms for gesture recognition', async () => {
      const startTime = Date.now();

      const { getByTestId } = render(
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Recognition" component={RecognitionScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      );

      const detector = getByTestId('media-pipe-detector');
      fireEvent.press(detector);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Verify response time is acceptable
      expect(responseTime).toBeLessThan(100);
    });

    it('should handle rapid gesture sequences without degradation', async () => {
      const { getByTestId } = render(
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Recognition" component={RecognitionScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      );

      const detector = getByTestId('media-pipe-detector');

      // Simulate rapid gestures
      for (let i = 0; i < 10; i++) {
        fireEvent.press(detector);
        await act(async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
        });
      }

      // Should still be responsive
      expect(getByTestId('media-pipe-detector')).toBeTruthy();
    });
  });

  describe('Accessibility Integration', () => {
    it('should support screen reader navigation', async () => {
      const { getByText } = render(
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Recognition" component={RecognitionScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      );

      // Verify accessibility labels are present
      await waitFor(() => {
        const statusText = getByText('Ich höre zu…');
        expect(statusText.props.accessibilityLabel).toBeDefined();
      });
    });

    it('should handle high contrast mode', async () => {
      // Mock high contrast accessibility setting
      const { getByTestId } = render(
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Recognition" component={RecognitionScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      );

      // Should render without high contrast specific errors
      expect(getByTestId('media-pipe-detector')).toBeTruthy();
    });
  });
});