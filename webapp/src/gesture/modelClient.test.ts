import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fetchMlpModelWithFallback, onMlpModelUpdated } from './modelClient';

function createResponse(body: Uint8Array, init: ResponseInit = {}) {
  return new Response(body as BodyInit, init);
}

describe('fetchMlpModelWithFallback', () => {
  const originalRelativeEnv = (import.meta as any).env?.VITE_ENABLE_RELATIVE_DELTA_MODEL;

  beforeEach(() => {
    vi.restoreAllMocks();
    (import.meta as any).env.VITE_ENABLE_RELATIVE_DELTA_MODEL = '0';
  });

  afterEach(() => {
    (import.meta as any).env.VITE_ENABLE_RELATIVE_DELTA_MODEL = originalRelativeEnv;
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
      endpoint: 'https://api.example.com/api/v1/models/latest',
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
          'X-Model-Contract-Status': 'valid',
          'X-Model-Feature-Mode': 'absolute',
        },
      }),
    );

    vi.stubGlobal('fetch', fetchMock as any);

    const result = await fetchMlpModelWithFallback({
      endpoint: 'https://api.example.com/api/v1/models/latest',
      profileId: 'amy',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result?.meta.source).toBe('profile');
    expect(result?.meta.profileId).toBe('amy');
    expect(result?.meta.version).toBe('p-2');
    expect(result?.meta.contractStatus).toBe('valid');
    expect(result?.meta.featureMode).toBe('absolute');
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
      endpoint: 'https://api.example.com/api/v1/models/latest',
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
      endpoint: 'https://api.example.com/api/v1/models/latest',
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
      endpoint: 'https://api.example.com/api/v1/models/latest',
      profileId: 'amy',
    });

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('behandelt Netzwerkfehler und gibt null zurück', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMock as any);

    const result = await fetchMlpModelWithFallback({
      endpoint: 'https://api.example.com/api/v1/models/latest',
    });

    expect(result).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[MLP] Netzwerkfehler beim Laden des Modells',
      expect.objectContaining({ error: expect.any(Error) }),
    );
    consoleWarnSpy.mockRestore();
  });

  it('behandelt ungültige URL und gibt null zurück', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await fetchMlpModelWithFallback({
      endpoint: 'not-a-valid-url',
    });

    expect(result).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[MLP] Ungültige Endpoint-URL',
      expect.objectContaining({ endpoint: 'not-a-valid-url' }),
    );
    consoleWarnSpy.mockRestore();
  });

  it('sendet Authorization-Header mit Token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse(new Uint8Array([1]), {
        status: 200,
        headers: { 'X-Model-Source': 'global' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock as any);

    await fetchMlpModelWithFallback({
      endpoint: 'https://api.example.com/api/v1/models/latest',
      token: 'my-secret-token',
    });

    const [, options] = fetchMock.mock.calls[0] ?? [];
    expect(options.headers.Authorization).toBe('Bearer my-secret-token');
  });

  it('sendet X-Profile-Id Header mit profileId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse(new Uint8Array([1]), {
        status: 200,
        headers: { 'X-Model-Source': 'profile' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock as any);

    await fetchMlpModelWithFallback({
      endpoint: 'https://api.example.com/api/v1/models/latest',
      profileId: 'amy',
    });

    const [, options] = fetchMock.mock.calls[0] ?? [];
    expect(options.headers['X-Profile-Id']).toBe('amy');
  });

  it('trimmt Leerzeichen von profileId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse(new Uint8Array([1]), {
        status: 200,
        headers: { 'X-Model-Source': 'profile' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock as any);

    await fetchMlpModelWithFallback({
      endpoint: 'https://api.example.com/api/v1/models/latest',
      profileId: '  amy  ',
    });

    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(url).toContain('profileId=amy');
  });

  it('behandelt leere profileId wie keine profileId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse(new Uint8Array([1]), {
        status: 200,
        headers: { 'X-Model-Source': 'global' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock as any);

    await fetchMlpModelWithFallback({
      endpoint: 'https://api.example.com/api/v1/models/latest',
      profileId: '   ',
    });

    // Only one call (no fallback from profile to global)
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(url).not.toContain('profileId');
  });

  it('ruft Listener bei erfolgreichem Model-Laden auf', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse(new Uint8Array([1]), {
        status: 200,
        headers: {
          'X-Model-Source': 'profile',
          'X-Model-Version': 'v1',
          'X-Model-Profile': 'amy',
          'X-Model-Contract-Status': 'valid',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock as any);

    const listener = vi.fn();
    const unsub = onMlpModelUpdated(listener);

    await fetchMlpModelWithFallback({
      endpoint: 'https://api.example.com/api/v1/models/latest',
      profileId: 'amy',
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      source: 'profile',
      version: 'v1',
      profileId: 'amy',
      etag: null,
      contractStatus: 'valid',
      contractReason: null,
      featureMode: null,
    });

    unsub();
  });

  it('erlaubt Abmelden von Listener', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse(new Uint8Array([1]), {
        status: 200,
        headers: { 'X-Model-Source': 'global' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock as any);

    const listener = vi.fn();
    const unsub = onMlpModelUpdated(listener);
    unsub(); // Unsubscribe immediately

    await fetchMlpModelWithFallback({
      endpoint: 'https://api.example.com/api/v1/models/latest',
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('ignoriert Listener-Fehler', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse(new Uint8Array([1]), {
        status: 200,
        headers: { 'X-Model-Source': 'global' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock as any);

    const errorListener = vi.fn(() => {
      throw new Error('Listener error');
    });
    const normalListener = vi.fn();

    const unsub1 = onMlpModelUpdated(errorListener);
    const unsub2 = onMlpModelUpdated(normalListener);

    await fetchMlpModelWithFallback({
      endpoint: 'https://api.example.com/api/v1/models/latest',
    });

    // Normal listener should still be called even if error listener throws
    expect(normalListener).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });

  it('verwirft ungültige Modellverträge und fällt auf globales Modell zurück', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createResponse(new Uint8Array([9, 9]), {
          status: 200,
          headers: {
            'X-Model-Version': 'p-invalid',
            'X-Model-Source': 'profile',
            'X-Model-Profile': 'amy',
            'X-Model-Contract-Status': 'invalid',
            'X-Model-Contract-Reason': 'schema_version_mismatch',
          },
        }),
      )
      .mockResolvedValueOnce(
        createResponse(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            'X-Model-Version': 'global-v2',
            'X-Model-Source': 'global',
            'X-Model-Contract-Status': 'valid',
            'X-Model-Feature-Mode': 'absolute',
          },
        }),
      );

    vi.stubGlobal('fetch', fetchMock as any);

    const result = await fetchMlpModelWithFallback({
      endpoint: 'https://api.example.com/api/v1/models/latest',
      profileId: 'amy',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result?.meta.source).toBe('global');
    expect(result?.meta.version).toBe('global-v2');
    expect(result?.meta.contractStatus).toBe('valid');
    expect(result?.meta.featureMode).toBe('absolute');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[MLP] Server meldet ungültigen Modellvertrag, verwerfe Antwort',
      expect.objectContaining({
        profileId: 'amy',
        reason: 'schema_version_mismatch',
      }),
    );
    consoleWarnSpy.mockRestore();
  });

  it('verwirft relative_delta Modelle und fällt auf globales Modell zurück', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createResponse(new Uint8Array([9, 9]), {
          status: 200,
          headers: {
            'X-Model-Version': 'p-relative',
            'X-Model-Source': 'profile',
            'X-Model-Profile': 'amy',
            'X-Model-Contract-Status': 'valid',
            'X-Model-Feature-Mode': 'relative_delta',
          },
        }),
      )
      .mockResolvedValueOnce(
        createResponse(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            'X-Model-Version': 'global-v3',
            'X-Model-Source': 'global',
            'X-Model-Contract-Status': 'valid',
            'X-Model-Feature-Mode': 'absolute',
          },
        }),
      );

    vi.stubGlobal('fetch', fetchMock as any);

    const result = await fetchMlpModelWithFallback({
      endpoint: 'https://api.example.com/api/v1/models/latest',
      profileId: 'amy',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result?.meta.source).toBe('global');
    expect(result?.meta.version).toBe('global-v3');
    expect(result?.meta.featureMode).toBe('absolute');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[MLP] Relative Delta Feature-Modus wird im Web-Client noch nicht unterstützt, verwerfe Antwort',
      expect.objectContaining({
        profileId: 'amy',
        featureMode: 'relative_delta',
      }),
    );
    consoleWarnSpy.mockRestore();
  });

});
