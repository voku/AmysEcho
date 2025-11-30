import assert from 'node:assert';
import { setTimeout as delay } from 'node:timers/promises';
import { test, before, after } from 'node:test';

import { createTrainingZip, uploadTrainingZip } from '../../webapp/src/training/trainingBundle.ts';
import { triggerTrainingJob } from '../../webapp/src/training/trainingJob.ts';
import type { TrainingFrame } from '../../webapp/src/training/types.ts';
import {
  TEST_PORT,
  TEST_TOKEN,
  serverHeaders,
  startServer,
  stopServer,
} from './helpers/server.js';

before(startServer);
after(stopServer);

test('webapp training helpers integrate with live server', async () => {
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
    profileId: 'p-integration',
    frames,
    capturedAt: '2024-05-28T12:03:11Z',
    source: 'web://integration-test',
  };

  const zip = await createTrainingZip(payload);
  assert.ok(zip.byteLength > 0, 'zip creation failed');

  const uploadResult = await uploadTrainingZip(zip, {
    endpoint: `http://localhost:${TEST_PORT}/api/v1/dgs/sample-bundles`,
    token: TEST_TOKEN,
  });

  assert.ok(uploadResult.id.length > 0);
  const trainingJobFromUpload = uploadResult.trainingJob;

  const job =
    trainingJobFromUpload ?? (await triggerTrainingJob(`http://localhost:${TEST_PORT}`, TEST_TOKEN));
  assert.ok(job, 'expected a training job from upload or trigger');

  const pollUrl = job.pollUrl
    ? new URL(job.pollUrl, `http://localhost:${TEST_PORT}`).href
    : `http://localhost:${TEST_PORT}/train-status/${job.jobId}`;

  const headers = serverHeaders();
  const start = Date.now();
  const timeoutMs = 30_000;
  let completed = false;
  while (Date.now() - start <= timeoutMs) {
    const statusResp = await fetch(pollUrl, { headers }).catch(() => null);
    if (!statusResp) {
      await delay(250);
      continue;
    }
    if (statusResp.status !== 200) {
      await delay(250);
      continue;
    }
    const info = await statusResp.json();
    if (info.status === 'failed') {
      assert.fail(`Training job failed: ${info.error || 'unknown error'}`);
    }
    if (info.status === 'completed') {
      completed = true;
      break;
    }
    await delay(250);
  }

  assert.ok(completed, 'training job did not complete before timeout');

  const modelRes = await fetch(`http://localhost:${TEST_PORT}/latest-mlp-model`, { headers });
  assert.strictEqual(modelRes.status, 200);
  const modelBuffer = Buffer.from(await modelRes.arrayBuffer());
  assert.ok(modelBuffer.length > 0);
});
