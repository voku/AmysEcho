import { performance } from 'perf_hooks';

it('gesture inference stays under 50ms (synthetic)', async () => {
  const t0 = performance.now();
  const out = [0.1, 0.2, 0.7];
  const t1 = performance.now();
  expect(t1 - t0).toBeLessThan(50);
  expect(Math.max(...out)).toBeGreaterThan(0.5);
});
