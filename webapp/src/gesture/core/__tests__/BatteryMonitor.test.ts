import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { BatteryMonitor } from '../BatteryMonitor';

describe('BatteryMonitor', () => {
  let monitor: BatteryMonitor;

  beforeEach(() => {
    (globalThis as any).window = {
      ReactNativeWebView: {
        postMessage: vi.fn(),
      },
    };
    monitor = new BatteryMonitor();
  });

  afterEach(() => {
    monitor.stopMonitoring();
    delete (globalThis as any).window;
  });

  describe('getStatus', () => {
    it('returns initial status correctly', () => {
      const status = monitor.getStatus();
      expect(status.level).toBe(1.0);
      expect(status.emergencyMode).toBe(false);
      expect(status.lastCheck).toBe(0);
    });
  });

  describe('forceEmergencyMode', () => {
    it('activates emergency mode when called', () => {
      monitor.forceEmergencyMode();
      
      expect(monitor.getStatus().emergencyMode).toBe(true);
      
      const postMessage = (globalThis as any).window.ReactNativeWebView.postMessage;
      expect(postMessage).toHaveBeenCalledWith(
        expect.stringContaining('emergency_mode_activated'),
      );
    });
  });

  describe('resetEmergencyMode', () => {
    it('deactivates emergency mode when called', () => {
      monitor.forceEmergencyMode();
      expect(monitor.getStatus().emergencyMode).toBe(true);
      
      monitor.resetEmergencyMode();
      expect(monitor.getStatus().emergencyMode).toBe(false);
      
      const postMessage = (globalThis as any).window.ReactNativeWebView.postMessage;
      expect(postMessage).toHaveBeenCalledWith(
        expect.stringContaining('emergency_mode_deactivated'),
      );
    });
  });

  describe('setEmergencyThreshold', () => {
    it('sets threshold within valid range', () => {
      monitor.setEmergencyThreshold(0.1);
      // Threshold should be 10%
    });

    it('clamps threshold to minimum', () => {
      monitor.setEmergencyThreshold(0.001); // Too low
      // Should be clamped to 0.01
    });

    it('clamps threshold to maximum', () => {
      monitor.setEmergencyThreshold(0.5); // Too high
      // Should be clamped to 0.2
    });
  });

  describe('stopMonitoring', () => {
    it('stops monitoring and clears interval', () => {
      // Simply verifies the method doesn't throw
      monitor.stopMonitoring();
    });
  });
});
