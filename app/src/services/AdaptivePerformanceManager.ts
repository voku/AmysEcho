import type { SharedValue } from 'react-native-reanimated';

export type PerformanceProfile = {
  fps: number;
  lowPower: boolean;
};

export type DeviceModule = {
  getThermalStateAsync?: () => Promise<number>;
};

const getDeviceModule = async (): Promise<DeviceModule> => {
  const Device = await import('expo-device');
  return Device;
};

export class AdaptivePerformanceManager {
  private lowBattery = 0.2;
  private highThermal = 2; // >= Fair
  private device: DeviceModule | null = null;
  private frameInterval = 1000 / 8;
  private lastFrameTime = 0;

  constructor(
    device?: DeviceModule,
  ) {
    if (device) this.device = device;
  }

  private async ensureModules() {
    if (!this.device) {
      this.device = await getDeviceModule();
    }
  }

  async getProfile(): Promise<PerformanceProfile> {
    await this.ensureModules();
    // Battery module not required; default to full if unavailable to avoid bundling issues
    const level = 1.0;
    let thermal = 0;
    try {
      thermal = (await this.device!.getThermalStateAsync?.()) ?? 0;
    } catch {
      thermal = 0;
    }
    const lowPower = level < this.lowBattery || thermal >= this.highThermal;
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
