/**
 * Health Score Service - Amy First
 *
 * Verfolgt Gebärdengesundheit und Übungsvorschläge basierend auf Erfolgsrate
 */

const LOG_KEY = 'interactionLogs';
const HISTORICAL_HEALTH_KEY = 'historicalHealthData';

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

export interface HistoricalHealthEntry {
  date: string; // YYYY-MM-DD
  successRate: number;
  count: number;
}

export interface ProgressReport {
  averageSuccessRate: number;
  totalSamples: number;
  trend: number;
}

/**
 * Gebärdengesundheit basierend auf Interaktionsprotokollen abrufen
 */
export function getGestureHealth(
  gestureId: string,
  options?: { windowMs?: number; lastN?: number }
): HealthResult {
  try {
    const raw = localStorage.getItem(LOG_KEY);
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
  } catch (error) {
    console.warn('[HealthScore] Fehler beim Laden der Gesundheitsdaten:', error);
    return { successRate: 1, count: 0 };
  }
}

/**
 * Prüfen ob Übung vorgeschlagen werden soll
 */
export function shouldPromptPractice(
  gestureId: string,
  opts?: { minSamples?: number; threshold?: number; windowMs?: number; lastN?: number }
): boolean {
  const { minSamples = 5, threshold = 0.6, windowMs, lastN = 10 } = opts || {};
  const historyOptions: { windowMs?: number; lastN?: number } = { lastN };
  if (windowMs !== undefined) {
    historyOptions.windowMs = windowMs;
  }
  const health = getGestureHealth(gestureId, historyOptions);
  return health.count >= minSamples && health.successRate < threshold;
}

/**
 * Interaktionsprotokoll speichern
 */
export function saveInteractionLog(log: InteractionLog): void {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const logs: InteractionLog[] = raw ? JSON.parse(raw) : [];
    logs.push(log);
    
    // Maximal 1000 Einträge behalten
    const trimmed = logs.slice(-1000);
    localStorage.setItem(LOG_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.warn('[HealthScore] Fehler beim Speichern des Protokolls:', error);
  }
}

/**
 * Historische Gesundheitsdaten speichern
 */
export function saveHistoricalHealthData(
  gestureId: string,
  entry: HistoricalHealthEntry
): void {
  try {
    const raw = localStorage.getItem(HISTORICAL_HEALTH_KEY);
    const data: Record<string, HistoricalHealthEntry[]> = raw ? JSON.parse(raw) : {};
    if (!data[gestureId]) {
      data[gestureId] = [];
    }
    data[gestureId].push(entry);
    localStorage.setItem(HISTORICAL_HEALTH_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('[HealthScore] Fehler beim Speichern historischer Daten:', error);
  }
}

/**
 * Historische Gesundheitsdaten laden
 */
export function loadHistoricalHealthData(
  gestureId: string
): HistoricalHealthEntry[] {
  try {
    const raw = localStorage.getItem(HISTORICAL_HEALTH_KEY);
    const data: Record<string, HistoricalHealthEntry[]> = raw ? JSON.parse(raw) : {};
    return data[gestureId] || [];
  } catch (error) {
    console.warn('[HealthScore] Fehler beim Laden historischer Daten:', error);
    return [];
  }
}

/**
 * Einfache lineare Regression für Trend-Tracking
 */
function calculateTrend(data: ReadonlyArray<HistoricalHealthEntry>): number {
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

/**
 * Prüfen ob Genauigkeit abfällt
 */
export function checkForDecliningAccuracy(gestureId: string): boolean {
  const data = loadHistoricalHealthData(gestureId);
  if (data.length < 7) {
    return false;
  }

  const recentData = [...data]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);
  const trend = calculateTrend(recentData);
  return trend <= -0.1;
}

/**
 * Fortschrittsbericht generieren
 */
export function generateProgressReport(gestureId: string): ProgressReport {
  const data = loadHistoricalHealthData(gestureId);
  if (data.length === 0) {
    return { averageSuccessRate: 0, totalSamples: 0, trend: 0 };
  }
  const { totalSamples, weightedSum } = data.reduce(
    (acc, d) => {
      acc.totalSamples += d.count;
      acc.weightedSum += d.successRate * d.count;
      return acc;
    },
    { totalSamples: 0, weightedSum: 0 }
  );
  const averageSuccessRate =
    totalSamples === 0 ? 0 : weightedSum / totalSamples;
  const trend = calculateTrend(
    [...data].sort((a, b) => a.date.localeCompare(b.date))
  );
  return { averageSuccessRate, totalSamples, trend };
}

/**
 * Alle Gesundheitsdaten zurücksetzen
 */
export function resetHealthData(): void {
  try {
    localStorage.removeItem(LOG_KEY);
    localStorage.removeItem(HISTORICAL_HEALTH_KEY);
  } catch {
    // Ignorieren
  }
}
