import { createDatabase } from '../../server/src/db';
import {
  refreshLearningAnalytics,
  computeLearningAnalytics,
  computeSummaryMetrics,
  computeAnalyticsInsights,
} from '../../server/src/services/analyticsService';
import { InteractionLog, Correction } from '../../server/src/types';

describe('Analytics Service', () => {
  it('should compute analytics correctly', () => {
    const db = createDatabase();
    const now = Date.now();
    const recent: InteractionLog = {
      id: '1',
      gestureDefinitionId: 'g',
      wasSuccessful: true,
      confidenceScore: 1,
      timestamp: now,
      processedBy: 'local',
    };
    const old: InteractionLog = {
      id: '2',
      gestureDefinitionId: 'g',
      wasSuccessful: false,
      confidenceScore: 0,
      timestamp: now - 8 * 24 * 60 * 60 * 1000,
      processedBy: 'local',
    };
    db.interactionLogs.push(recent, old);
    refreshLearningAnalytics(db);
    const analytics = db.learningAnalytics[0];
    expect(analytics).toBeDefined();
    expect(analytics.successRate7d).toBe(1);
    expect(analytics.successRate24h).toBe(1);
    expect(analytics.avgConfidenceScore).toBe(1);
    expect(analytics.improvementTrend).toBeGreaterThan(0);
  });

  it('should return default values for empty analytics', () => {
    const db = createDatabase();
    const analytics = computeLearningAnalytics(db);
    expect(analytics.successRate7d).toBe(0);
    expect(analytics.successRate24h).toBe(0);
    expect(analytics.avgConfidenceScore).toBe(0);
    expect(analytics.improvementTrend).toBe(0);
  });

  it('should update analytics correctly', () => {
    const db = createDatabase();
    const now = Date.now();

    // logs from the last 7 days: 5 successes and 5 failures
    for (let i = 0; i < 5; i++) {
      db.interactionLogs.push({
        id: `cur-success-${i}`,
        gestureDefinitionId: 'g',
        wasSuccessful: true,
        confidenceScore: 1,
        timestamp: now - i * 1000,
        processedBy: 'local',
      });
      db.interactionLogs.push({
        id: `cur-fail-${i}`,
        gestureDefinitionId: 'g',
        wasSuccessful: false,
        confidenceScore: 0,
        timestamp: now - i * 1000,
        processedBy: 'local',
      });
    }

    // logs from the previous week: 4 successes and 6 failures
    const eightDays = 8 * 24 * 60 * 60 * 1000;
    for (let i = 0; i < 10; i++) {
      db.interactionLogs.push({
        id: `old-${i}`,
        gestureDefinitionId: 'g',
        wasSuccessful: i < 4,
        confidenceScore: i < 4 ? 1 : 0,
        timestamp: now - eightDays - i * 1000,
        processedBy: 'local',
      });
    }

    refreshLearningAnalytics(db);
    expect(db.learningAnalytics.length).toBe(1);
    expect(db.learningAnalytics[0].successRate7d).toBe(0.5);
    expect(db.learningAnalytics[0].successRate24h).toBe(0.5);
    expect(db.learningAnalytics[0].avgConfidenceScore).toBe(0.5);
    expect(db.learningAnalytics[0].improvementTrend).toBe(0.1);

    // add an additional failed interaction and refresh again
    db.interactionLogs.push({
      id: 'cur-extra',
      gestureDefinitionId: 'g',
      wasSuccessful: false,
      confidenceScore: 0,
      timestamp: now + 1,
      processedBy: 'local',
    });
    refreshLearningAnalytics(db);

    const updated = db.learningAnalytics[0];
    expect(db.learningAnalytics.length).toBe(1);
    expect(updated.successRate7d).toBe(0.45);
    expect(updated.successRate24h).toBe(0.45);
    expect(updated.avgConfidenceScore).toBe(0.45);
    expect(updated.improvementTrend).toBe(0.05);
  });

  it('should compute summary success rate', () => {
    const db = createDatabase();
    const now = Date.now();
    db.interactionLogs.push({
      id: '1',
      gestureDefinitionId: 'g',
      wasSuccessful: true,
      confidenceScore: 1,
      timestamp: now,
      processedBy: 'local',
    });
    db.interactionLogs.push({
      id: '2',
      gestureDefinitionId: 'g',
      wasSuccessful: false,
      confidenceScore: 0,
      timestamp: now,
      processedBy: 'local',
    });
    const summary = computeSummaryMetrics(db, []);
    expect(summary.successRate).toBe(0.5);
  });

  it('should analyze correction frequency and recommendations', () => {
    const db = createDatabase();
    const now = Date.now();

    db.interactionLogs.push(
      {
        id: '1',
        gestureDefinitionId: 'g1',
        wasSuccessful: false,
        confidenceScore: 0.2,
        timestamp: now,
        processedBy: 'local',
      },
      {
        id: '2',
        gestureDefinitionId: 'g2',
        wasSuccessful: true,
        confidenceScore: 0.9,
        timestamp: now + 1,
        processedBy: 'local',
      },
      {
        id: '3',
        gestureDefinitionId: 'g1',
        wasSuccessful: false,
        confidenceScore: 0.3,
        timestamp: now + 2,
        processedBy: 'local',
      },
    );

    const corrections: Correction[] = [
      {
        id: 'c1',
        predictedGesture: 'g1',
        actualGesture: 'g2',
        confidence: 0.6,
        timestamp: now,
        isSynced: false,
        profileId: 'p',
      },
      {
        id: 'c2',
        predictedGesture: 'g1',
        actualGesture: 'g2',
        confidence: 0.5,
        timestamp: now + 1,
        isSynced: false,
        profileId: 'p',
      },
      {
        id: 'c3',
        predictedGesture: 'g2',
        actualGesture: 'g1',
        confidence: 0.4,
        timestamp: now + 2,
        isSynced: false,
        profileId: 'p',
      },
    ];
    db.corrections.push(...corrections);

    const insights = computeAnalyticsInsights(db);
    expect(insights.correctionFrequency).toEqual([
      { gesture: 'g2', count: 2, rate: 0.67 },
      { gesture: 'g1', count: 1, rate: 0.33 },
    ]);
    expect(insights.topConfusingPairs[0]).toEqual({ pair: 'g1→g2', count: 2 });
    expect(insights.recommendations.length).toBe(2);
    expect(insights.recommendations[0].gesture).toBe('g2');
  });
});