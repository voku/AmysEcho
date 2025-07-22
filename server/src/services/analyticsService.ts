import { Database } from '../db';
import { LearningAnalytics } from '../types';
import { promises as fs } from 'fs';
import path from 'path';

const ANALYTICS_PATH = path.join(process.cwd(), 'analytics.json');

export function computeLearningAnalytics(db: Database): LearningAnalytics {
  const now = Date.now();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const weekAgo = now - oneWeek;
  const prevWeekAgo = weekAgo - oneWeek;

  const recent = db.interactionLogs.filter((l) => l.timestamp >= weekAgo);
  const prev = db.interactionLogs.filter(
    (l) => l.timestamp >= prevWeekAgo && l.timestamp < weekAgo,
  );

  const rate = (logs: typeof recent) =>
    logs.length === 0
      ? 0
      : logs.filter((l) => l.wasSuccessful).length / logs.length;

  const successRate7d = rate(recent);
  const improvementTrend = successRate7d - rate(prev);

  return {
    id: 'default',
    successRate7d: Number(successRate7d.toFixed(2)),
    improvementTrend: Number(improvementTrend.toFixed(2)),
  };
}

export function refreshLearningAnalytics(db: Database): void {
  const analytics = computeLearningAnalytics(db);
  const existing = db.learningAnalytics.find((a) => a.id === 'default');
  if (existing) {
    existing.successRate7d = analytics.successRate7d;
    existing.improvementTrend = analytics.improvementTrend;
  } else {
    db.learningAnalytics.push(analytics);
  }
}

export async function saveAnalyticsToFile(
  analytics: LearningAnalytics,
  filePath: string = ANALYTICS_PATH,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(analytics, null, 2), 'utf8');
}

export async function loadAnalyticsFromFile(
  filePath: string = ANALYTICS_PATH,
): Promise<LearningAnalytics | null> {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data) as LearningAnalytics;
  } catch {
    return null;
  }
}
