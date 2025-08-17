import type { SharedValue } from 'react-native-reanimated';

export type PerformanceProfile = {
  fps: number;
  lowPower: boolean;
};

// Note: We avoid importing optional native modules (expo-device/expo-battery)
// in dev-client to prevent Metro resolution errors. Thermal/battery hints are
// treated as unavailable and we use a safe, fixed profile instead.

export class AdaptivePerformanceManager {
  private lowBattery = 0.2;
  private highThermal = 2; // kept for future use if modules are added
  private frameInterval = 1000 / 8;
  private lastFrameTime = 0;

  constructor(
    device?: unknown,
  ) {
    // Optional device module intentionally ignored to keep dev-client simple
  }

  private async ensureModules() {}

  async getProfile(): Promise<PerformanceProfile> {
    await this.ensureModules();
    // Without optional native modules, assume normal conditions
    const lowPower = false;
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
