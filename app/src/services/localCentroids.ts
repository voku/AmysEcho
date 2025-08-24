import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CentroidMap } from './dgsModelClient';
import { flattenHands, frameHasAnyLandmarks } from './handUtils';

const TRAINING_KEY = 'gestureTrainingData';

type Frame = number[][][]; // hands -> 21x3

export async function buildLocalCentroids(): Promise<CentroidMap> {
  const raw = await AsyncStorage.getItem(TRAINING_KEY);
  if (!raw) return {};
  let data: Array<{ gestureDefinitionId: string; landmarkData: Frame[] | Frame[][][] }> = [];
  try { data = JSON.parse(raw); } catch { return {}; }

  const sums: Record<string, { sum: number[][]; count: number }> = {};
  for (const sample of data) {
    const label = sample.gestureDefinitionId;
    const framesAny = sample.landmarkData as any;
    const frames: Frame[] = Array.isArray(framesAny) ? framesAny : [];
    for (const frame of frames) {
      // Skip frames with no landmarks to avoid skewing centroids
      if (!frameHasAnyLandmarks(frame)) continue;
      const flat = flattenHands(frame);
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
  const centroids: CentroidMap = {} as any;
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
  let data: Array<{ gestureDefinitionId: string; landmarkData: Frame[] | Frame[][][] }> = [];
  try { data = JSON.parse(raw); } catch { return {}; }

  const counts: Record<string, number> = {};
  for (const sample of data) {
    const label = sample.gestureDefinitionId;
    if (!counts[label]) counts[label] = 0;
    counts[label] += 1;
  }
  return counts;
}

