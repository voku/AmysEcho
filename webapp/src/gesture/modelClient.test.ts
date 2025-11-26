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
      endpoint: 'https://api.example.com/latest-mlp-model',
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
      endpoint: 'https://api.example.com/latest-mlp-model',
      profileId: 'amy',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result?.meta.source).toBe('profile');
    expect(result?.meta.profileId).toBe('amy');
    expect(result?.meta.version).toBe('p-2');
  });

  it('fällt auf übergebenes Profil zurück, wenn Header fehlen', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse(new Uint8Array([9]), {
        status: 200,
        headers: {
          'X-Model-Source': 'profile',
        },
      }),
    );

    vi.stubGlobal('fetch', fetchMock as any);

    const result = await fetchMlpModelWithFallback({
      endpoint: 'https://api.example.com/latest-mlp-model',
      profileId: 'amy',
    });

    expect(result?.meta.source).toBe('profile');
    expect(result?.meta.profileId).toBe('amy');
    expect(result?.meta.version).toBeNull();
  });

  it('nutzt Fallback-Quelle, wenn Header ungültig sind', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse(new Uint8Array([4]), {
        status: 200,
        headers: {
          'X-Model-Version': 'g-1',
          'X-Model-Source': 'unbekannt',
        },
      }),
    );

    vi.stubGlobal('fetch', fetchMock as any);

    const result = await fetchMlpModelWithFallback({
      endpoint: 'https://api.example.com/latest-mlp-model',
    });

    expect(result?.meta.source).toBe('global');
    expect(result?.meta.version).toBe('g-1');
  });

  it('gibt null zurück, wenn sowohl Profil- als auch Globalmodell fehlen', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockResolvedValueOnce(new Response('nope', { status: 404 }));

    vi.stubGlobal('fetch', fetchMock as any);

    const result = await fetchMlpModelWithFallback({
      endpoint: 'https://api.example.com/latest-mlp-model',
      profileId: 'amy',
    });

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
