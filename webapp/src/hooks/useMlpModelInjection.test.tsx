import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ApiConfigProvider } from './useApiConfig';
import { useMlpModelInjection } from './useMlpModelInjection';

const installMlpMock = vi.hoisted(() =>
  vi.fn(() => {
    (window as any).__setMlpModelB64 = vi.fn().mockResolvedValue(true);
  }),
);

vi.mock('../gesture/installMlp', () => ({ installMlp: installMlpMock }));

function wrapper({ children }: { children: React.ReactNode }) {
  return <ApiConfigProvider>{children}</ApiConfigProvider>;
}

describe('useMlpModelInjection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (window as any).__setMlpModelB64 = vi.fn().mockResolvedValue(true);
    installMlpMock.mockClear();
    installMlpMock.mockImplementation(() => {
      (window as any).__setMlpModelB64 = vi.fn().mockResolvedValue(true);
    });
  });

  it('lädt personalisiertes Modell und meldet neue Version', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
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

    const { result } = renderHook(() => useMlpModelInjection('amy'), { wrapper });

    await waitFor(() => {
      expect(result.current.notice).toContain('Neues');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.lastMeta?.version).toBe('p-3');
    expect(result.current.lastMeta?.source).toBe('profile');
  });

  it('fällt bei Fehler auf Fehlerstatus zurück', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock as any);
    (window as any).__setMlpModelB64 = vi.fn().mockResolvedValue(true);

    const { result } = renderHook(() => useMlpModelInjection('amy'), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current.notice).toContain('Modell konnte nicht geladen werden');
  });

  it('installiert Runtime, wenn __setMlpModelB64 fehlt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
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

    const { result } = renderHook(() => useMlpModelInjection('amy'), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    expect(installMlpMock).toHaveBeenCalled();
    expect(typeof (window as any).__setMlpModelB64).toBe('function');
  });

  it('meldet Fehlermeldung, wenn Injektion fehlschlägt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
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

    const { result } = renderHook(() => useMlpModelInjection('amy'), { wrapper });

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

    const fetchMock = vi.fn().mockResolvedValueOnce(firstResponse).mockResolvedValueOnce(secondResponse);
    vi.stubGlobal('fetch', fetchMock as any);

    const { result } = renderHook(() => useMlpModelInjection('amy'), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
      expect(result.current.notice).toContain('Neues');
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

    const fetchMock = vi.fn().mockResolvedValueOnce(firstResponse).mockResolvedValueOnce(secondResponse);
    vi.stubGlobal('fetch', fetchMock as any);

    const { result } = renderHook(() => useMlpModelInjection('amy'), { wrapper });

    await waitFor(() => {
      expect(result.current.lastMeta?.version).toBe('p-7');
    });

    await result.current.refreshModel();

    await waitFor(() => {
      expect(result.current.lastMeta?.version).toBe('p-8');
      expect(result.current.notice).toContain('p-8');
    });
  });
});
