export type FpsStats = {
  fpsAvg: number;
  fpsP95Window: number;
  sampleCount: number;
};

export class SmoothedFpsMeter {
  private readonly intervalsMs: number[] = [];
  private lastTimestampMs: number | null = null;

  constructor(private readonly maxSamples = 60) {}

  recordFrame(timestampMs: number): FpsStats | null {
    if (!Number.isFinite(timestampMs)) {
      return null;
    }

    if (this.lastTimestampMs === null) {
      this.lastTimestampMs = timestampMs;
      return null;
    }

    const intervalMs = timestampMs - this.lastTimestampMs;
    this.lastTimestampMs = timestampMs;

    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      return null;
    }

    this.intervalsMs.push(intervalMs);
    if (this.intervalsMs.length > this.maxSamples) {
      this.intervalsMs.splice(0, this.intervalsMs.length - this.maxSamples);
    }

    const averageInterval = this.intervalsMs.reduce((sum, value) => sum + value, 0) / this.intervalsMs.length;
    const fpsAvg = 1000 / averageInterval;

    const sorted = [...this.intervalsMs].sort((a, b) => a - b);
    const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
    const p95Interval = sorted[p95Index] ?? averageInterval;

    return {
      fpsAvg,
      fpsP95Window: 1000 / p95Interval,
      sampleCount: this.intervalsMs.length,
    };
  }

  reset(): void {
    this.lastTimestampMs = null;
    this.intervalsMs.length = 0;
  }
}
