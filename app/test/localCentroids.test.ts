const store: Record<string, string> = {};
const asyncStub = {
  async getItem(key: string) {
    return store[key] ?? null;
  },
  async setItem(key: string, value: string) {
    store[key] = value;
  },
  async removeItem(key: string) {
    delete store[key];
  },
};

jest.mock('@react-native-async-storage/async-storage', () => asyncStub);

import { buildLocalCentroids, getLocalCentroidSummary } from '../src/services/localCentroids';

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

describe('local centroids', () => {
  it('builds centroids from mixed frame formats and skips invalid frames', async () => {
    const makeHand = (val: number) => Array.from({ length: 21 }, () => [val, val, val]);
    const frameNew = { landmarks: [makeHand(1), makeHand(1)], handedness: ['left', 'right'] };
    const frameOld = [makeHand(3), makeHand(3)];
    const data = [
      { gestureDefinitionId: 'g1', frames: [frameNew, null as any, { landmarks: [], handedness: [] }] },
      { gestureDefinitionId: 'g1', landmarkData: [frameOld] },
    ];
    await asyncStub.setItem('gestureTrainingData', JSON.stringify(data));
    const centroids = await buildLocalCentroids();
    expect(Object.keys(centroids)).toEqual(['g1']);
    expect(centroids.g1.length).toBe(42);
    for (const p of centroids.g1) {
      expect(p).toEqual([2, 2, 2]);
    }
  });

  it('summarizes sample counts per gesture', async () => {
    const samples = [
      { gestureDefinitionId: 'g1' },
      { gestureDefinitionId: 'g1' },
      { gestureDefinitionId: 'g2' },
    ];
    await asyncStub.setItem('gestureTrainingData', JSON.stringify(samples));
    const summary = await getLocalCentroidSummary();
    expect(summary).toEqual({ g1: 2, g2: 1 });
  });
});
