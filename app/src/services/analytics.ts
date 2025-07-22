import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LearningAnalytics {
  successRate7d: number;
  improvementTrend: number;
}

const LOG_KEY = 'interactionLogs';
const ANALYTICS_ENDPOINT = 'https://your-secure-backend.com/api/analytics';

export async function loadAnalytics(): Promise<LearningAnalytics> {
  const raw = await AsyncStorage.getItem(LOG_KEY);
  const logs = raw ? JSON.parse(raw) : [];
  const now = Date.now();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const weekAgo = now - oneWeek;
  const prevWeekAgo = weekAgo - oneWeek;

  const recent = logs.filter((l: any) => l.timestamp >= weekAgo);
  const prev = logs.filter((l: any) => l.timestamp >= prevWeekAgo && l.timestamp < weekAgo);

  const rate = (ls: any[]) =>
    ls.length === 0 ? 0 : ls.filter((l) => l.wasSuccessful).length / ls.length;

  const success = rate(recent);
  const improvement = success - rate(prev);

  return {
    successRate7d: Number(success.toFixed(2)),
    improvementTrend: Number(improvement.toFixed(2)),
  };
}

export async function uploadAnalytics(
  analytics: LearningAnalytics,
): Promise<void> {
  try {
    await fetch(ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(analytics),
    });
  } catch {
    // best-effort; ignore errors
  }
}
