const store: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key: string) => store[key] ?? null,
  setItem: async (key: string, value: string) => {
    store[key] = value;
  },
  removeItem: async (key: string) => {
    delete store[key];
  },
  getAllKeys: async () => Object.keys(store),
  multiGet: async (keys: string[]) => keys.map((key) => [key, store[key] ?? null]),
}));

jest.mock('../../src/services/trainingSyncScheduler', () => ({
  scheduleTrainingSync: jest.fn(),
}));

const { scheduleTrainingSync } = require('../../src/services/trainingSyncScheduler') as {
  scheduleTrainingSync: jest.Mock;
};

import type { TrainingSample } from '../../src/storage';
import {
  enqueueTrainingBundle,
  listQueuedTrainingBundles,
  removeQueuedTrainingBundle,
} from '../../src/services/trainingBundleQueue';

describe('trainingBundleQueue', () => {
  const baseSample: TrainingSample = {
    id: 'sample-1',
    profileId: 'amy',
    label: 'HALLO',
    frames: [],
    clipUri: 'file://clip.mp4',
    stillUri: 'file://still.jpg',
    source: 'HIP_2',
    capturedAt: '2024-05-28T12:03:11Z',
    createdAt: '2024-05-28T12:03:11Z',
    syncStatus: 'pending',
  };

  beforeEach(() => {
    for (const key of Object.keys(store)) {
      delete store[key];
    }
  });

  it('enqueues bundles and lists them per profile', async () => {
    const key = await enqueueTrainingBundle(baseSample);
    expect(key.startsWith('trainingBundles:amy:')).toBe(true);
    expect(scheduleTrainingSync).toHaveBeenCalled();

    const list = await listQueuedTrainingBundles('amy');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      key,
      sampleId: baseSample.id,
      profileId: baseSample.profileId,
      label: baseSample.label,
      clipUri: baseSample.clipUri,
      stillUri: baseSample.stillUri,
      capturedAt: baseSample.capturedAt,
    });
  });

  it('filters bundles by profile and removes them', async () => {
    scheduleTrainingSync.mockClear();
    const sampleB: TrainingSample = {
      ...baseSample,
      id: 'sample-2',
      profileId: 'ben',
      label: 'TSCHUESS',
      stillUri: 'file://still-b.jpg',
    };

    const keyAmy = await enqueueTrainingBundle(baseSample);
    const keyBen = await enqueueTrainingBundle(sampleB);

    const amyBundles = await listQueuedTrainingBundles('amy');
    expect(amyBundles.map((b) => b.key)).toEqual([keyAmy]);

    await removeQueuedTrainingBundle(keyAmy);
    const remainingKeys = Object.keys(store);
    expect(remainingKeys).toContain(keyBen);
    expect(remainingKeys).not.toContain(keyAmy);
  });

  it('sorts bundles by queuedAt timestamp', async () => {
    scheduleTrainingSync.mockClear();
    const first = await enqueueTrainingBundle(baseSample);
    const delayed: TrainingSample = {
      ...baseSample,
      id: 'sample-3',
      createdAt: '2024-05-28T12:05:11Z',
      stillUri: 'file://still-c.jpg',
    };
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(Date.now() + 5);
    const second = await enqueueTrainingBundle(delayed);
    nowSpy.mockRestore();

    const bundles = await listQueuedTrainingBundles('amy');
    expect(bundles.map((b) => b.key)).toEqual([first, second]);
  });
});
