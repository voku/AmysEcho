import fetch from 'node-fetch';
import { readFileSync } from 'fs';
import path from 'path';

export type ClassificationResult = {
  label: string;
  confidence: number;
  processedBy: 'cloud' | 'local';
};

const CLOUD_API_URL =
  process.env.CLOUD_API_URL || 'http://localhost:4000/classify';

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

function loadOfflineModel(): void {
  if (offlineModel) return;
  const modelPath =
    process.env.OFFLINE_MODEL_PATH || path.join(__dirname, 'offlineModel.json');
  try {
    const raw = readFileSync(modelPath, 'utf8');
    offlineModel = JSON.parse(raw) as Record<string, number[]>;
  } catch {
    offlineModel = null;
  }
}

function classifyOffline(landmarks: unknown): ClassificationResult {
  loadOfflineModel();
  if (!offlineModel || !Array.isArray(landmarks)) {
    return { label: 'unknown', confidence: 0.5, processedBy: 'local' };
  }
  const input = (landmarks as number[]).map(Number);

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
): Promise<ClassificationResult> {
  try {
    return await classifyOnline(landmarks);
  } catch {
    return classifyOffline(landmarks);
  }
}
