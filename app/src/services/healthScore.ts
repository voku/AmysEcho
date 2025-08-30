import AsyncStorage from '@react-native-async-storage/async-storage';

// Reuse the same key as analytics interaction logs
const LOG_KEY = 'interactionLogs';

export interface InteractionLog {
  id: string;
  gestureDefinitionId: string;
  wasSuccessful: boolean;
  confidenceScore: number;
  timestamp: number;
  processedBy: 'local' | 'cloud' | 'centroid';
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



const HISTORICAL_HEALTH_KEY = "historicalHealthData";

export interface HistoricalHealthEntry {
  date: string; // YYYY-MM-DD
  successRate: number;
  count: number;
}

export async function saveHistoricalHealthData(
  gestureId: string,
  entry: HistoricalHealthEntry,
): Promise<void> {
  const raw = await AsyncStorage.getItem(HISTORICAL_HEALTH_KEY);
  const data: Record<string, HistoricalHealthEntry[]> = raw ? JSON.parse(raw) : {};
  if (!data[gestureId]) {
    data[gestureId] = [];
  }
  data[gestureId].push(entry);
  await AsyncStorage.setItem(HISTORICAL_HEALTH_KEY, JSON.stringify(data));
}

export async function loadHistoricalHealthData(
  gestureId: string,
): Promise<HistoricalHealthEntry[]> {
  const raw = await AsyncStorage.getItem(HISTORICAL_HEALTH_KEY);
  const data: Record<string, HistoricalHealthEntry[]> = raw ? JSON.parse(raw) : {};
  return data[gestureId] || [];
}

function calculateTrend(data: HistoricalHealthEntry[]): number {
  if (data.length < 2) {
    return 0;
  }
  const x = data.map((_, i) => i);
  const y = data.map((d) => d.successRate);
  const n = x.length;
  const sx = x.reduce((a, b) => a + b, 0);
  const sy = y.reduce((a, b) => a + b, 0);
  const sxy = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sx2 = x.reduce((acc, xi) => acc + xi * xi, 0);
  const denom = n * sx2 - sx * sx;
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
}



export async function checkForDecliningAccuracy(
  gestureId: string,
): Promise<boolean> {
  const data = await loadHistoricalHealthData(gestureId);
  if (data.length < 7) {
    return false;
  }

  const recentData = data.slice(-7);
  const trend = calculateTrend(recentData);
  return trend < -0.1;
}

export interface ProgressReport {
  averageSuccessRate: number;
  totalSamples: number;
  trend: number;
}

export async function generateProgressReport(
  gestureId: string,
): Promise<ProgressReport> {
  const data = await loadHistoricalHealthData(gestureId);
  if (data.length === 0) {
    return { averageSuccessRate: 0, totalSamples: 0, trend: 0 };
  }
  const totalSamples = data.reduce((sum, d) => sum + d.count, 0);
  const averageSuccessRate =
    totalSamples === 0
      ? 0
      : data.reduce((sum, d) => sum + d.successRate * d.count, 0) /
        totalSamples;
  const trend = calculateTrend(data);
  return { averageSuccessRate, totalSamples, trend };
}


