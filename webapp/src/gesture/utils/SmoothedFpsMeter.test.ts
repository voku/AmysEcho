import { describe, expect, it } from 'vitest';
import { SmoothedFpsMeter } from './SmoothedFpsMeter';

describe('SmoothedFpsMeter', () => {
  it('computes average and p95 fps over recent frames', () => {
    const meter = new SmoothedFpsMeter(5);

    expect(meter.recordFrame(0)).toBeNull();
    meter.recordFrame(33);
    meter.recordFrame(66);
    meter.recordFrame(99);
    const stats = meter.recordFrame(132);

    expect(stats).not.toBeNull();
    expect(stats?.sampleCount).toBe(4);
    expect(stats?.fpsAvg).toBeGreaterThan(29);
    expect(stats?.fpsAvg).toBeLessThan(31);
    expect(stats?.fpsP95Window).toBeGreaterThan(29);
    expect(stats?.fpsP95Window).toBeLessThan(31);
  });

  it('drops old samples beyond max window size', () => {
    const meter = new SmoothedFpsMeter(3);

    meter.recordFrame(0);
    meter.recordFrame(16);
    meter.recordFrame(32);
    meter.recordFrame(64);
    const stats = meter.recordFrame(96);

    expect(stats?.sampleCount).toBe(3);
  });

  it('resets frame history', () => {
    const meter = new SmoothedFpsMeter();

    meter.recordFrame(0);
    meter.recordFrame(20);
    expect(meter.recordFrame(40)).not.toBeNull();

    meter.reset();
    expect(meter.recordFrame(60)).toBeNull();
  });
});
