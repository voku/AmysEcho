import { GestureRecognitionResult } from '../';

export type PerfEvent = GestureRecognitionResult & {
  t: number;
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