import { test, describe } from 'node:test';
import assert from 'node:assert';

const PORT = 5050;
const BASE = `http://localhost:${PORT}`;
const AUTH = { Authorization: 'Bearer testtoken' };

async function get(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: { ...AUTH, ...headers } as any });
  return res;
}

describe('Model endpoints authorization and headers', () => {
  test('GET /latest-mlp-model requires matching X-Profile-Id when profileId is set', async () => {
    // Expect 404 if no model exists yet
    const res404 = await get(`/latest-mlp-model?profileId=p1`, { 'X-Profile-Id': 'p1' });
    assert([200, 404, 500].includes(res404.status));

    // Mismatch should be 403
    const res403 = await get(`/latest-mlp-model?profileId=p1`, { 'X-Profile-Id': 'someone-else' });
    assert.equal(res403.status, 403);
  });

  test('GET /model-metadata returns 404 when no MLP exists yet', async () => {
    const res = await get(`/model-metadata`);
    assert.equal(res.status, 404);
  });
});
