import type { SharedValue } from 'react-native-reanimated';

export type PerformanceProfile = {
  fps: number;
  lowPower: boolean;
};

export type BatteryModule = {
  getBatteryLevelAsync: () => Promise<number>;
};

export type DeviceModule = {
  getThermalStateAsync?: () => Promise<number>;
};

const getBatteryModule = async (): Promise<BatteryModule> => {
  const Battery = await import('expo-battery');
  return Battery;
};

const getDeviceModule = async (): Promise<DeviceModule> => {
  const Device = await import('expo-device');
  return Device;
};

export class AdaptivePerformanceManager {
  private lowBattery = 0.2;
  private highThermal = 2; // >= Fair
  private battery: BatteryModule | null = null;
  private device: DeviceModule | null = null;

  constructor(
    battery?: BatteryModule,
    device?: DeviceModule,
  ) {
    if (battery) this.battery = battery;
    if (device) this.device = device;
  }

  private async ensureModules() {
    if (!this.battery) {
      this.battery = await getBatteryModule();
    }
    if (!this.device) {
      this.device = await getDeviceModule();
    }
  }

  async getProfile(): Promise<PerformanceProfile> {
    await this.ensureModules();
    const level = await this.battery!.getBatteryLevelAsync();
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
  }
}

