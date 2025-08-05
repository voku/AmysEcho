import { createDatabase } from '../../server/src/db';
import {
  refreshLearningAnalytics,
  computeLearningAnalytics,
} from '../../server/src/services/analyticsService';
import { InteractionLog } from '../../server/src/types';

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
});