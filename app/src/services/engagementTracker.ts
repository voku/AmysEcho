import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'engagementStats';
let sessionStart: number | null = null;

import { StoredStats, EngagementStats } from '../types';

export async function startSession(): Promise<void> {
  sessionStart = Date.now();
}

export async function endSession(profileId: string): Promise<void> {
  if (sessionStart === null) return;
  const duration = Date.now() - sessionStart;
  sessionStart = null;
  const raw = await AsyncStorage.getItem(KEY);
  const data: Record<string, StoredStats> = raw ? JSON.parse(raw) : {};
  const stats = data[profileId] || { sessions: 0, totalMs: 0 };
  stats.sessions += 1;
  stats.totalMs += duration;
  data[profileId] = stats;
  await AsyncStorage.setItem(KEY, JSON.stringify(data));
}

export async function loadEngagementStats(profileId: string): Promise<EngagementStats> {
  const raw = await AsyncStorage.getItem(KEY);
  const data: Record<string, StoredStats> = raw ? JSON.parse(raw) : {};
  const stats = data[profileId] || { sessions: 0, totalMs: 0 };
  return {
    totalSessions: stats.sessions,
    totalDurationMs: stats.totalMs,
    averageDurationMs: stats.sessions ? stats.totalMs / stats.sessions : 0,
  };
}
