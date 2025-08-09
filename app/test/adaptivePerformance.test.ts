jest.mock('expo-battery', () => ({
  __esModule: true,
  getBatteryLevelAsync: jest.fn(),
}), { virtual: true });
jest.mock('expo-device', () => ({
  __esModule: true,
  getThermalStateAsync: jest.fn(),
}), { virtual: true });

import { AdaptivePerformanceManager } from '../src/services/AdaptivePerformanceManager';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';

describe('AdaptivePerformanceManager', () => {
  it('switches to low power when battery or thermal is bad', async () => {
    (Battery.getBatteryLevelAsync as jest.Mock).mockResolvedValue(0.1);
    (Device.getThermalStateAsync as jest.Mock).mockResolvedValue(1);
    const mgr = new AdaptivePerformanceManager(Battery as any, Device as any);
    const profile = await mgr.getProfile();
    expect(profile.lowPower).toBe(true);
    expect(profile.fps).toBe(5);
  });

  it('keeps high performance when conditions are good', async () => {
    (Battery.getBatteryLevelAsync as jest.Mock).mockResolvedValue(0.9);
    (Device.getThermalStateAsync as jest.Mock).mockResolvedValue(0);
    const mgr = new AdaptivePerformanceManager(Battery as any, Device as any);
    const profile = await mgr.getProfile();
    expect(profile.lowPower).toBe(false);
    expect(profile.fps).toBe(8);
  });
});

