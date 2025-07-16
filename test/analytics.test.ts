import { createDatabase } from '../src/db';
import { refreshLearningAnalytics } from '../src/services/analyticsService';
import { InteractionLog } from '../src/types';

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
