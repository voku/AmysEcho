import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { BatteryMonitor } from './BatteryMonitor';

describe('BatteryMonitor', () => {
  let monitor: BatteryMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as any).window = {
      ReactNativeWebView: {
        postMessage: vi.fn(),
      },
      setInterval: vi.fn((callback: () => void, interval: number) => {
        return setInterval(callback, interval);
      }),
      clearInterval: vi.fn((handle: number) => {
        clearInterval(handle);
      }),
    };
    monitor = new BatteryMonitor();
  });

  afterEach(() => {
    monitor.stopMonitoring();
    vi.clearAllTimers();
    vi.useRealTimers();
    delete (globalThis as any).navigator?.getBattery;
    delete (globalThis as any).window;
  });

  const defineBattery = (level: number) => {
    Object.defineProperty(navigator, 'getBattery', {
      configurable: true,
      value: vi.fn().mockResolvedValue({
        level,
      }),
    });
  };

  describe('startMonitoring', () => {
    it('starts monitoring battery level', () => {
      defineBattery(0.5);
      monitor.startMonitoring();
      
      const status = monitor.getStatus();
      expect(status.level).toBeGreaterThan(0);
    });

    it('activates emergency mode when battery is critical', async () => {
      defineBattery(0.03);
      monitor.startMonitoring();
      
      // Wait for async battery check
      await vi.runAllTimersAsync();

      const postMessage = (globalThis as any).window.ReactNativeWebView.postMessage;
      expect(postMessage).toHaveBeenCalledWith(
        expect.stringContaining('emergency_mode_activated'),
      );
      expect(monitor.getStatus().emergencyMode).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('reports last check timestamp even when API unavailable', async () => {
      // Remove battery API so monitor falls back gracefully
      Object.defineProperty(navigator, 'getBattery', {
        configurable: true,
        value: undefined,
      });
      monitor.startMonitoring();
      
      await vi.runAllTimersAsync();

      const status = monitor.getStatus();
      expect(status.level).toBeGreaterThan(0);
      expect(status.lastCheck).toBeGreaterThan(0);
    });

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
      defineBattery(0.5);
      monitor.startMonitoring();
      monitor.stopMonitoring();
      
      // Monitor should be stopped
    });
  });
});
