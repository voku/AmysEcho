import { BatteryMonitor } from '../webview/core/BatteryMonitor';
import { ErrorRecoveryManager } from '../webview/utils/ErrorRecoveryManager';

// Ensure ReactNativeWebView exists for telemetry posts
beforeEach(() => {
  (window as any).ReactNativeWebView = {
    postMessage: jest.fn(),
  };
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  delete (window as any).ReactNativeWebView;
  delete (navigator as any).getBattery;
});

describe('BatteryMonitor', () => {
  const defineBattery = (level: number) => {
    Object.defineProperty(navigator, 'getBattery', {
      configurable: true,
      value: jest.fn().mockResolvedValue({
        level,
      }),
    });
  };

  it('activates emergency mode when battery is critical', async () => {
    defineBattery(0.03);
    const monitor = new BatteryMonitor();

    monitor.startMonitoring();
    await (monitor as any).checkBatteryLevel?.();

    expect((window.ReactNativeWebView?.postMessage as jest.Mock)).toHaveBeenCalledWith(
      expect.stringContaining('emergency_mode_activated'),
    );
    expect(monitor.getStatus().emergencyMode).toBe(true);
  });

  it('reports last check timestamp even when API unavailable', async () => {
    // Remove battery API so monitor falls back gracefully
    Object.defineProperty(navigator, 'getBattery', {
      configurable: true,
      value: undefined,
    });
    const monitor = new BatteryMonitor();

    monitor.startMonitoring();
    await (monitor as any).checkBatteryLevel?.();

    const status = monitor.getStatus();
    expect(status.level).toBeGreaterThan(0);
    expect(status.lastCheck).toBeGreaterThan(0);
  });
});

describe('ErrorRecoveryManager', () => {
  let manager: ErrorRecoveryManager;

  beforeEach(() => {
    manager = new ErrorRecoveryManager();
  });

  it('activates fallback mode after MediaPipe failures', () => {
    const retry = manager.recordFailure(new Error('MediaPipe crashed'), 'mediapipe processing');
    expect(retry).toBe(false);
    expect(manager.isInFallbackMode()).toBe(true);

    const telemetryCalls = (window.ReactNativeWebView?.postMessage as jest.Mock).mock.calls;
    const payloads = telemetryCalls.map(([arg]) => JSON.parse(arg as string));
    expect(payloads.some((event) => event.event === 'fallback_mode_activated')).toBe(true);
  });

  it('opens circuit breaker after repeated failures', () => {
    for (let i = 0; i < 5; i += 1) {
      manager.recordFailure(new Error('MediaPipe crashed'), 'mediapipe processing');
    }

    expect(manager.isCircuitBreakerOpen()).toBe(true);
    expect(manager.isInEmergencyMode()).toBe(true);

    const payloads = (window.ReactNativeWebView?.postMessage as jest.Mock).mock.calls
      .map(([arg]) => JSON.parse(arg as string));
    expect(payloads.some((event) => event.event === 'emergency_mode_activated')).toBe(true);
  });

  it('records successful recovery and clears breaker after timeout', () => {
    manager.recordFailure(new Error('MediaPipe crashed'), 'mediapipe processing');
    manager.recordSuccessfulRecovery('mediapipe processing');

    const payloads = (window.ReactNativeWebView?.postMessage as jest.Mock).mock.calls
      .map(([arg]) => JSON.parse(arg as string));
    expect(payloads.some((event) => event.event === 'recovery_successful')).toBe(true);

    jest.advanceTimersByTime(20);
    expect(manager.isCircuitBreakerOpen()).toBe(false);
  });
});
