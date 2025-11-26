import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ApiConfigProvider } from './useApiConfig';
import { useMlpModelInjection } from './useMlpModelInjection';

function wrapper({ children }: { children: React.ReactNode }) {
  return <ApiConfigProvider>{children}</ApiConfigProvider>;
}

describe('useMlpModelInjection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (window as any).__setMlpModelB64 = vi.fn().mockResolvedValue(true);
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
});
