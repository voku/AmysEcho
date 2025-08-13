import { ModelPerformanceMonitor } from '../src/services/ModelPerformanceMonitor';

describe('ModelPerformanceMonitor', () => {
  test('detects confidence drop', () => {
    const m = new ModelPerformanceMonitor(10);
    m.setBaseline(0.9);
    for (let i = 0; i < 10; i++) {
      m.add({ t: i, label: 'ok', confidence: 0.7, latencyMs: 50, inferenceType: 'local' });
    }
    expect(m.isDegraded()).toBe(true);
  });

  test('detects high uncertain rate', () => {
    const m = new ModelPerformanceMonitor(10);
    m.setBaseline(0.9);
    for (let i = 0; i < 10; i++) {
      m.add({
        t: i,
        label: i < 5 ? 'uncertain' : 'ok',
        confidence: 0.9,
        requiresConfirmation: i < 5,
        latencyMs: 50,
        inferenceType: 'local',
      });
    }
    expect(m.isDegraded()).toBe(true);
  });

  test('passes healthy performance', () => {
    const m = new ModelPerformanceMonitor(10);
    m.setBaseline(0.8);
    for (let i = 0; i < 10; i++) {
      m.add({ t: i, label: 'ok', confidence: 0.8, latencyMs: 50, inferenceType: 'local' });
    }
    expect(m.isDegraded()).toBe(false);
  });

  test('detects high latency', () => {
    const m = new ModelPerformanceMonitor(10);
    for (let i = 0; i < 10; i++) {
      m.add({ t: i, label: 'ok', confidence: 0.9, latencyMs: 300, inferenceType: 'local' });
    }
    expect(m.isDegraded()).toBe(true);
  });

  test('tracks frames and exports metrics', () => {
    const m = new ModelPerformanceMonitor(10);
    m.add({ t: 0, label: 'ok', confidence: 0.9, latencyMs: 10, inferenceType: 'local' });
    m.add({ t: 1, label: 'ok', confidence: 0.8, latencyMs: 30, inferenceType: 'cloud' });
    m.recordDroppedFrame();
    const metrics = m.metrics();
    expect(metrics.framesProcessed).toBe(2);
    expect(metrics.framesDropped).toBe(1);
    expect(metrics.medianLatencyMs).toBe(20);
    expect(metrics.localVsCloudRatio).toBeCloseTo(0.5);
    expect(() => JSON.parse(m.export())).not.toThrow();
  });

  test('ignores missing latencies when computing median', () => {
    const m = new ModelPerformanceMonitor(3);
    m.add({ t: 0, label: 'ok', confidence: 0.9, latencyMs: 10, inferenceType: 'local' });
    m.add({ t: 1, label: 'ok', confidence: 0.9, latencyMs: 20, inferenceType: 'local' });
    m.add({ t: 2, label: 'ok', confidence: 0.9, latencyMs: 30, inferenceType: 'local' });
    // event without latency should not desync the sliding window
    m.add({ t: 3, label: 'ok', confidence: 0.9, inferenceType: 'local' });
    // adding a new latency should drop the oldest latency value only once
    m.add({ t: 4, label: 'ok', confidence: 0.9, latencyMs: 40, inferenceType: 'local' });
    const metrics = m.metrics();
    expect(metrics.medianLatencyMs).toBe(30); // median of [20,30,40]
  });
});
