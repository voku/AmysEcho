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
      expect(status.lastCheck).toBe(0);
    });
  });

  describe('stopMonitoring', () => {
    it('stops monitoring and clears interval', () => {
      // Simply verifies the method doesn't throw
      monitor.stopMonitoring();
    });
  });
});
