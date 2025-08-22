import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CentroidMap } from './dgsModelClient';

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
      const firstHand = Array.isArray(frame?.[0]) ? frame[0] : [];
      if (!firstHand || firstHand.length < 21) continue;
      if (!sums[label]) {
        sums[label] = { sum: firstHand.map(p => [0,0,0]), count: 0 };
      }
      const s = sums[label];
      for (let i=0;i<Math.min(21, firstHand.length);i++) {
        s.sum[i][0] += firstHand[i][0] || 0;
        s.sum[i][1] += firstHand[i][1] || 0;
        s.sum[i][2] += firstHand[i][2] || 0;
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

