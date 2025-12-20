import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetry } from './http';

describe('fetchWithRetry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('wiederholt fehlgeschlagene Requests bevor er erfolgreich zurückkehrt', async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    (globalThis as any).fetch = fetchSpy;

    const response = await fetchWithRetry('https://example.test', undefined, {
      retries: 2,
      retryDelayMs: 1,
      timeoutMs: 1000,
    });

    expect(response.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('bricht ab, wenn das Timeout ausgelöst wird', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });
    (globalThis as any).fetch = fetchSpy;

    const request = fetchWithRetry('https://example.test', undefined, {
      retries: 0,
      timeoutMs: 10,
    });
    const expectation = expect(request).rejects.toMatchObject({ name: 'AbortError' });

    await vi.advanceTimersByTimeAsync(20);

    await expectation;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
