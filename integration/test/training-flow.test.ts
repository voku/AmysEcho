import assert from 'node:assert';
import { setTimeout as delay } from 'node:timers/promises';
import { test, before, after } from 'node:test';

import { createTrainingZip, uploadTrainingZip } from '../../webapp/src/training/trainingBundle.ts';
import { triggerTrainingJob } from '../../webapp/src/training/trainingJob.ts';
import type { TrainingFrame } from '../../webapp/src/training/types.ts';
import {
  TEST_TOKEN,
  createProfile,
  serverHeaders,
  serverBaseUrl,
  startServer,
  stopServer,
} from './helpers/server.ts';

let trainingToken = '';
let trainingProfileId = '';

before(async () => {
  await startServer();

  const baseUrl = serverBaseUrl();
  const seed = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const username = `integration_${seed}`;
  const email = `${username}@example.com`;
  const password = 'integration-password';

  const registerResponse = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  assert.ok(
    registerResponse.status === 201 || registerResponse.status === 409,
    `expected register to return 201/409, got ${registerResponse.status}`,
  );

  const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (loginResponse.status === 200) {
    const loginBody = await loginResponse.json();
    const accessToken = loginBody?.tokens?.accessToken ?? loginBody?.accessToken;
    const userId = loginBody?.user?.id;
    assert.ok(typeof accessToken === 'string' && accessToken.length > 0, 'login did not return an access token');
    assert.ok(typeof userId === 'string' && userId.length > 0, 'login did not return user.id');

    trainingToken = accessToken;
    trainingProfileId = userId;
    return;
  }

  // In local integration environments, newly registered users may require email verification
  // before login is allowed. Verify we received that expected response before falling back.
  assert.strictEqual(loginResponse.status, 403, `unexpected login status ${loginResponse.status}`);
  const loginBody = await loginResponse.json().catch(() => ({}));
  assert.ok(
    typeof loginBody?.error === 'string' && loginBody.error.includes('E-Mail-Adresse'),
    'expected email verification message for local login fallback',
  );

  // Fallback to the integration service token while still running the full HTTP training workflow.
  const fallbackProfileId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await createProfile({ id: fallbackProfileId, displayName: 'Integration Test Profile' });
  trainingToken = TEST_TOKEN;
  trainingProfileId = fallbackProfileId;
});

after(stopServer);

async function waitForTrainingCompletion(pollUrl: string, headers: Record<string, string>) {
  const start = Date.now();
  const timeoutMs = 300_000;
  let lastStatus = 'unknown';

  while (Date.now() - start <= timeoutMs) {
    const statusResp = await fetch(pollUrl, { headers }).catch(() => null);
    if (!statusResp) {
      await delay(500);
      continue;
    }
    if (statusResp.status !== 200) {
      await delay(500);
      continue;
    }

    const info = await statusResp.json();
    if (info.status === 'failed') {
      assert.fail(`Training job failed: ${info.error || 'unknown error'}`);
    }
    if (typeof info.status === 'string' && info.status.trim().length > 0) {
      lastStatus = info.status;
    }
    if (info.status === 'completed') {
      return info;
    }

    await delay(500);
  }

  assert.fail(`training job did not complete before timeout (last status: ${lastStatus})`);
}

test('webapp training helpers integrate with live server via real HTTP auth flow', async () => {
  const baseUrl = serverBaseUrl();
  const frames: TrainingFrame[] = [
    {
      landmarks: [
        [
          [0.1, 0.2, 0.3],
          [0.11, 0.21, 0.31],
          [0.12, 0.22, 0.32],
        ],
      ],
      handedness: ['Left'],
    },
    {
      landmarks: [
        [
          [0.15, 0.25, 0.35],
          [0.16, 0.26, 0.36],
          [0.17, 0.27, 0.37],
        ],
      ],
      handedness: ['Right'],
    },
  ];

  const payload = {
    label: 'HALLO',
    profileId: trainingProfileId,
    frames,
    capturedAt: '2024-05-28T12:03:11Z',
    source: 'web://integration-test',
  };

  const zip = await createTrainingZip(payload);
  assert.ok(zip.byteLength > 0, 'zip creation failed');

  const uploadResult = await uploadTrainingZip(zip, {
    endpoint: `${baseUrl}/api/v1/dgs/sample-bundles`,
    token: trainingToken,
  });

  assert.ok(uploadResult.id.length > 0);
  const trainingJobFromUpload = uploadResult.trainingJob;

  const job = trainingJobFromUpload ?? (await triggerTrainingJob(baseUrl, trainingToken));
  assert.ok(job, 'expected a training job from upload or trigger');

  const pollUrl = job.pollUrl
    ? new URL(job.pollUrl, baseUrl).href
    : `${baseUrl}/api/v1/train-status/${job.jobId}`;

  const headers = serverHeaders(trainingToken);
  await waitForTrainingCompletion(pollUrl, headers);

  const modelRes = await fetch(`${baseUrl}/api/v1/models/latest`, { headers });
  assert.strictEqual(modelRes.status, 200);
  const modelBuffer = Buffer.from(await modelRes.arrayBuffer());
  assert.ok(modelBuffer.length > 0);
});
