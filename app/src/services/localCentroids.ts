import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CentroidMap } from './dgsModelClient';
import type { FrameData } from '../types/frames';
import { flattenHandsWithHandedness, frameHasAnyLandmarks } from './handUtils';

const TRAINING_KEY = 'gestureTrainingData';

export async function buildLocalCentroids(): Promise<CentroidMap> {
  const raw = await AsyncStorage.getItem(TRAINING_KEY);
  if (!raw) return {};
  let data: Array<{ gestureDefinitionId: string; frames?: FrameData[]; landmarkData?: any }>; // backward compat
  try { data = JSON.parse(raw); } catch { return {}; }

  const sums: Record<string, { sum: number[][]; count: number }> = {};
  for (const sample of data) {
    const label = sample.gestureDefinitionId;
    const framesAny = sample.frames || sample.landmarkData;
    const frames: (FrameData | number[][][])[] = Array.isArray(framesAny) ? framesAny : [];
    for (const f of frames) {
      if (!f) {
        continue;
      }
      const lms = Array.isArray(f) ? f : f.landmarks || [];
      const handed = Array.isArray(f) ? [] : f.handedness || [];
      if (!frameHasAnyLandmarks(lms)) continue;
      const flat = flattenHandsWithHandedness(lms, handed);
      if (!sums[label]) {
        sums[label] = { sum: flat.map(() => [0, 0, 0]), count: 0 };
      }
      const s = sums[label];
      for (let i = 0; i < flat.length; i++) {
        s.sum[i][0] += flat[i][0] || 0;
        s.sum[i][1] += flat[i][1] || 0;
        s.sum[i][2] += flat[i][2] || 0;
      }
      s.count += 1;
    }
  }
  const centroids: CentroidMap = {};
  for (const [label, { sum, count }] of Object.entries(sums)) {
    if (count > 0) {
      centroids[label] = sum.map(([x,y,z]) => [x/count, y/count, z/count]);
    }
  }
  return centroids;
}

export async function getLocalCentroidSummary(): Promise<Record<string, number>> {
  const raw = await AsyncStorage.getItem(TRAINING_KEY);
  if (!raw) return {};
  let data: Array<{ gestureDefinitionId: string }> = [];
  try { data = JSON.parse(raw); } catch { return {}; }

  const counts: Record<string, number> = {};
  for (const sample of data) {
    const label = sample.gestureDefinitionId;
    if (!counts[label]) counts[label] = 0;
    counts[label] += 1;
  }
  return counts;
}

