import { test } from 'node:test';
import assert from 'node:assert/strict';

async function runWithFallback(remoteFn: () => Promise<string>, localFn: () => Promise<string>, timeout: number) {
  try {
    const remote = await Promise.race([
      remoteFn(),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout)),
    ]);
    if (remote) {
      return remote;
    }
  } catch {
    // swallow remote errors
  }
  return localFn();
}

test('local inference runs immediately when remote fails', async () => {
  let remoteCalls = 0;
  let localCalls = 0;

  const remoteFn = async () => {
    remoteCalls++;
    await new Promise((r) => setTimeout(r, 200));
    throw new Error('network');
  };
  const localFn = async () => {
    localCalls++;
    await new Promise((r) => setTimeout(r, 10));
    return 'local';
  };

  const baselineStart = Date.now();
  await new Promise((r) => setTimeout(r, 10));
  const baseline = Date.now() - baselineStart;

  const start = Date.now();
  const result = await runWithFallback(remoteFn, localFn, 50);
  const duration = Date.now() - start;

  assert.equal(result, 'local');
  assert.equal(remoteCalls, 1);
  assert.equal(localCalls, 1);
  assert.ok(duration - baseline <= 100);

  await runWithFallback(remoteFn, localFn, 50);
  assert.equal(remoteCalls, 2);
  assert.equal(localCalls, 2);
});

