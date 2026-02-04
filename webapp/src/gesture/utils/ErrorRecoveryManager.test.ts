import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { ErrorRecoveryManager } from './ErrorRecoveryManager';

describe('ErrorRecoveryManager', () => {
  let manager: ErrorRecoveryManager;

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as any).window = {
      ReactNativeWebView: {
        postMessage: vi.fn(),
      },
    };
    manager = new ErrorRecoveryManager();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    delete (globalThis as any).window;
  });

  describe('getErrorInfo', () => {
    it('identifies network errors', () => {
      const error = new Error('Network request failed');
      const info = manager.getErrorInfo(error, 'fetch data');
      expect(info.code).toBe('NETWORK_ERROR');
      expect(info.severity).toBe('medium');
    });

    it('identifies camera errors', () => {
      const error = new Error('Camera permission denied');
      const info = manager.getErrorInfo(error, 'camera access');
      expect(info.code).toBe('CAMERA_ERROR');
      expect(info.severity).toBe('high');
    });

    it('identifies MediaPipe errors', () => {
      const error = new Error('WebGL context failed to initialize');
      const info = manager.getErrorInfo(error, 'gesture detection');
      expect(info.code).toBe('MEDIAPIPE_ERROR');
      expect(info.recoverable).toBe(true);
    });

    it('identifies memory errors', () => {
      const error = new Error('Out of memory');
      const info = manager.getErrorInfo(error, 'processing');
      expect(info.code).toBe('MEMORY_ERROR');
      expect(info.severity).toBe('high');
    });

    it('provides German user messages', () => {
      const error = new Error('Network timeout');
      const info = manager.getErrorInfo(error, 'connection');
      expect(info.userMessage).toMatch(/Verbindung|Wiederherstellung/i);
    });
  });

  describe('recordFailure', () => {
    it('activates fallback mode after MediaPipe failures', () => {
      const error = new Error('MediaPipe crashed');
      manager.recordFailure(error, 'mediapipe processing');
      expect(manager.isInFallbackMode()).toBe(true);
    });

    it('sends telemetry when fallback mode activates', () => {
      const error = new Error('MediaPipe crashed');
      manager.recordFailure(error, 'mediapipe processing');
      
      const postMessage = (globalThis as any).window.ReactNativeWebView.postMessage;
      const calls = postMessage.mock.calls;
      const payloads = calls.map(([arg]: [string]) => JSON.parse(arg));
      expect(payloads.some((p: any) => p.event === 'fallback_mode_activated')).toBe(true);
    });

    it('opens circuit breaker after repeated failures', () => {
      for (let i = 0; i < 5; i += 1) {
        manager.recordFailure(new Error('MediaPipe crashed'), 'mediapipe processing');
      }

      expect(manager.isCircuitBreakerOpen()).toBe(true);
    });

    it('resets failure count outside failure window', () => {
      manager.recordFailure(new Error('Error 1'), 'test');
      vi.advanceTimersByTime(70000); // More than 60 second failure window
      manager.recordFailure(new Error('Error 2'), 'test');
      
      const status = manager.getHealthStatus();
      expect(status.failureCount).toBe(1);
    });
  });

  describe('recordSuccessfulRecovery', () => {
    it('sends recovery telemetry', () => {
      manager.recordFailure(new Error('Error'), 'test');
      manager.recordSuccessfulRecovery('test');

      const postMessage = (globalThis as any).window.ReactNativeWebView.postMessage;
      const payloads = postMessage.mock.calls.map(([arg]: [string]) => JSON.parse(arg));
      expect(payloads.some((p: any) => p.event === 'recovery_successful')).toBe(true);
    });
  });

  describe('circuit breaker auto-close', () => {
    it('clears breaker after timeout', () => {
      for (let i = 0; i < 5; i += 1) {
        manager.recordFailure(new Error('MediaPipe crashed'), 'mediapipe processing');
      }
      expect(manager.isCircuitBreakerOpen()).toBe(true);
      
      vi.advanceTimersByTime(20); // Test timeout is short
      expect(manager.isCircuitBreakerOpen()).toBe(false);
    });
  });

  describe('canAttemptRecovery', () => {
    it('returns false when circuit breaker is open', () => {
      for (let i = 0; i < 5; i += 1) {
        manager.recordFailure(new Error('Error'), 'mediapipe processing');
      }
      expect(manager.canAttemptRecovery('test')).toBe(false);
    });

    it('returns false within cooldown period', () => {
      manager.recordSuccessfulRecovery('test');
      expect(manager.canAttemptRecovery('other')).toBe(false);
      
      vi.advanceTimersByTime(6000); // Past recovery cooldown
      expect(manager.canAttemptRecovery('other')).toBe(true);
    });
  });

  describe('reset', () => {
    it('resets all state', () => {
      manager.recordFailure(new Error('Error'), 'mediapipe processing');
      manager.reset();
      
      const status = manager.getHealthStatus();
      expect(status.healthy).toBe(true);
      expect(status.fallbackActive).toBe(false);
      expect(status.failureCount).toBe(0);
    });
  });

  describe('getHealthStatus', () => {
    it('returns healthy status initially', () => {
      const status = manager.getHealthStatus();
      expect(status.healthy).toBe(true);
      expect(status.fallbackActive).toBe(false);
    });

    it('reflects unhealthy state after failures', () => {
      for (let i = 0; i < 5; i += 1) {
        manager.recordFailure(new Error('Error'), 'mediapipe processing');
      }
      
      const status = manager.getHealthStatus();
      expect(status.healthy).toBe(false);
      expect(status.circuitBreakerOpen).toBe(true);
    });
  });
});
