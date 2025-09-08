import { createDatabase, addInteractionLog, addCorrection } from '../src/db';
import { computeSummaryMetrics, computeAnalyticsInsights, loadTelemetry, saveTelemetry } from '../src/services/analyticsService';

describe('analyticsService', () => {
  it('computes summary metrics with median latency', async () => {
    const db = createDatabase();
    const now = Date.now();
    // Add 4 interaction logs: 2 successes, 2 failures (one will be corrected)
    addInteractionLog(db, { id: '1', gestureDefinitionId: 'hello', wasSuccessful: true, confidenceScore: 0.9, timestamp: now - 1000, processedBy: 'local' });
    addInteractionLog(db, { id: '2', gestureDefinitionId: 'drink', wasSuccessful: false, confidenceScore: 0.4, timestamp: now - 2000, processedBy: 'local' });
    addInteractionLog(db, { id: '3', gestureDefinitionId: 'hello', wasSuccessful: true, confidenceScore: 0.8, timestamp: now - 3000, processedBy: 'local' });
    addInteractionLog(db, { id: '4', gestureDefinitionId: 'drink', wasSuccessful: false, confidenceScore: 0.2, timestamp: now - 4000, processedBy: 'local' });

    // Add a correction for one failure
    db.corrections.push({ id: 'c1', profileId: 'p1', predictedGesture: 'drink', actualGesture: 'hello', timestamp: now - 1500 });

    // Save telemetry events with latencies to compute median
    await saveTelemetry([
      { timestamp: now - 5000, latencyMs: 15 },
      { timestamp: now - 4000, latencyMs: 10 },
      { timestamp: now - 3000, latencyMs: 20 },
    ]);
    const telemetry = await loadTelemetry();
    const summary = computeSummaryMetrics(db as any, telemetry, 0.7);
    // 4 interactions, 1 correction => correctionRate 0.25
    expect(summary.correctionRate).toBeCloseTo(0.25, 5);
    // Uncertainty: 2 with < 0.7 => 0.5
    expect(summary.uncertaintyRatio).toBeCloseTo(0.5, 5);
    // Success rate: 2 / 4 = 0.5
    expect(summary.successRate).toBeCloseTo(0.5, 5);
    // Median of [10,15,20] = 15
    expect(summary.medianLatencyMs).toBe(15);
    // Top misclassification should include drink→hello
    expect(summary.topMisclassifications.length).toBeGreaterThan(0);
    expect(summary.topMisclassifications[0].predicted).toBe('drink');
    expect(summary.topMisclassifications[0].actual).toBe('hello');
  });

  it('computes analytics insights: correction frequency and recommendations', () => {
    const db = createDatabase();
    const now = Date.now();
    // Add some corrections
    db.corrections.push({ id: 'c1', profileId: 'p1', predictedGesture: 'g1', actualGesture: 'g2', timestamp: now });
    db.corrections.push({ id: 'c2', profileId: 'p1', predictedGesture: 'g1', actualGesture: 'g2', timestamp: now });
    db.corrections.push({ id: 'c3', profileId: 'p1', predictedGesture: 'g1', actualGesture: 'g3', timestamp: now });
    // Interaction logs to define total count
    for (let i = 0; i < 20; i++) {
      addInteractionLog(db, { id: String(i), gestureDefinitionId: 'g1', wasSuccessful: i % 2 === 0, confidenceScore: 0.5 + (i % 2) * 0.4, timestamp: now - i * 1000, processedBy: 'local' });
    }
    const insights = computeAnalyticsInsights(db as any);
    expect(insights.correctionFrequency.length).toBeGreaterThan(0);
    expect(insights.topConfusingPairs[0].pair).toBe('g1→g2');
    // Recommendations include high-frequency corrections
    expect(insights.recommendations.some((r) => r.gesture === 'g2')).toBe(true);
  });
});
