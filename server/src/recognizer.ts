import { readFileSync } from 'fs';
import path from 'path';
import config from './config/index.js';

export type ClassificationResult = {
  label: string;
  confidence: number;
  processedBy: 'cloud' | 'local';
};

const CLOUD_API_URL = config.cloudApiUrl;

const CLOUD_TIMEOUT_MS = 400;

// Define proper types for landmark data
type LandmarkPoint = [number, number, number] | number[];
type LandmarkData = LandmarkPoint[] | number[];

// Type guard for API response
interface CloudApiResponse {
  label: string;
  confidence: number;
}

function isValidCloudResponse(data: unknown): data is CloudApiResponse {
  return typeof data === 'object' &&
         data !== null &&
         typeof (data as any).label === 'string' &&
         typeof (data as any).confidence === 'number';
}

async function classifyOnline(landmarks: LandmarkData): Promise<ClassificationResult> {
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

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();

    if (!isValidCloudResponse(data)) {
      throw new Error('Invalid response format from cloud API');
    }

    return {
      label: data.label,
      confidence: Math.max(0, Math.min(1, data.confidence)), // Ensure confidence is between 0 and 1
      processedBy: 'cloud'
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

let offlineModel: Record<string, number[]> | null = null;

// Define proper types for model data
interface ModelData {
  model?: Record<string, number[]>;
  [key: string]: unknown;
}

function isValidModelData(data: unknown): data is ModelData {
  return typeof data === 'object' &&
         data !== null &&
         (typeof (data as any).model === 'object' || typeof data === 'object');
}

function loadOfflineModel(modelPath?: string, forceReload = false): void {
  if (offlineModel && !forceReload) return;

  const pathToUse = modelPath || config.offlineModelPath;

  try {
    const raw = readFileSync(pathToUse, 'utf8');
    const parsed = JSON.parse(raw);

    if (!isValidModelData(parsed)) {
      console.warn('Invalid model data format');
      offlineModel = null;
      return;
    }

    // Handle both direct model format and wrapped model format
    offlineModel = parsed.model || parsed as Record<string, number[]>;

    // Validate the model structure
    if (typeof offlineModel !== 'object' || offlineModel === null) {
      console.warn('Model data is not a valid object');
      offlineModel = null;
    }
  } catch (error) {
    console.warn('Failed to load offline model:', error);
    offlineModel = null;
  }
}

function flattenLandmarks(data: LandmarkData): number[] {
  if (!Array.isArray(data)) {
    return [];
  }

  const flattened: number[] = [];

  for (const item of data) {
    if (Array.isArray(item)) {
      // Handle nested arrays (landmark points)
      for (const coord of item) {
        const numCoord = typeof coord === 'number' ? coord : parseFloat(String(coord));
        flattened.push(isNaN(numCoord) ? 0 : numCoord);
      }
    } else if (typeof item === 'number') {
      // Handle flat number arrays
      flattened.push(item);
    } else {
      // Handle string numbers or other types
      const numItem = typeof item === 'string' ? parseFloat(item) : Number(item);
      flattened.push(isNaN(numItem) ? 0 : numItem);
    }
  }

  return flattened;
}

function classifyOffline(landmarks: LandmarkData, modelPath?: string, forceReload = false): ClassificationResult {
  loadOfflineModel(modelPath, forceReload);
  const input = flattenLandmarks(landmarks);

  if (!offlineModel || input.length === 0) {
    return { label: 'unknown', confidence: 0.0, processedBy: 'local' };
  }

  let bestLabel = 'unknown';
  let bestScore = Number.POSITIVE_INFINITY;

  for (const [label, centroid] of Object.entries(offlineModel)) {
    if (!Array.isArray(centroid) || centroid.length === 0) continue;

    let sum = 0;
    const compareLength = Math.min(centroid.length, input.length);

    for (let i = 0; i < compareLength; i++) {
      const inputVal = input[i] ?? 0;
      const centroidVal = centroid[i] ?? 0;
      const diff = inputVal - centroidVal;
      sum += diff * diff;
    }

    const dist = Math.sqrt(sum);
    if (dist < bestScore) {
      bestScore = dist;
      bestLabel = label;
    }
  }

  // Convert distance to confidence score (closer = higher confidence)
  const confidence = bestScore === Number.POSITIVE_INFINITY ? 0.0 : 1 / (1 + bestScore);

  return {
    label: bestLabel,
    confidence: Math.max(0, Math.min(1, confidence)), // Ensure confidence is between 0 and 1
    processedBy: 'local'
  };
}

export async function classifyGesture(
  landmarks: LandmarkData,
  modelPath?: string,
  forceReload = false,
): Promise<ClassificationResult> {
  try {
    return await classifyOnline(landmarks);
  } catch (error) {
    console.warn('Cloud classification failed, falling back to offline:', error);
    return classifyOffline(landmarks, modelPath, forceReload);
  }
}
