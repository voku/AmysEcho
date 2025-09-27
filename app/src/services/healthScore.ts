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
  const historyOptions: { windowMs?: number; lastN?: number } = { lastN };
  if (windowMs !== undefined) {
    historyOptions.windowMs = windowMs;
  }
  const health = await getGestureHealth(gestureId, historyOptions);
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

// Simple linear regression to track success-rate trends.
// Requires data sorted by date ascending (oldest → newest).
function calculateTrend(
  data: ReadonlyArray<HistoricalHealthEntry>,
): number {
  const n = data.length;
  if (n < 2) {
    return 0;
  }

  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sx2 = 0;

  for (let i = 0; i < n; i++) {
    const entry = data[i];
    if (!entry) {
      continue;
    }
    const y = entry.successRate;
    sx += i;
    sy += y;
    sxy += i * y;
    sx2 += i * i;
  }

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

  const recentData = [...data]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);
  const trend = calculateTrend(recentData);
  return trend <= -0.1;
}

export interface ProgressReport {
  // Weighted by entry.count; 0..1
  averageSuccessRate: number;
  totalSamples: number;
  // Linear-regression slope per entry (older → newer).
  trend: number;
}

export async function generateProgressReport(
  gestureId: string,
): Promise<ProgressReport> {
  const data = await loadHistoricalHealthData(gestureId);
  if (data.length === 0) {
    return { averageSuccessRate: 0, totalSamples: 0, trend: 0 };
  }
  const { totalSamples, weightedSum } = data.reduce(
    (acc, d) => {
      acc.totalSamples += d.count;
      acc.weightedSum += d.successRate * d.count;
      return acc;
    },
    { totalSamples: 0, weightedSum: 0 },
  );
  const averageSuccessRate =
    totalSamples === 0 ? 0 : weightedSum / totalSamples;
  const trend = calculateTrend(
    [...data].sort((a, b) => a.date.localeCompare(b.date)),
  );
  return { averageSuccessRate, totalSamples, trend };
}


