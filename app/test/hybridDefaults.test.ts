import { HYBRID_DEFAULTS } from '../src/services/hybridDefaults';

describe('HYBRID_DEFAULTS', () => {
  it('matches plan thresholds and timeouts', () => {
    expect(HYBRID_DEFAULTS.localThreshold).toBeCloseTo(0.6, 5);
    expect(HYBRID_DEFAULTS.cloudThreshold).toBeCloseTo(0.8, 5);
    expect(HYBRID_DEFAULTS.remoteTimeoutMs).toBe(400);
    expect(HYBRID_DEFAULTS.maxConsecutiveTimeouts).toBe(3);
    expect(HYBRID_DEFAULTS.cooldownMs).toBe(10 * 60 * 1000);
  });
});
