import { jest } from '@jest/globals';

import { gestureDetectorBase64 } from '../src/webview/gestureDetectorBase64';
import { FallbackGestureDetector } from '../webview/core/FallbackGestureDetector';
import { EmergencyGestureSystem } from '../webview/core/EmergencyGestureSystem';
import { ErrorRecoveryManager } from '../webview/utils/ErrorRecoveryManager';
import { BatteryMonitor } from '../webview/core/BatteryMonitor';

const createThumbsUpLandmarks = (): number[][] => {
  const hand = Array.from({ length: 21 }, () => [0, 0, 0]);
  // Handwurzel
  hand[0] = [0, 0, 0];
  // Daumen gestreckt nach oben
  hand[3] = [0, 0.2, 0];
  hand[4] = [0, -0.6, 0];
  // Andere Finger eingeklappt (Spitzen unter Gelenken)
  hand[6] = [0.1, 0.4, 0];
  hand[7] = [0.1, 0.5, 0];
  hand[8] = [0.1, 0.8, 0];
  hand[10] = [0.2, 0.45, 0];
  hand[11] = [0.2, 0.6, 0];
  hand[12] = [0.2, 0.85, 0];
  hand[14] = [0.3, 0.5, 0];
  hand[15] = [0.3, 0.65, 0];
  hand[16] = [0.3, 0.9, 0];
  hand[18] = [0.4, 0.55, 0];
  hand[19] = [0.4, 0.7, 0];
  hand[20] = [0.4, 0.95, 0];
  return hand;
};

describe('Fallback System – Offline WebView Workflow', () => {
  let postMessageMock: jest.Mock;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  beforeEach(() => {
    postMessageMock = jest.fn();
    Object.defineProperty(window, 'ReactNativeWebView', {
      value: { postMessage: postMessageMock },
      configurable: true,
      writable: true,
    });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('betreibt das Bundle komplett inline ohne Netzwerkzugriffe', () => {
    const decoded = Buffer.from(gestureDetectorBase64.replace(/\s+/g, ''), 'base64').toString('utf8');

    expect(decoded).toContain('Generated from app/webview/gestureDetector.ts');
    expect(decoded).toContain('ReactNativeWebView');
  });

  it('erkennt Daumen hoch über die regelbasierte Fallback-Erkennung', () => {
    const fallback = new FallbackGestureDetector();
    const { gesture, confidence, isFallback } = fallback.detectGesture([
      createThumbsUpLandmarks(),
    ]);

    expect(isFallback).toBe(true);
    expect(gesture).toBe('thumbs_up');
    expect(confidence).toBeGreaterThan(0.4);
  });

  it('priorisiert Notfall-Gesten selbst bei geringer Sicherheit', () => {
    const emergencySystem = new EmergencyGestureSystem();
    const result = emergencySystem.processEmergencyGesture('hilfe', 0.3, [[[0, 0, 0]]]);

    expect(result.shouldProcess).toBe(true);
    expect(result.priority).toBe('critical');
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('"type":"emergency_gesture"'),
    );
  });

  it('öffnet und schließt den Sicherungsautomaten nach Fehlerwelle', () => {
    const recoveryManager = new ErrorRecoveryManager();
    jest.setSystemTime(0);

    for (let i = 0; i < 6; i++) {
      recoveryManager.recordFailure(new Error('MediaPipe processing failed'), 'mediapipe');
    }

    expect(recoveryManager.getHealthStatus().circuitBreakerOpen).toBe(true);

    jest.advanceTimersByTime(20);
    jest.setSystemTime(20);

    expect(recoveryManager.getHealthStatus().circuitBreakerOpen).toBe(false);
  });

  it('aktiviert den Batterienotmodus komplett offline', async () => {
    const monitor = new BatteryMonitor();
    const getBatteryMock = jest.fn().mockResolvedValue({ level: 0.01 });

    Object.defineProperty(navigator, 'getBattery', {
      configurable: true,
      value: getBatteryMock,
      writable: true,
    });

    await (monitor as any).checkBatteryLevel();

    const status = monitor.getStatus();
    expect(status.emergencyMode).toBe(true);
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('"type":"emergency_mode_activated"'),
    );
  });
});
