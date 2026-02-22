import { describe, expect, it, vi } from 'vitest';
import { fetchWithRetry, withRetry } from './apiRetryManager';

describe('apiRetryManager', () => {
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
        }),
      ),
    );

    await expect(
      fetchWithRetry('https://example.org/api', {}, { maxRetries: 1, baseDelayMs: 0, maxDelayMs: 0 }),
    ).rejects.toThrow('HTTP 503');
  });
});
