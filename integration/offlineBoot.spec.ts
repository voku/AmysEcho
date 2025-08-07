import { test } from 'node:test';
import assert from 'node:assert/strict';

async function bootApp(
  isOnline: boolean,
  preloadLocal: () => Promise<void>,
  primeRemote: () => Promise<void>,
) {
  if (!isOnline) {
    await preloadLocal();
  } else {
    await primeRemote();
  }
  return 'ready';
}

test('offline boot preloads local models and skips remote priming', async () => {
  let localCalls = 0;
  let remoteCalls = 0;
  const preloadLocal = async () => {
    localCalls++;
  };
  const primeRemote = async () => {
    remoteCalls++;
  };

  const state = await bootApp(false, preloadLocal, primeRemote);
  assert.equal(state, 'ready');
  assert.equal(localCalls, 1);
  assert.equal(remoteCalls, 0);
});
