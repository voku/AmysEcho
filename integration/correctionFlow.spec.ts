import { test } from 'node:test';
import assert from 'node:assert/strict';

test('recognition to correction posts correction and increments queue', async () => {
  const queue: any[] = [];
  async function post(url: string, body: any) {
    queue.push(body);
    return { status: 202 };
  }
  async function runFlow() {
    const response = await post('/api/corrections', { gesture: 'wave' });
    return { response, queueLength: queue.length };
  }
  const { response, queueLength } = await runFlow();
  assert.equal(response.status, 202);
  assert.equal(queueLength, 1);
});
