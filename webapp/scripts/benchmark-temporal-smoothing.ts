import { performance } from 'node:perf_hooks';
import { MultiScaleTemporalFeatureExtractor } from '../src/gesture/utils/MultiScaleTemporalFeatureExtractor';
import { MultimodalSmoother } from '../src/gesture/utils/MultimodalSmoother';
import { TemporalGestureAnalyzer } from '../src/gesture/utils/TemporalGestureAnalyzer';
import type { NormalizedMediaPipeResult } from '../src/gesture/utils/mapMediaPipeResults';

const FRAME_COUNT = 240;
const WARMUP_FRAMES = 30;
const FRAME_INTERVAL_MS = 33;
const FEATURE_WINDOW_SIZE = 30;
const HAND_POINTS = 21;
const POSE_POINTS = 33;
const FACE_POINTS = 468;

type BenchmarkStats = {
  averageMs: number;
  p95Ms: number;
  maxMs: number;
};

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1));
  return sorted[index] ?? 0;
}

function summarize(values: number[]): BenchmarkStats {
  const averageMs = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return {
    averageMs,
    p95Ms: percentile(values, 0.95),
    maxMs: Math.max(0, ...values),
  };
}

function makePoint(baseX: number, baseY: number, pointIndex: number, frameIndex: number, jitterScale: number): number[] {
  const angle = (pointIndex / HAND_POINTS) * Math.PI * 2;
  const radius = 0.04 + (pointIndex % 5) * 0.008;
  const jitter = Math.sin(frameIndex * 1.7 + pointIndex * 0.9) * jitterScale;
  return [
    baseX + Math.cos(angle) * radius + jitter,
    baseY + Math.sin(angle) * radius - jitter,
    jitter * 0.5,
  ];
}

function makeHand(frameIndex: number, jitterScale: number): number[][] {
  const baseX = 0.35 + (frameIndex / FRAME_COUNT) * 0.25;
  const baseY = 0.5 + Math.sin(frameIndex / 12) * 0.04;
  return Array.from({ length: HAND_POINTS }, (_, pointIndex) => (
    makePoint(baseX, baseY, pointIndex, frameIndex, jitterScale)
  ));
}

function makePose(frameIndex: number): number[][] {
  return Array.from({ length: POSE_POINTS }, (_, pointIndex) => [
    0.4 + pointIndex * 0.002,
    0.45 + Math.sin(frameIndex / 20 + pointIndex) * 0.003,
    0,
    0.9,
  ]);
}

function makeFace(frameIndex: number): number[][] {
  return Array.from({ length: FACE_POINTS }, (_, pointIndex) => [
    0.5 + Math.cos(pointIndex / 20) * 0.03,
    0.35 + Math.sin(pointIndex / 20) * 0.04 + Math.sin(frameIndex / 18) * 0.002,
    0,
  ]);
}

function makeFrame(frameIndex: number, jitterScale: number): NormalizedMediaPipeResult {
  const hand = makeHand(frameIndex, jitterScale);
  return {
    hands: [],
    landmarks: [hand],
    handednesses: ['Right'],
    poseLandmarks: makePose(frameIndex),
    faceLandmarks: makeFace(frameIndex),
  };
}

function flattenHand(hand: number[][]): number[] {
  const out: number[] = [];
  for (const point of hand) {
    out.push(point[0] ?? 0, point[1] ?? 0, point[2] ?? 0);
  }
  return out;
}

function meanAbsoluteError(actual: number[][], expected: number[][]): number {
  let total = 0;
  let count = 0;
  for (let i = 0; i < Math.min(actual.length, expected.length); i++) {
    const actualPoint = actual[i];
    const expectedPoint = expected[i];
    if (!actualPoint || !expectedPoint) continue;
    total += Math.abs((actualPoint[0] ?? 0) - (expectedPoint[0] ?? 0));
    total += Math.abs((actualPoint[1] ?? 0) - (expectedPoint[1] ?? 0));
    count += 2;
  }
  return count > 0 ? total / count : 0;
}

