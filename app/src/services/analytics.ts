import AsyncStorage from '@react-native-async-storage/async-storage';
import { ANALYTICS_ENDPOINT, API_TOKEN, ANALYTICS_TELEMETRY_ENDPOINT } from '../constants';
import { TelemetryEvent } from '../telemetry/recorder';

export interface LearningAnalytics {
  successRate7d: number;
  improvementTrend: number;
}

const LOG_KEY = 'interactionLogs';

export interface InteractionLog {
  id: string;
  gestureDefinitionId: string;
  wasSuccessful: boolean;
  confidenceScore: number;
  timestamp: number;
  processedBy: 'local' | 'cloud';
}

function genId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2)
  );
}

export async function logInteractionEvent(
  log: Omit<InteractionLog, 'id'>,
): Promise<void> {
  const raw = await AsyncStorage.getItem(LOG_KEY);
  const logs: InteractionLog[] = raw ? JSON.parse(raw) : [];
  logs.push({ ...log, id: genId() });
  await AsyncStorage.setItem(LOG_KEY, JSON.stringify(logs));
}

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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify(analytics),
    });
  } catch {
    // best-effort; ignore errors
  }
}

export async function uploadTelemetry(events: TelemetryEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    try {
      await fetch(ANALYTICS_TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_TOKEN}`,
        },
        body: JSON.stringify(events),
      });
    } catch (err) {
      console.warn('Failed to upload telemetry', err);
      // Best-effort, errors are not critical
    }
  }
