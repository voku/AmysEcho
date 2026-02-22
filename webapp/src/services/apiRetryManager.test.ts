import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetry, withRetry } from './apiRetryManager';

describe('apiRetryManager', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns retry attempts for transient network errors', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TypeError('failed'))
      .mockResolvedValueOnce('ok');

    const result = await withRetry(operation, { maxRetries: 2, baseDelayMs: 0, maxDelayMs: 0 });

    expect(result.success).toBe(true);
    expect(result.data).toBe('ok');
    expect(result.attempts).toBe(2);
  });

  it('throws an informative error after exhausting retryable HTTP status retries', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('unavailable', {
        status: 503,
        statusText: 'Service Unavailable',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    // 503 is retryable by default config, so one retry should occur (2 total calls).
    await expect(
      fetchWithRetry('https://example.org/api', {}, { maxRetries: 1, baseDelayMs: 0, maxDelayMs: 0 }),
    ).rejects.toThrow('HTTP 503');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable HTTP status codes', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('bad request', {
        status: 400,
        statusText: 'Bad Request',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchWithRetry('https://example.org/api', {}, { maxRetries: 2, baseDelayMs: 0, maxDelayMs: 0 }),
    ).rejects.toThrow('HTTP 400');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
