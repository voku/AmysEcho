import { waitFor } from '@testing-library/dom';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { SymbolStoreProvider, useSymbolStore } from './SymbolStore';
import type { ReactNode } from 'react';

const showToastMock = vi.fn();
const refreshAccessTokenMock = vi.fn();

vi.mock('./MessageContext', async () => {
  const actual = await vi.importActual('./MessageContext');
  return {
    ...actual,
    useMessage: () => ({ showToast: showToastMock }),
    MessageProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});

vi.mock('../hooks/useApiConfig', () => ({
  useApiConfig: () => ({ 
    apiBaseUrl: 'http://localhost', 
    apiToken: 'token', 
    refreshAccessToken: refreshAccessTokenMock,
    clearApiToken: vi.fn(),
    sentenceImproveEndpoint: 'http://localhost/api/v1/metacom/sentence-improve',
  }),
}));

const mockProfileId = 'test-profile';
vi.mock('../hooks/useAppState', () => ({
  useAppState: () => ({ profileId: mockProfileId }),
  AppStateProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('SymbolStore offline handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    refreshAccessTokenMock.mockResolvedValue(null);
    
    // Default fetch mock handles the initial mount fetch
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ symbols: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <SymbolStoreProvider>{children}</SymbolStoreProvider>
  );

  it('keeps offline symbols pending and merges them after sync', async () => {
    const fetchMock = global.fetch as unknown as Mock;
    const makeSymbolsResponse = (symbols: unknown[] = []) =>
      new Response(JSON.stringify({ symbols }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    // Setup initial cache
    localStorage.setItem(
      `amysecho_symbols_${mockProfileId}`,
      JSON.stringify({ 
        symbols: [{ id: 'seed', name: 'Seed', category: 'seed', imageUrl: null }], 
        pending: [], 
        cachedAt: Date.now() 
      }),
    );

    // Initial fetch mock
    fetchMock.mockResolvedValue(makeSymbolsResponse([]));

    const { result } = renderHook(() => useSymbolStore(), { wrapper });

    // Wait for initialization from cache
    await waitFor(() => {
      const hasSeed = result.current.symbols.some(s => s.id === 'seed');
      expect(hasSeed).toBe(true);
    });

    // Simulate offline save (Network error)
    fetchMock.mockRejectedValueOnce(new TypeError('Network error'));

    await act(async () => {
      try {
        await result.current.saveSymbol({
          id: 'offline-symbol',
          name: 'Offline',
          category: 'custom',
          imageUrl: null,
          imageDataUrl: 'data:image/png;base64,AAA',
        });
      } catch {
        // expected
      }
    });

    // Verify it is in the list
    await waitFor(() => {
      const found = result.current.symbols.find((symbol) => symbol.id === 'offline-symbol');
      expect(found).toBeDefined();
    });

    // Prepare mocks for successful sync
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: 'offline-symbol', name: 'Offline', category: 'custom', imageUrl: null }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      makeSymbolsResponse([
        { id: 'seed', name: 'Seed', category: 'seed', imageUrl: null },
        { id: 'offline-symbol', name: 'Offline', category: 'custom', imageUrl: null }
      ]),
    );

    await act(async () => {
      await result.current.refresh();
    });

    // Verify final presence
    await waitFor(() => {
      const syncedSymbol = result.current.symbols.find((symbol) => symbol.id === 'offline-symbol');
      expect(syncedSymbol).toBeDefined();
      expect(syncedSymbol?.name).toBe('Offline');
    });
  });

  it('retries saving a symbol after refreshing an expired token', async () => {
    const fetchMock = global.fetch as unknown as Mock;
    refreshAccessTokenMock.mockResolvedValue('refreshed-token');

    const makeSymbolsResponse = (symbols: unknown[] = []) =>
      new Response(JSON.stringify({ symbols }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    fetchMock.mockResolvedValue(makeSymbolsResponse([]));

    const { result } = renderHook(() => useSymbolStore(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Operation 1: 401 Expired, Operation 2: 200 OK after retry
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'expired' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'refresh-id', name: 'Neu', category: 'cat', imageUrl: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    await act(async () => {
      await result.current.saveSymbol({
        id: 'refresh-id',
        name: 'Neu',
        category: 'cat',
        imageUrl: null,
      });
    });

    await waitFor(() => {
      const saved = result.current.symbols.find((symbol) => symbol.id === 'refresh-id');
      expect(saved).toBeDefined();
      expect(saved?.name).toBe('Neu');
    });

    expect(refreshAccessTokenMock).toHaveBeenCalled();
  });

  it('surfaces authentication expiry when refresh fails', async () => {
    const fetchMock = global.fetch as unknown as Mock;
    refreshAccessTokenMock.mockResolvedValue(null);

    const { result } = renderHook(() => useSymbolStore(), { wrapper });

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      act(async () => {
        await result.current.saveSymbol({ id: 'fail-id', name: 'Neu', category: 'cat', imageUrl: null });
      }),
    ).rejects.toThrowError();

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Sitzung abgelaufen') }),
      );
    });
  });


  it('does not show sync success toast when pending symbol upload is rejected with 4xx', async () => {
    const fetchMock = global.fetch as unknown as Mock;

    localStorage.setItem(
      `amysecho_symbols_${mockProfileId}`,
      JSON.stringify({
        symbols: [],
        pending: [{ id: 'bad-symbol', name: 'Bad', category: 'custom', imageUrl: null }],
        cachedAt: Date.now(),
      }),
    );

    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ message: 'ungueltig' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ symbols: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    renderHook(() => useSymbolStore(), { wrapper });

    await waitFor(() => {
      const toastMessages = showToastMock.mock.calls.map((call) => call[0]?.message);
      expect(toastMessages.some((message) => typeof message === 'string' && message.includes('konnte nicht synchronisiert werden'))).toBe(true);
    });

    const toastMessages = showToastMock.mock.calls.map((call) => call[0]?.message);
    expect(toastMessages).not.toContain('Offline gespeicherte Gebärden synchronisiert.');
  });



  it('removes 4xx-rejected pending symbols from pending state after refresh', async () => {
    const fetchMock = global.fetch as unknown as Mock;

    localStorage.setItem(
      `amysecho_symbols_${mockProfileId}`,
      JSON.stringify({
        symbols: [],
        pending: [{ id: 'reject-me', name: 'Reject', category: 'custom', imageUrl: null }],
        cachedAt: Date.now(),
      }),
    );

    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ message: 'ungueltig' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ symbols: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const { result } = renderHook(() => useSymbolStore(), { wrapper });

    await waitFor(() => {
      expect(result.current.symbols.some((symbol) => symbol.id === 'reject-me')).toBe(false);
    });

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => {
      const cache = JSON.parse(localStorage.getItem(`amysecho_symbols_${mockProfileId}`) || '{}');
      const pending = Array.isArray(cache.pending) ? cache.pending : [];
      expect(pending.some((symbol: { id: string }) => symbol.id === 'reject-me')).toBe(false);
    });
  });

  it('keeps symbol visible when server delete fails with 401 so caregivers are not misled', async () => {
    const fetchMock = global.fetch as unknown as Mock;

    localStorage.setItem(
      `amysecho_symbols_${mockProfileId}`,
      JSON.stringify({
        symbols: [{ id: 'keep-me', name: 'Behalten', category: 'custom', imageUrl: null }],
        pending: [],
        cachedAt: Date.now(),
      }),
    );

    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return new Response(JSON.stringify({ message: 'expired' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ symbols: [{ id: 'keep-me', name: 'Behalten', category: 'custom', imageUrl: null }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const { result } = renderHook(() => useSymbolStore(), { wrapper });

    await waitFor(() => {
      expect(result.current.symbols.some((symbol) => symbol.id === 'keep-me')).toBe(true);
    });

    await act(async () => {
      await result.current.removeSymbol('keep-me');
    });

    await waitFor(() => {
      expect(result.current.symbols.some((symbol) => symbol.id === 'keep-me')).toBe(true);
      expect(result.current.syncError).toContain('Sitzung');
    });
  });

  it('schedules one retry after transient symbol fetch errors without entering a refresh loop', async () => {
    const fetchMock = global.fetch as unknown as Mock;
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    const { result } = renderHook(() => useSymbolStore(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const baselineCalls = fetchMock.mock.calls.length;
    fetchMock.mockRejectedValueOnce(new TypeError('Network error'));

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.syncError).toBe('Netzwerkverbindung unterbrochen. Bitte Verbindung prüfen und erneut versuchen.');
    });

    const callsAfterRefresh = fetchMock.mock.calls.length;
    expect(callsAfterRefresh - baselineCalls).toBe(1);

    expect(setTimeoutSpy).toHaveBeenCalled();
    const retryDelays = setTimeoutSpy.mock.calls
      .map((call) => call[1])
      .filter((value): value is number => typeof value === 'number');
    expect(retryDelays.some((delay) => delay >= 1000)).toBe(true);
  });
});