function runBenchmark(): {
  baseline: BenchmarkStats;
  temporal: BenchmarkStats;
  rawMae: number;
  smoothedMae: number;
  jitterReductionPct: number;
  dynamicGestureDetections: number;
} {
  const baselineLatencies: number[] = [];
  const temporalLatencies: number[] = [];
  const smoother = new MultimodalSmoother();
  const analyzer = new TemporalGestureAnalyzer();
  const extractor = new MultiScaleTemporalFeatureExtractor();
  const sequenceWindow: number[][] = [];
  let rawError = 0;
  let smoothedError = 0;
  let measuredFrames = 0;
  let dynamicGestureDetections = 0;

  try {
    for (let frameIndex = 0; frameIndex < FRAME_COUNT; frameIndex++) {
      const cleanFrame = makeFrame(frameIndex, 0);
      const noisyFrame = makeFrame(frameIndex, 0.006);
      const timestamp = frameIndex * FRAME_INTERVAL_MS;

      const baselineStart = performance.now();
      const rawHand = noisyFrame.landmarks[0] ?? [];
      flattenHand(rawHand);
      const baselineMs = performance.now() - baselineStart;

      const temporalStart = performance.now();
      const smoothed = smoother.smooth(noisyFrame, timestamp);
      const smoothedHand = smoothed.landmarks[0] ?? [];
      analyzer.addFrame(smoothedHand, timestamp, 'synthetic_motion', 0.8);
      if (analyzer.detectDynamicGesture()) {
        dynamicGestureDetections += 1;
      }
      analyzer.smoothConfidence('synthetic_motion', 0.8);
      sequenceWindow.push(flattenHand(smoothedHand));
      if (sequenceWindow.length > FEATURE_WINDOW_SIZE) {
        sequenceWindow.shift();
      }
      extractor.extractAndFuse(sequenceWindow);
      const temporalMs = performance.now() - temporalStart;

      if (frameIndex >= WARMUP_FRAMES) {
        baselineLatencies.push(baselineMs);
        temporalLatencies.push(temporalMs);
        rawError += meanAbsoluteError(rawHand, cleanFrame.landmarks[0] ?? []);
        smoothedError += meanAbsoluteError(smoothedHand, cleanFrame.landmarks[0] ?? []);
        measuredFrames += 1;
      }
    }
  } finally {
    analyzer.dispose();
    extractor.dispose();
  }

  const rawMae = rawError / Math.max(1, measuredFrames);
  const smoothedMae = smoothedError / Math.max(1, measuredFrames);
  const jitterReductionPct = rawMae > 0 ? ((rawMae - smoothedMae) / rawMae) * 100 : 0;

  return {
    baseline: summarize(baselineLatencies),
    temporal: summarize(temporalLatencies),
    rawMae,
    smoothedMae,
    jitterReductionPct,
    dynamicGestureDetections,
  };
}

const result = runBenchmark();

console.log('# Temporal Smoothing Synthetic Benchmark');
console.log('');
console.log('| Variant | avg ms/frame | p95 ms/frame | max ms/frame |');
console.log('|---|---:|---:|---:|');
console.log(`| Baseline flatten-only | ${result.baseline.averageMs.toFixed(3)} | ${result.baseline.p95Ms.toFixed(3)} | ${result.baseline.maxMs.toFixed(3)} |`);
console.log(`| Multimodal smoother + temporal analyzer + multi-scale extractor | ${result.temporal.averageMs.toFixed(3)} | ${result.temporal.p95Ms.toFixed(3)} | ${result.temporal.maxMs.toFixed(3)} |`);
console.log('');
console.log(`Raw landmark MAE: ${result.rawMae.toFixed(6)}`);
console.log(`Smoothed landmark MAE: ${result.smoothedMae.toFixed(6)}`);
console.log(`Jitter reduction: ${result.jitterReductionPct.toFixed(2)}%`);
console.log(`Dynamic gesture detections: ${result.dynamicGestureDetections}`);
