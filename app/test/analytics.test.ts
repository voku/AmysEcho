import { createDatabase } from '../../server/src/db';
import {
  refreshLearningAnalytics,
  computeLearningAnalytics,
} from '../../server/src/services/analyticsService';
import { InteractionLog } from '../../server/src/types';

(async () => {
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
  if (!analytics || analytics.successRate7d !== 1 || analytics.improvementTrend <= 0) {
    throw new Error('analytics computation failed');
  }
  console.log('analytics computed');
})();

(async () => {
  const db = createDatabase();
  const analytics = computeLearningAnalytics(db);
  if (analytics.successRate7d !== 0 || analytics.improvementTrend !== 0) {
    throw new Error('analytics default values incorrect');
  }
  console.log('analytics empty ok');
})();

(async () => {
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
  if (
    db.learningAnalytics.length !== 1 ||
    db.learningAnalytics[0].successRate7d !== 0.5 ||
    db.learningAnalytics[0].improvementTrend !== 0.1
  ) {
    throw new Error('initial analytics incorrect');
  }

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
  if (
    db.learningAnalytics.length !== 1 ||
    updated.successRate7d !== 0.45 ||
    updated.improvementTrend !== 0.05
  ) {
    throw new Error('analytics update failed');
  }
  console.log('analytics update ok');
})();
