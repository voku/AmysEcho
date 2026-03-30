import assert from 'node:assert';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';

import { createTrainingZip, uploadTrainingZip } from '../../webapp/src/training/trainingBundle.ts';
import type { TrainingFrame } from '../../webapp/src/training/types.ts';
import { TEST_TOKEN, createProfile, serverBaseUrl, startServer, stopServer } from './helpers/server.ts';

const REMOVED_ENDPOINTS = [
  '/train-model',
  '/api/models/profiles',
  '/api/user/profile',
  '/api/user/password',
] as const;

let accessToken = '';
let profileId = '';

before(async () => {
  await startServer();

  const baseUrl = serverBaseUrl();
  const seed = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const username = `contract_${seed}`;
  const email = `${username}@example.com`;
  const password = 'integration-password';

  const registerResponse = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  assert.ok([201, 409].includes(registerResponse.status), `unexpected register status ${registerResponse.status}`);

  const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (loginResponse.status === 200) {
    const loginBody = await loginResponse.json();
    const token = loginBody?.tokens?.accessToken;
    const userId = loginBody?.user?.id;
    assert.ok(typeof token === 'string' && token.length > 0, 'expected access token from login');
    assert.ok(typeof userId === 'string' && userId.length > 0, 'expected user id from login');
    accessToken = token;
    profileId = userId;
    return;
  }

  assert.strictEqual(loginResponse.status, 403, `unexpected login status ${loginResponse.status}`);
  profileId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await createProfile({ id: profileId, displayName: 'Contract Smoke Profile' });
  accessToken = TEST_TOKEN;
});

after(stopServer);

async function waitForTrainingStatus(baseUrl: string, pollUrl: string, token: string): Promise<void> {
  const absolutePollUrl = new URL(pollUrl, baseUrl).href;
  const timeoutMs = 300_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const response = await fetch(absolutePollUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 200) {
      const body = await response.json();
      if (body.status === 'failed') {
        assert.fail(`training failed: ${String(body.error ?? 'unknown error')}`);
      }
      if (body.status === 'completed') {
        return;
      }
    }
    await delay(400);
  }

  assert.fail(`training status polling timed out: ${absolutePollUrl}`);
}

test('contract smoke test uses only new routes (auth, export, upload, model, status)', async () => {
  const baseUrl = serverBaseUrl();
  const observedUrls = new Set<string>();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    observedUrls.add(url);
    return originalFetch(input, init);
  }) as typeof globalThis.fetch;

  try {
    const tokenHeader = { Authorization: `Bearer ${accessToken}` };

    const exportResponse = await fetch(`${baseUrl}/api/v1/profiles/${encodeURIComponent(profileId)}/export`, {
      headers: tokenHeader,
    });
    assert.ok([200, 404].includes(exportResponse.status), `unexpected export status ${exportResponse.status}`);

    const frames: TrainingFrame[] = [
      { landmarks: [[[0.1, 0.2, 0.3], [0.12, 0.22, 0.32], [0.14, 0.24, 0.34]]], handedness: ['Left'] },
      { landmarks: [[[0.2, 0.3, 0.4], [0.22, 0.32, 0.42], [0.24, 0.34, 0.44]]], handedness: ['Right'] },
    ];

    const zip = await createTrainingZip({
      label: 'HALLO',
      profileId,
      frames,
      capturedAt: new Date().toISOString(),
      source: 'web://contract-smoke',
    });

    const uploadResult = await uploadTrainingZip(zip, {
      endpoint: `${baseUrl}/api/v1/dgs/sample-bundles`,
      token: accessToken,
    });

    assert.ok(uploadResult.trainingJob, 'expected training job from upload response');
    await waitForTrainingStatus(baseUrl, uploadResult.trainingJob.pollUrl, accessToken);

    const modelResponse = await fetch(`${baseUrl}/api/v1/models/latest?profileId=${encodeURIComponent(profileId)}`, {
      headers: tokenHeader,
    });
    assert.ok([200, 404].includes(modelResponse.status), `unexpected model status ${modelResponse.status}`);
  } finally {
    globalThis.fetch = originalFetch;
  }

  for (const removed of REMOVED_ENDPOINTS) {
    const hitRemoved = Array.from(observedUrls).some((url) => {
      const pathname = new URL(url).pathname;
      return pathname === removed;
    });
    assert.strictEqual(hitRemoved, false, `removed endpoint was called: ${removed}`);
  }
});
