import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(
  path.join(__dirname, '../src/services/HybridRecognizer.ts'),
  'utf8',
);
const match = src.match(/HYBRID_DEFAULTS\s*=\s*({[\s\S]*?})/);
// eslint-disable-next-line no-eval
const HYBRID_DEFAULTS = match ? eval('(' + match[1] + ')') : {};

describe('HYBRID_DEFAULTS', () => {
  it('matches plan thresholds and timeouts', () => {
    expect(HYBRID_DEFAULTS.localThreshold).toBeCloseTo(0.6, 5);
    expect(HYBRID_DEFAULTS.cloudThreshold).toBeCloseTo(0.8, 5);
    expect(HYBRID_DEFAULTS.remoteTimeoutMs).toBe(400);
    expect(HYBRID_DEFAULTS.maxConsecutiveTimeouts).toBe(3);
    expect(HYBRID_DEFAULTS.cooldownMs).toBe(10 * 60 * 1000);
  });
});
