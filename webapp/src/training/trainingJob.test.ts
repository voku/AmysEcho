import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractTrainingJob, triggerTrainingJob } from './trainingJob';

const fetchWithRetryMock = vi.hoisted(() => vi.fn());

vi.mock('../utils/http', async () => {
  const actual = await vi.importActual('../utils/http');
  return {
    ...actual,
    fetchWithRetry: fetchWithRetryMock,
  };
});

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

describe('triggerTrainingJob', () => {
  beforeEach(() => {
    fetchWithRetryMock.mockReset();
  });

  it('normalisiert API-Basis mit /api oder /api/v1 und ruft /train-model auf', async () => {
    fetchWithRetryMock.mockResolvedValue(
      new Response(JSON.stringify({ jobId: 'job-77', status: 'queued' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await triggerTrainingJob('https://api.example.com/api/v1/', 'token-123');

    expect(result).toMatchObject({ jobId: 'job-77', status: 'queued' });
    expect(fetchWithRetryMock).toHaveBeenCalledWith(
      'https://api.example.com/train-model',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      }),
      expect.any(Object),
    );
  });

});
