const store: Record<string, string> = {};
const stub = {
  async getItem(key: string) { return store[key] ?? null; },
  async setItem(key: string, value: string) { store[key] = value; },
};

jest.mock('@react-native-async-storage/async-storage', () => stub);

import { logInteractionEvent, getGestureStats } from '../src/services/analytics';

describe('gesture success/failure stats', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
  });

  it('aggregates success and failure counts per gesture', async () => {
    const now = Date.now();
    await logInteractionEvent({
      gestureDefinitionId: 'g1',
      gestureName: 'G1',
      wasSuccessful: true,
      confidenceScore: 0.9,
      timestamp: now,
      processedBy: 'local',
    });
    await logInteractionEvent({
      gestureDefinitionId: 'g1',
      gestureName: 'G1',
      wasSuccessful: false,
      confidenceScore: 0.2,
      timestamp: now + 1,
      processedBy: 'cloud',
    });
    await logInteractionEvent({
      gestureDefinitionId: 'g2',
      gestureName: 'G2',
      wasSuccessful: true,
      confidenceScore: 0.8,
      timestamp: now + 2,
      processedBy: 'local',
    });

    const stats = await getGestureStats();
    expect(stats).toContainEqual({ gestureDefinitionId: 'g1', successCount: 1, failureCount: 1 });
    expect(stats).toContainEqual({ gestureDefinitionId: 'g2', successCount: 1, failureCount: 0 });
  });
});
