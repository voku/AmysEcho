import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchMlpModelWithFallback } from './modelClient';

function createResponse(body: Uint8Array, init: ResponseInit = {}) {
  return new Response(body, init);
}

describe('fetchMlpModelWithFallback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fragt personalisiertes Modell zuerst ab und fällt auf global zurück', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('not-found', { status: 404 }))
      .mockResolvedValueOnce(
        createResponse(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            'X-Model-Version': 'global-v1',
            'X-Model-Source': 'global',
          },
        }),
      );

    vi.stubGlobal('fetch', fetchMock as any);

    const result = await fetchMlpModelWithFallback({
      endpoint: 'https://api.example.com/api/v1/dgs/latest-mlp-model',
      token: 'abc',
      profileId: 'amy',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0] ?? [])[0]).toContain('profileId=amy');
    expect(result?.meta.source).toBe('global');
    expect(result?.meta.version).toBe('global-v1');
  });

  it('liefert personalisiertes Modell, wenn verfügbar', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse(new Uint8Array([5, 6, 7]), {
        status: 200,
        headers: {
          'X-Model-Version': 'p-2',
          'X-Model-Source': 'profile',
          'X-Model-Profile': 'amy',
        },
      }),
    );

    vi.stubGlobal('fetch', fetchMock as any);

    const result = await fetchMlpModelWithFallback({
      endpoint: 'https://api.example.com/api/v1/dgs/latest-mlp-model',
      profileId: 'amy',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result?.meta.source).toBe('profile');
    expect(result?.meta.profileId).toBe('amy');
    expect(result?.meta.version).toBe('p-2');
  });
});
