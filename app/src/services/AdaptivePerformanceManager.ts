import type { SharedValue } from 'react-native-reanimated';
import type * as Battery from 'expo-battery';
import type * as Device from 'expo-device';

export type PerformanceProfile = {
  fps: number;
  lowPower: boolean;
};

export class AdaptivePerformanceManager {
  private lowBatteryThreshold = 0.2;
  private highThermalState: number; // Device.ThermalState.SERIOUS
  private frameInterval = 1000 / 8;
  private lastFrameTime = 0;

  private batteryModule?: typeof Battery;
  private deviceModule?: typeof Device;

  constructor(battery?: typeof Battery, device?: typeof Device) {
    this.batteryModule = battery;
    this.deviceModule = device;
    this.highThermalState = this.deviceModule?.ThermalState?.SERIOUS ?? 3;
  }

  async getProfile(): Promise<PerformanceProfile> {
    let lowPower = false;
    try {
      if (this.batteryModule) {
        const batteryLevel = await this.batteryModule.getBatteryLevelAsync();
        if (batteryLevel !== -1 && batteryLevel <= this.lowBatteryThreshold) {
          lowPower = true;
        }
      }
      if (this.deviceModule && !lowPower) {
        const thermalState = await this.deviceModule.getThermalStateAsync();
        if (thermalState >= this.highThermalState) {
          lowPower = true;
        }
      }
    } catch (e) {
      // Fails silently if modules are unavailable
    }

    return {
      fps: lowPower ? 5 : 8,
      lowPower,
    };
  }

  async apply(targetFps: SharedValue<number>, setLowPower: (low: boolean) => void) {
    const profile = await this.getProfile();
    targetFps.value = profile.fps;
    setLowPower(profile.lowPower);
    this.frameInterval =
      profile.fps > 0 ? 1000 / profile.fps : Number.POSITIVE_INFINITY;
  }

  shouldProcess(): boolean {
    const now = Date.now();
    if (now - this.lastFrameTime >= this.frameInterval) {
      this.lastFrameTime = now;
      return true;
    }
    return false;
  }
}
