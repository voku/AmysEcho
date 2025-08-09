export type PerfEvent = {
  t: number;
  label: string;
  confidence: number;
  requiresConfirmation?: boolean;
};

export type PerfMetrics = {
  windowSize: number;
  avgConfidence: number;
  uncertainRate: number; // fraction of events that required confirmation or were uncertain
};

export class ModelPerformanceMonitor {
  private baselineConfidence = 0.85; // default baseline until set explicitly
  private window: PerfEvent[] = [];
  private readonly maxWindow: number;

  constructor(maxWindow = 50) {
    this.maxWindow = maxWindow;
  }

  setBaseline(confidence: number) {
    if (!Number.isFinite(confidence)) return;
    this.baselineConfidence = Math.max(0, Math.min(1, confidence));
  }

  add(e: PerfEvent) {
    this.window.push(e);
    if (this.window.length > this.maxWindow) {
      this.window.shift();
    }
  }

  metrics(): PerfMetrics {
    const n = this.window.length;
    if (n === 0) {
      return { windowSize: 0, avgConfidence: 0, uncertainRate: 0 };
    }
    let sum = 0;
    let uncertain = 0;
    for (const e of this.window) {
      sum += e.confidence;
      if (e.requiresConfirmation || e.label === 'uncertain') uncertain += 1;
    }
    return {
      windowSize: n,
      avgConfidence: sum / n,
      uncertainRate: uncertain / n,
    };
  }

  // Consider degraded if average confidence dropped >15% below baseline OR
  // if uncertain rate exceeds 0.4 in the recent window.
  isDegraded(): boolean {
    const m = this.metrics();
    if (m.windowSize < Math.min(10, this.maxWindow / 2)) return false;
    const drop = this.baselineConfidence - m.avgConfidence;
    if (drop > 0.15) return true;
    if (m.uncertainRate > 0.4) return true;
    return false;
  }
}

