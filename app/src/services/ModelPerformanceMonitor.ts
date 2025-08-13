export type PerfEvent = {
  t: number;
  label: string;
  confidence: number;
  requiresConfirmation?: boolean;
  latencyMs?: number;
  inferenceType?: 'local' | 'cloud';
};

export type PerfMetrics = {
  windowSize: number;
  avgConfidence: number;
  uncertainRate: number; // fraction of events that required confirmation or were uncertain
  avgLatencyMs: number;
  medianLatencyMs: number;
  framesProcessed: number;
  framesDropped: number;
  localVsCloudRatio: number;
};

export class ModelPerformanceMonitor {
  private baselineConfidence = 0.85; // default baseline until set explicitly
  private latencyThreshold = 200;
  private window: PerfEvent[] = [];
  private readonly maxWindow: number;
  private latencies: number[] = [];
  private framesProcessed = 0;
  private framesDropped = 0;
  private localCount = 0;
  private cloudCount = 0;

  constructor(maxWindow = 50) {
    this.maxWindow = maxWindow;
  }

  setBaseline(confidence: number) {
    if (!Number.isFinite(confidence)) return;
    this.baselineConfidence = Math.max(0, Math.min(1, confidence));
  }

  setLatencyThreshold(ms: number) {
    if (!Number.isFinite(ms)) return;
    this.latencyThreshold = Math.max(0, ms);
  }

  add(e: PerfEvent) {
    this.window.push(e);
    if (this.window.length > this.maxWindow) {
      this.window.shift();
    }
    if (typeof e.latencyMs === 'number') {
      this.latencies.push(e.latencyMs);
      if (this.latencies.length > this.maxWindow) this.latencies.shift();
    }
    this.framesProcessed += 1;
    if (e.inferenceType === 'cloud') this.cloudCount += 1; else this.localCount += 1;
  }

  recordDroppedFrame() {
    this.framesDropped += 1;
  }

  private medianLatency(): number {
    if (this.latencies.length === 0) return 0;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  private localRatio(): number {
    const total = this.localCount + this.cloudCount;
    return total === 0 ? 0 : this.localCount / total;
  }

  metrics(): PerfMetrics {
    const n = this.window.length;
    if (n === 0) {
      return {
        windowSize: 0,
        avgConfidence: 0,
        uncertainRate: 0,
        avgLatencyMs: 0,
        medianLatencyMs: 0,
        framesProcessed: this.framesProcessed,
        framesDropped: this.framesDropped,
        localVsCloudRatio: this.localRatio(),
      };
    }
    let sum = 0;
    let uncertain = 0;
    let latencySum = 0;
    for (const e of this.window) {
      sum += e.confidence;
      if (e.requiresConfirmation || e.label === 'uncertain') uncertain += 1;
      if (typeof e.latencyMs === 'number') latencySum += e.latencyMs;
    }
    return {
      windowSize: n,
      avgConfidence: sum / n,
      uncertainRate: uncertain / n,
      avgLatencyMs: latencySum / n,
      medianLatencyMs: this.medianLatency(),
      framesProcessed: this.framesProcessed,
      framesDropped: this.framesDropped,
      localVsCloudRatio: this.localRatio(),
    };
  }

  // Consider degraded if average confidence dropped >15% below baseline OR
  // if uncertain rate exceeds 0.4 in the recent window OR if average latency
  // exceeds the configured threshold.
  isDegraded(): boolean {
    const m = this.metrics();
    if (m.windowSize < Math.min(10, this.maxWindow / 2)) return false;
    const drop = this.baselineConfidence - m.avgConfidence;
    if (drop > 0.15) return true;
    if (m.uncertainRate > 0.4) return true;
    if (m.avgLatencyMs > this.latencyThreshold) return true;
    return false;
  }

  export(): string {
    return JSON.stringify(this.metrics());
  }
}

