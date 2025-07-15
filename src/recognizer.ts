import fetch from 'node-fetch';

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

function classifyOffline(_landmarks: unknown): ClassificationResult {
  // Placeholder offline classifier. Real implementation will use TFLite.
  return { label: 'unknown', confidence: 0.5, processedBy: 'local' };
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
