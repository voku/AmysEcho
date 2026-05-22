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

  it('gibt undefined zurück, wenn keine brauchbare Job-ID vorhanden ist', () => {
    expect(extractTrainingJob({ trainingJob: { jobId: '   ' } })).toBeUndefined();
    expect(extractTrainingJob({ data: { status: 'running' } })).toBeUndefined();
  });

  it('normalisiert Status-Aliase und optionale Felder aus der Wurzelantwort', () => {
    const job = extractTrainingJob({
      id: ' job-2 ',
      status: 'success',
      pollUrl: '  /api/v1/train-status/job-2  ',
      queueDepth: Number.NaN,
      retryAfterMs: 2500,
    });

    expect(job).toEqual({
      jobId: 'job-2',
      status: 'completed',
      pollUrl: '/api/v1/train-status/job-2',
      retryAfterMs: 2500,
    });
  });
});

describe('triggerTrainingJob', () => {
  beforeEach(() => {
    fetchWithRetryMock.mockReset();
  });

  it('normalisiert API-Basis mit /api oder /api/v1 und ruft /api/v1/train-model auf', async () => {
    fetchWithRetryMock.mockResolvedValue(
      new Response(JSON.stringify({ jobId: 'job-77', status: 'queued' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await triggerTrainingJob('https://api.example.com/api/v1/', 'token-123');

    expect(result).toMatchObject({ jobId: 'job-77', status: 'queued' });
    expect(fetchWithRetryMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/train-model',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      }),
      expect.any(Object),
    );
  });

  it('verwendet bei leerer API-Basis denselben Ursprung', async () => {
    fetchWithRetryMock.mockResolvedValue(
      new Response(JSON.stringify({ jobId: 'job-relative', status: 'queued' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await triggerTrainingJob('   ', 'token-123');

    expect(result).toMatchObject({ jobId: 'job-relative', status: 'queued' });
    expect(fetchWithRetryMock).toHaveBeenCalledWith(
      '/api/v1/train-model',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      }),
      expect.any(Object),
    );
  });

  it('wirft einen HTTP-Fehler bei nicht erfolgreicher Antwort', async () => {
    fetchWithRetryMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'boom' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(triggerTrainingJob('https://api.example.com', 'token-123')).rejects.toMatchObject({
      status: 503,
      message: 'Training-Trigger fehlgeschlagen (HTTP 503).',
    });
  });

  it('übersetzt Abbrüche in eine deutsche Timeout-Fehlermeldung', async () => {
    fetchWithRetryMock.mockRejectedValue(new DOMException('aborted', 'AbortError'));

    await expect(triggerTrainingJob('https://api.example.com', 'token-123')).rejects.toThrow(
      'Trainings-Trigger wurde wegen einer Zeitüberschreitung abgebrochen.',
    );
  });
});
