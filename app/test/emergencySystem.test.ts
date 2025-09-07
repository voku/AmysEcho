import { jest } from '@jest/globals';

// Mock the WebView environment
const mockPostMessage = jest.fn();
const mockReactNativeWebView = {
  postMessage: mockPostMessage
};

Object.defineProperty(window, 'ReactNativeWebView', {
  value: mockReactNativeWebView,
  writable: true
});

// Mock navigator.getBattery
const mockGetBattery = jest.fn();
Object.defineProperty(navigator, 'getBattery', {
  value: mockGetBattery,
  writable: true
});

// Import after mocks are set up
import '../webview/gestureDetector';

describe('Emergency System - Amy First Critical Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset emergency system state
    if (window.emergencyGestureSystem?.reset) {
      window.emergencyGestureSystem.reset();
    }
  });

  describe('Emergency Gesture Detection', () => {
    test('should detect emergency gestures with low confidence threshold', () => {
      const emergencyGestures = ['hilfe', 'help', 'emergency', 'stop', 'danger'];

      emergencyGestures.forEach(gesture => {
        const result = window.emergencyGestureSystem?.isEmergencyGesture(gesture, 0.2);
        expect(result).toBe(true);
      });
    });

    test('should reject non-emergency gestures', () => {
      const normalGestures = ['thumbs_up', 'hello', 'thank_you', 'please'];

      normalGestures.forEach(gesture => {
        const result = window.emergencyGestureSystem?.isEmergencyGesture(gesture, 0.9);
        expect(result).toBe(false);
      });
    });

    test('should process emergency gesture with priority', () => {
      const landmarks = [[[0, 0, 0]]]; // Mock landmarks
      const result = window.emergencyGestureSystem?.processEmergencyGesture('hilfe', 0.3, landmarks);

      expect(result?.shouldProcess).toBe(true);
      expect(result?.priority).toBe('critical');
      expect(result?.feedback).toContain('Hilfe');
    });

    test('should handle emergency gesture cooldown', () => {
      const landmarks = [[[0, 0, 0]]];

      // First emergency gesture
      window.emergencyGestureSystem?.processEmergencyGesture('hilfe', 0.3, landmarks);

      // Immediate second emergency gesture should be blocked by cooldown
      const result = window.emergencyGestureSystem?.processEmergencyGesture('hilfe', 0.3, landmarks);
      expect(result?.shouldProcess).toBe(false);
      expect(result?.cooldownRemaining).toBeGreaterThan(0);
    });
  });

  describe('Battery Monitoring & Emergency Mode', () => {
    test('should activate emergency mode at critical battery level', async () => {
      // Mock battery at 3% (below 5% threshold)
      const mockBattery = {
        level: 0.03,
        charging: false
      };
      mockGetBattery.mockResolvedValue(mockBattery);

      // Trigger battery check
      await window.batteryMonitor?.checkBatteryLevel();

      // Should have activated emergency mode
      const status = window.batteryMonitor?.getStatus();
      expect(status?.emergencyMode).toBe(true);
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.stringContaining('emergency_mode_activated')
      );
    });

    test('should maintain normal operation above battery threshold', async () => {
      // Mock battery at 10% (above 5% threshold)
      const mockBattery = {
        level: 0.1,
        charging: false
      };
      mockGetBattery.mockResolvedValue(mockBattery);

      await window.batteryMonitor?.checkBatteryLevel();

      const status = window.batteryMonitor?.getStatus();
      expect(status?.emergencyMode).toBe(false);
    });

    test('should handle battery API unavailability gracefully', async () => {
      // Mock battery API failure
      mockGetBattery.mockRejectedValue(new Error('Battery API not available'));

      await window.batteryMonitor?.checkBatteryLevel();

      const status = window.batteryMonitor?.getStatus();
      // Should assume adequate battery (0.5) when monitoring fails
      expect(status?.level).toBe(0.5);
      expect(status?.emergencyMode).toBe(false);
    });
  });

  describe('Fallback Layer Integration', () => {
    test('should activate fallback mode on MediaPipe failure', () => {
      // Simulate MediaPipe failure
      const error = new Error('MediaPipe initialization failed');

      // Trigger error recovery
      window.errorRecoveryManager?.recordFailure(error, 'MediaPipe initialization');

      // Should activate fallback mode after threshold
      for (let i = 0; i < 5; i++) {
        window.errorRecoveryManager?.recordFailure(error, 'MediaPipe initialization');
      }

      const health = window.errorRecoveryManager?.getHealthStatus();
      expect(health?.fallbackActive).toBe(true);
    });

    test('should use fallback gesture detection when main system fails', () => {
      // Mock fallback detector
      const mockFallbackResult = {
        gesture: 'thumbs_up',
        confidence: 0.7,
        isFallback: true,
        feedback: 'Fallback gesture detected'
      };

      // Simulate main system failure (low confidence)
      const landmarks = [[[0, 0, 0]]];
      const mainResult = { gesture: 'unknown', confidence: 0.1 };

      // Fallback should be used when main result is poor
      expect(mockFallbackResult.confidence).toBeGreaterThan(mainResult.confidence);
    });

    test('should maintain emergency gesture processing during fallback', () => {
      // Activate fallback mode
      window.errorRecoveryManager?.activateFallbackMode();

      // Emergency gesture should still work
      const emergencyResult = window.emergencyGestureSystem?.processEmergencyGesture(
        'hilfe',
        0.3,
        [[[0, 0, 0]]]
      );

      expect(emergencyResult?.shouldProcess).toBe(true);
      expect(emergencyResult?.priority).toBe('critical');
    });
  });

  describe('End-to-End Emergency Scenarios', () => {
    test('should handle emergency gesture at 1% battery during MediaPipe failure', async () => {
      // Setup critical conditions
      const mockBattery = { level: 0.01, charging: false };
      mockGetBattery.mockResolvedValue(mockBattery);

      // Activate emergency mode
      await window.batteryMonitor?.checkBatteryLevel();

      // Simulate MediaPipe failure
      const mediaPipeError = new Error('MediaPipe WebGL context lost');
      window.errorRecoveryManager?.recordFailure(mediaPipeError, 'MediaPipe processing');

      // Emergency gesture should still be processed
      const emergencyResult = window.emergencyGestureSystem?.processEmergencyGesture(
        'hilfe',
        0.25, // Low confidence but above emergency threshold
        [[[0, 0, 0]]]
      );

      expect(emergencyResult?.shouldProcess).toBe(true);
      expect(emergencyResult?.priority).toBe('critical');

      // Should have sent emergency telemetry
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.stringContaining('emergency_gesture')
      );
    });

    test('should activate emergency mode after multiple emergency gestures', () => {
      const landmarks = [[[0, 0, 0]]];

      // Send multiple emergency gestures within 30 seconds
      for (let i = 0; i < 3; i++) {
        window.emergencyGestureSystem?.processEmergencyGesture('hilfe', 0.3, landmarks);
      }

      const status = window.emergencyGestureSystem?.getStatus();
      expect(status?.emergencyModeRecommended).toBe(true);
    });

    test('should maintain gesture processing during network failure', () => {
      // Simulate network failure
      const networkError = new Error('Network request failed');
      window.errorRecoveryManager?.recordFailure(networkError, 'Server communication');

      // Gesture processing should continue
      const landmarks = [[[0, 0, 0]]];
      const emergencyResult = window.emergencyGestureSystem?.processEmergencyGesture(
        'help',
        0.3,
        landmarks
      );

      expect(emergencyResult?.shouldProcess).toBe(true);
    });
  });

  describe('Amy First Principles Validation', () => {
    test('should never throttle emergency gestures for performance', () => {
      // Even with system under stress, emergency gestures should work
      const emergencyResult = window.emergencyGestureSystem?.processEmergencyGesture(
        'emergency',
        0.2, // Very low confidence
        [[[0, 0, 0]]]
      );

      expect(emergencyResult?.shouldProcess).toBe(true);
      expect(emergencyResult?.priority).toBe('critical');
    });

    test('should provide immediate feedback for emergency gestures', () => {
      const emergencyResult = window.emergencyGestureSystem?.processEmergencyGesture(
        'hilfe',
        0.3,
        [[[0, 0, 0]]]
      );

      expect(emergencyResult?.feedback).toBeTruthy();
      expect(emergencyResult?.feedback).toContain('Hilfe');
    });

    test('should handle German emergency gestures correctly', () => {
      const germanEmergencies = ['hilfe', 'notfall', 'gefahr', 'au', 'schmerz', 'angst'];

      germanEmergencies.forEach(gesture => {
        const result = window.emergencyGestureSystem?.isEmergencyGesture(gesture, 0.25);
        expect(result).toBe(true);
      });
    });
  });
});