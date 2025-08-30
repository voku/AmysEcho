import type { SharedValue } from 'react-native-reanimated';
export type PerformanceProfile = {
  fps: number;
  lowPower: boolean;
};

export class AdaptivePerformanceManager {
  private frameInterval = 1000 / 8;
  private lastFrameTime = 0;
  async getProfile(): Promise<PerformanceProfile> {
    return {
      fps: 8,
      lowPower: false,
    };
  }

  async apply(targetFps: SharedValue<number>, setLowPower: (low: boolean) => void) {
    const profile = await this.getProfile();
    targetFps.value = profile.fps;
    setLowPower(profile.lowPower);
    this.frameInterval = 1000 / profile.fps;
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
