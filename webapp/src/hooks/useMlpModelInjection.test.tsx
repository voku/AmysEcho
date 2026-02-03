import { waitFor } from '@testing-library/dom';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useMlpModelInjection } from './useMlpModelInjection';

const refreshAccessTokenMock = vi.fn<() => Promise<string | null>>();
let apiTokenMock = 'token-123';

vi.mock('./useApiConfig', () => ({
  useApiConfig: () => ({
    modelEndpoint: 'http://localhost:5000/api/v1/models/latest',
    apiToken: apiTokenMock,
    refreshAccessToken: refreshAccessTokenMock,
  }),
}));

const installMlpMock = vi.hoisted(() =>
  vi.fn(() => {
    (window as any).__setMlpModelB64 = vi.fn().mockResolvedValue(true);
  }),
);

vi.mock('../gesture/installMlp', () => ({ installMlp: installMlpMock }));

describe('useMlpModelInjection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (window as any).__setMlpModelB64 = vi.fn().mockResolvedValue(true);
    installMlpMock.mockClear();
    installMlpMock.mockImplementation(() => {
      (window as any).__setMlpModelB64 = vi.fn().mockResolvedValue(true);
    });
    apiTokenMock = 'token-123';
    refreshAccessTokenMock.mockReset();
  });

  it('lädt personalisiertes Modell und meldet neue Version', async () => {
    const fetchMock = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(
        new Response(new Uint8Array([9, 9, 9]), {
          status: 200,
          headers: {
            'X-Model-Version': 'p-3',
            'X-Model-Source': 'profile',
            'X-Model-Profile': 'amy',
          },
        }),
      );

    vi.stubGlobal('fetch', fetchMock as any);

    const { result } = renderHook(() => useMlpModelInjection('amy'));

    await waitFor(() => {
      expect(result.current.notice).toContain('aktualisiert');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.lastMeta?.version).toBe('p-3');
    expect(result.current.lastMeta?.source).toBe('profile');
  });

  it('bleibt im idle-Status wenn kein Modell verfügbar ist (MLP ist optional)', async () => {
    const fetchMock = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock as any);
    (window as any).__setMlpModelB64 = vi.fn().mockResolvedValue(true);

    const { result } = renderHook(() => useMlpModelInjection('amy'));

    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    });

    expect(result.current.notice).toBeNull();
  });

  it('installiert Runtime, wenn __setMlpModelB64 fehlt', async () => {
    const fetchMock = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(
        new Response(new Uint8Array([1, 1, 1]), {
          status: 200,
          headers: {
            'X-Model-Version': 'p-4',
            'X-Model-Source': 'profile',
            'X-Model-Profile': 'amy',
          },
        }),
      );

    vi.stubGlobal('fetch', fetchMock as any);
    delete (window as any).__setMlpModelB64;

    const { result } = renderHook(() => useMlpModelInjection('amy'));

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    expect(installMlpMock).toHaveBeenCalled();
    expect(typeof (window as any).__setMlpModelB64).toBe('function');
  });

  it('meldet Fehlermeldung, wenn Injektion fehlschlägt', async () => {
    const fetchMock = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(
        new Response(new Uint8Array([2, 2, 2]), {
          status: 200,
          headers: {
            'X-Model-Version': 'p-5',
            'X-Model-Source': 'profile',
            'X-Model-Profile': 'amy',
          },
        }),
      );

    vi.stubGlobal('fetch', fetchMock as any);
    (window as any).__setMlpModelB64 = vi.fn().mockResolvedValue(false);

    const { result } = renderHook(() => useMlpModelInjection('amy'));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current.notice).toContain('nicht in die Laufzeit');
  });

  it('unterdrückt Hinweis, wenn dieselbe Modellversion erneut geladen wird', async () => {
    const firstResponse = new Response(new Uint8Array([3, 3, 3]), {
      status: 200,
      headers: {
        'X-Model-Version': 'p-6',
        'X-Model-Source': 'profile',
        'X-Model-Profile': 'amy',
      },
    });
    const secondResponse = new Response(new Uint8Array([3, 3, 3]), {
      status: 200,
      headers: {
        'X-Model-Version': 'p-6',
        'X-Model-Source': 'profile',
        'X-Model-Profile': 'amy',
      },
    });

    const fetchMock = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse);
    vi.stubGlobal('fetch', fetchMock as any);

    const { result } = renderHook(() => useMlpModelInjection('amy'));

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
      expect(result.current.notice).toContain('aktualisiert');
    });

    await result.current.refreshModel();

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
      expect(result.current.notice).toBeNull();
    });
  });

  it('lädt neue Version auf manuellen Refresh', async () => {
    const firstResponse = new Response(new Uint8Array([4, 4, 4]), {
      status: 200,
      headers: {
        'X-Model-Version': 'p-7',
        'X-Model-Source': 'profile',
        'X-Model-Profile': 'amy',
      },
    });
    const secondResponse = new Response(new Uint8Array([5, 5, 5]), {
      status: 200,
      headers: {
        'X-Model-Version': 'p-8',
        'X-Model-Source': 'profile',
        'X-Model-Profile': 'amy',
      },
    });

    const fetchMock = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse);
    vi.stubGlobal('fetch', fetchMock as any);

    const { result } = renderHook(() => useMlpModelInjection('amy'));

    await waitFor(() => {
      expect(result.current.lastMeta?.version).toBe('p-7');
    });

    await result.current.refreshModel();

    await waitFor(() => {
      expect(result.current.lastMeta?.version).toBe('p-8');
      expect(result.current.notice).toContain('aktualisiert');
    });
  });

  it('versucht Token-Refresh bei 401 und lädt Modell erneut', async () => {
    apiTokenMock = 'expired-token';
    refreshAccessTokenMock.mockResolvedValue('fresh-token');
    let firstCall = true;

    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/v1/models/latest')) {
        if (firstCall) {
          firstCall = false;
          return Promise.resolve(new Response('unauthorized', { status: 401 }));
        }
        return Promise.resolve(
          new Response(new Uint8Array([7, 7, 7]), {
            status: 200,
            headers: {
              'X-Model-Version': 'p-9',
              'X-Model-Source': 'profile',
              'X-Model-Profile': 'amy',
            },
          }),
        );
      }
      if (url.includes('/api/v1/auth/refresh')) {
        return Promise.resolve(
          new Response(JSON.stringify({ tokens: { accessToken: 'fresh-token', refreshToken: 'rt' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.reject(new Error('unexpected url'));
      },
    );

    vi.stubGlobal('fetch', fetchMock as any);

    const { result } = renderHook(() => useMlpModelInjection('amy'));

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
      expect(result.current.lastMeta?.version).toBe('p-9');
    });

    const authHeaders = fetchMock.mock.calls
      .map(([, init]) => (init?.headers as Record<string, string> | undefined)?.['Authorization'])
      .filter(Boolean);
    expect(authHeaders).toEqual(['Bearer expired-token', 'Bearer fresh-token']);
    expect(refreshAccessTokenMock).toHaveBeenCalled();
  });

  it('meldet Sitzung abgelaufen, wenn Token-Refresh fehlschlägt', async () => {
    apiTokenMock = 'expired-token';
    refreshAccessTokenMock.mockResolvedValue(null);

    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/api/v1/models/latest')) {
          return Promise.resolve(new Response('unauthorized', { status: 401 }));
        }
        if (url.includes('/api/v1/auth/refresh')) {
          return Promise.resolve(new Response('invalid refresh', { status: 400 }));
        }
        return Promise.reject(new Error('unexpected url'));
      },
    );

    vi.stubGlobal('fetch', fetchMock as any);

    const { result } = renderHook(() => useMlpModelInjection('amy'));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
      expect(result.current.notice).toContain('Sitzung abgelaufen');
    });
  });

  it('aktualisiert das Modell im Hintergrund in festem Intervall', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(
        new Response(new Uint8Array([8, 8, 8]), {
          status: 200,
          headers: {
            'X-Model-Version': 'p-10',
            'X-Model-Source': 'profile',
            'X-Model-Profile': 'amy',
          },
        }),
      );

    vi.stubGlobal('fetch', fetchMock as any);

    try {
      const { result, unmount } = renderHook(() => useMlpModelInjection('amy', { autoRefreshMs: 25 }));

      await act(async () => {
        await Promise.resolve();
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe('ready');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(fetchMock).toHaveBeenCalledTimes(3);
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
