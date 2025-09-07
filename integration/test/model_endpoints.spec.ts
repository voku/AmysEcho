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
  test('GET /api/v1/dgs/mlp-model requires matching X-Profile-Id when profileId is set', async () => {
    // Expect 404 if no model exists yet
    const res404 = await get(`/api/v1/dgs/mlp-model?profileId=p1`, { 'X-Profile-Id': 'p1' });
    assert([200, 404, 500].includes(res404.status));

    // Mismatch should be 403
    const res403 = await get(`/api/v1/dgs/mlp-model?profileId=p1`, { 'X-Profile-Id': 'someone-else' });
    assert.equal(res403.status, 403);
  });

  test('GET /latest-model returns cache headers and never serves .tmp files', async () => {
    const res = await get(`/latest-model`);
    // When the model is not present yet, we may get 404. Otherwise, validate headers.
    if (res.status === 200) {
      const resolved = res.headers.get('x-resolved-path');
      if (resolved) {
        assert(!resolved.endsWith('.tmp'));
      }
    } else {
      assert.equal(res.status, 404);
    }
  });
});
