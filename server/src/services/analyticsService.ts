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

  const dayAgo = now - 24 * 60 * 60 * 1000;
  const lastDay = db.interactionLogs.filter((l) => l.timestamp >= dayAgo);

  const rate = (logs: typeof recent) =>
    logs.length === 0
      ? 0
      : logs.filter((l) => l.wasSuccessful).length / logs.length;

  const successRate24h = rate(lastDay);
  const successRate7d = rate(recent);
  const improvementTrend = successRate7d - rate(prev);

  const avgConfidenceScore =
    recent.length === 0
      ? 0
      : recent.reduce((sum, l) => sum + l.confidenceScore, 0) /
        recent.length;

  return {
    id: 'default',
    gestureDefinitionId: 'overall',
    successRate24h: Number(successRate24h.toFixed(2)),
    successRate7d: Number(successRate7d.toFixed(2)),
    avgConfidenceScore: Number(avgConfidenceScore.toFixed(2)),
    improvementTrend: Number(improvementTrend.toFixed(2)),
    lastCalculated: now,
  };
}

export function refreshLearningAnalytics(db: Database): void {
  const analytics = computeLearningAnalytics(db);
  const existing = db.learningAnalytics.find((a) => a.id === 'default');
  if (existing) {
    existing.successRate24h = analytics.successRate24h;
    existing.successRate7d = analytics.successRate7d;
    existing.avgConfidenceScore = analytics.avgConfidenceScore;
    existing.improvementTrend = analytics.improvementTrend;
    existing.lastCalculated = analytics.lastCalculated;
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

export interface SummaryMetrics {
  correctionRate: number;
  uncertaintyRatio: number;
  medianLatencyMs: number | null;
  topMisclassifications: { predicted: string; actual: string; count: number }[];
  successRate: number;
}
export interface TelemetryEvent {
    timestamp: number;
    latencyMs: number;
  }
  
  const TELEMETRY_PATH = path.join(process.cwd(), 'telemetry.json');
  
  export async function loadTelemetry(): Promise<TelemetryEvent[]> {
    try {
      const data = await fs.readFile(TELEMETRY_PATH, 'utf8');
      return JSON.parse(data) as TelemetryEvent[];
    } catch {
      return [];
    }
  }
  
  export async function saveTelemetry(events: TelemetryEvent[]): Promise<void> {
    await fs.writeFile(TELEMETRY_PATH, JSON.stringify(events, null, 2), 'utf8');
  }
  
export function computeSummaryMetrics(
    db: Database,
    telemetry: TelemetryEvent[],
    confidenceThreshold = 0.7
  ): SummaryMetrics {
  const totalInteractions = db.interactionLogs.length;
  const corrections = db.corrections || [];

  const correctionRate = totalInteractions > 0 ? corrections.length / totalInteractions : 0;

  const uncertain = db.interactionLogs.filter((l) => l.confidenceScore < confidenceThreshold).length;
  const uncertaintyRatio = totalInteractions > 0 ? uncertain / totalInteractions : 0;

  const successes = db.interactionLogs.filter((l) => l.wasSuccessful).length;
  const successRate = totalInteractions > 0 ? successes / totalInteractions : 0;

  // Server currently does not record per-interaction latency; leave as null
  let medianLatencyMs: number | null = null;
  if (telemetry.length > 0) {
    const latencies = telemetry.map((t) => t.latencyMs).sort((a, b) => a - b);
    const mid = Math.floor(latencies.length / 2);
    medianLatencyMs =
      latencies.length % 2 !== 0
        ? latencies[mid]
        : (latencies[mid - 1] + latencies[mid]) / 2;
  }

  const misMap = new Map<string, number>();
  for (const c of corrections) {
    const key = `${c.predictedGesture}→${c.actualGesture}`;
    misMap.set(key, (misMap.get(key) || 0) + 1);
  }
  const topMisclassifications = Array.from(misMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, count]) => {
      const [predicted, actual] = k.split('→');
      return { predicted, actual, count };
    });

  return {
    correctionRate: Number(correctionRate.toFixed(2)),
    uncertaintyRatio: Number(uncertaintyRatio.toFixed(2)),
    successRate: Number(successRate.toFixed(2)),
    medianLatencyMs,
    topMisclassifications,
  };
}
