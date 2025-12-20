import { describe, expect, it } from 'vitest';
import { extractTrainingJob } from './trainingJob';

describe('extractTrainingJob', () => {
  it('übernimmt Queue-Metadaten aus verschachtelten Antworten', () => {
    const payload = {
      trainingJob: {
        jobId: 'job-1',
        status: 'queued',
        pollUrl: '/api/v1/train-status/job-1',
        queueDepth: 3,
        retryAfterMs: 1500,
      },
    };

    const job = extractTrainingJob(payload);
    expect(job).toMatchObject({
      jobId: 'job-1',
      status: 'queued',
      pollUrl: '/api/v1/train-status/job-1',
      queueDepth: 3,
      retryAfterMs: 1500,
    });
  });
});
