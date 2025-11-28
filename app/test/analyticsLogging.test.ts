const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key: string) => store[key] ?? null,
  setItem: async (key: string, value: string) => { store[key] = value; },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logInteractionEvent, loadAnalytics } from '../src/services/analytics';

describe('Interaction analytics logging', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) {
      delete store[key];
    }
  });

  it('tracks success rate from logged interactions', async () => {
    const now = Date.now();
    await logInteractionEvent({
      gestureDefinitionId: 'g1',
      wasSuccessful: true,
      confidenceScore: 1,
      timestamp: now,
      processedBy: 'local',
    });
    await logInteractionEvent({
      gestureDefinitionId: 'g1',
      wasSuccessful: false,
      confidenceScore: 0,
      timestamp: now + 1,
      processedBy: 'local',
    });
    const analytics = await loadAnalytics();
    expect(analytics.successRate7d).toBe(0.5);
    expect(analytics.improvementTrend).toBe(0.5);
  });

  it('preserves caregiver overrides when provided', async () => {
    const now = Date.now();
    await logInteractionEvent({
      gestureDefinitionId: 'g1',
      wasSuccessful: false,
      confidenceScore: 0.4,
      timestamp: now,
      processedBy: 'local',
      caregiverOverrideId: 'alt1',
    });

    const raw = await AsyncStorage.getItem('interactionLogs');
    const logs = raw ? JSON.parse(raw) : [];
    expect(logs[0].caregiverOverrideId).toBe('alt1');
  });
});
