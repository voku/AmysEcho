import AsyncStorage from '@react-native-async-storage/async-storage';

// Reuse the same key as analytics interaction logs
const LOG_KEY = 'interactionLogs';

export interface InteractionLog {
  id: string;
  gestureDefinitionId: string;
  wasSuccessful: boolean;
  confidenceScore: number;
  timestamp: number;
  processedBy: 'local' | 'cloud';
  caregiverOverrideId?: string;
}

export interface HealthResult {
  successRate: number; // 0..1
  count: number;
}

export async function getGestureHealth(
  gestureId: string,
  options?: { windowMs?: number; lastN?: number },
): Promise<HealthResult> {
  const raw = await AsyncStorage.getItem(LOG_KEY);
  const logs: InteractionLog[] = raw ? JSON.parse(raw) : [];
  const now = Date.now();

  let filtered = logs.filter((l) => l.gestureDefinitionId === gestureId);

  if (options?.windowMs && options.windowMs > 0) {
    const cutoff = now - options.windowMs;
    filtered = filtered.filter((l) => l.timestamp >= cutoff);
  }
  if (options?.lastN && options.lastN > 0) {
    filtered = filtered.slice(-options.lastN);
  }

  if (filtered.length === 0) return { successRate: 1, count: 0 };
  const success = filtered.filter((l) => l.wasSuccessful).length;
  return { successRate: success / filtered.length, count: filtered.length };
}

export async function shouldPromptPractice(
  gestureId: string,
  opts?: { minSamples?: number; threshold?: number; windowMs?: number; lastN?: number },
): Promise<boolean> {
  const { minSamples = 5, threshold = 0.6, windowMs, lastN = 10 } = opts || {};
  const health = await getGestureHealth(gestureId, { windowMs, lastN });
  return health.count >= minSamples && health.successRate < threshold;
}

