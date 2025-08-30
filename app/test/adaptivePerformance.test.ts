import { AdaptivePerformanceManager } from '../src/services/AdaptivePerformanceManager';

describe('AdaptivePerformanceManager', () => {
  it('always keeps high performance', async () => {
    const mgr = new AdaptivePerformanceManager();
    const profile = await mgr.getProfile();
    expect(profile.lowPower).toBe(false);
    expect(profile.fps).toBe(8);
  });
});

