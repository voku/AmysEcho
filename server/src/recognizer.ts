import { readFileSync } from 'fs';
import path from 'path';
import config from './config';

export type ClassificationResult = {
  label: string;
  confidence: number;
  processedBy: 'cloud' | 'local';
};

const CLOUD_API_URL = config.cloudApiUrl;

const CLOUD_TIMEOUT_MS = 400;

async function classifyOnline(landmarks: unknown): Promise<ClassificationResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLOUD_TIMEOUT_MS);
  try {
    const res = await fetch(CLOUD_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ landmarks }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = (await res.json()) as { label: string; confidence: number };
    return { ...data, processedBy: 'cloud' };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

let offlineModel: Record<string, number[]> | null = null;

function loadOfflineModel(modelPath?: string, forceReload = false): void {
  if (offlineModel && !forceReload) return;
  const pathToUse = modelPath || config.offlineModelPath;
  try {
    const raw = readFileSync(pathToUse, 'utf8');
    const parsed = JSON.parse(raw) as
      | Record<string, number[]>
      | { model: Record<string, number[]> };
    offlineModel = (parsed as any).model ? (parsed as any).model : parsed;
  } catch {
    offlineModel = null;
  }
}

function flattenLandmarks(data: unknown): number[] {
  if (!Array.isArray(data)) {
    return [];
  }
  return (data as any[]).flat(Infinity).map((v) => Number(v ?? 0));
}

function classifyOffline(landmarks: unknown, modelPath?: string, forceReload = false): ClassificationResult {
  loadOfflineModel(modelPath, forceReload);
  const input = flattenLandmarks(landmarks);
  if (!offlineModel || input.length === 0) {
    return { label: 'unknown', confidence: 0.5, processedBy: 'local' };
  }

  let bestLabel = 'unknown';
  let bestScore = Number.POSITIVE_INFINITY;

  for (const [label, centroid] of Object.entries(offlineModel)) {
    let sum = 0;
    for (let i = 0; i < Math.min(centroid.length, input.length); i++) {
      const diff = input[i] - centroid[i];
      sum += diff * diff;
    }
    const dist = Math.sqrt(sum);
    if (dist < bestScore) {
      bestScore = dist;
      bestLabel = label;
    }
  }

  const confidence = 1 / (1 + bestScore);
  return { label: bestLabel, confidence, processedBy: 'local' };
}

export async function classifyGesture(
  landmarks: unknown,
  modelPath?: string,
  forceReload = false,
): Promise<ClassificationResult> {
  try {
    return await classifyOnline(landmarks);
  } catch {
    return classifyOffline(landmarks, modelPath, forceReload);
  }
}
