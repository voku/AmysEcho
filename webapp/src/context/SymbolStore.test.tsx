import { act, renderHook, waitFor } from '@testing-library/react';
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
  useApiConfig: () => ({ apiBaseUrl: 'http://localhost', apiToken: 'token', refreshAccessToken: refreshAccessTokenMock }),
}));

vi.mock('../hooks/useAppState', () => ({
  useAppState: () => ({ profileId: 'test-profile' }),
  AppStateProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('SymbolStore offline handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    refreshAccessTokenMock.mockResolvedValue(null);
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

  it('keeps offline symbols pending and merges them after sync', async () => {
    const fetchMock = global.fetch as unknown as Mock;
    const makeSymbolsResponse = (symbols: unknown[] = []) =>
      new Response(JSON.stringify({ symbols }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    localStorage.setItem(
      'amysecho_symbols_test-profile',
      JSON.stringify({ symbols: [{ id: 'seed', name: 'Seed', category: 'seed', imageUrl: null }], pending: [], cachedAt: Date.now() }),
    );

    fetchMock
      .mockResolvedValueOnce(makeSymbolsResponse([{ id: 'seed', name: 'Seed', category: 'seed', imageUrl: null }])) // Mount fetch
      .mockRejectedValueOnce(new TypeError('Network error')) // saveSymbol attempt 1
      .mockResolvedValueOnce( // flush attempt during refresh
        new Response(
          JSON.stringify({ id: 'offline-symbol', name: 'Offline', category: 'custom', imageUrl: null }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce( // final fetch attempt
        makeSymbolsResponse([
          { id: 'seed', name: 'Seed', category: 'seed', imageUrl: null },
          { id: 'offline-symbol', name: 'Offline', category: 'custom', imageUrl: null }
        ]),
      );

    const wrapper = ({ children }: { children: ReactNode }) => (
      <SymbolStoreProvider>{children}</SymbolStoreProvider>
    );

    const { result } = renderHook(() => useSymbolStore(), { wrapper });

    await act(async () => {
      await result.current.saveSymbol({
        id: 'offline-symbol',
        name: 'Offline',
        category: 'custom',
        imageUrl: null,
        imageDataUrl: 'data:image/png;base64,AAA',
      });
    });

    await waitFor(() => {
      const found = result.current.symbols.find((symbol) => symbol.id === 'offline-symbol');
      expect(found).toBeDefined();
    }, { timeout: 2000 });

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => {
      const syncedSymbol = result.current.symbols.find((symbol) => symbol.id === 'offline-symbol');
      expect(syncedSymbol).toBeDefined();
      expect(syncedSymbol?.name).toBe('Offline');
    }, { timeout: 2000 });

    const cacheAfter = JSON.parse(localStorage.getItem('amysecho_symbols_test-profile') ?? '{}');
    expect(cacheAfter.pending?.length ?? 0).toBe(0);
  });

  it('does not cache symbols rejected by the server', async () => {
    const fetchMock = global.fetch as unknown as Mock;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Ungültige Daten' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const wrapper = ({ children }: { children: ReactNode }) => (
      <SymbolStoreProvider>{children}</SymbolStoreProvider>
    );

    const { result } = renderHook(() => useSymbolStore(), { wrapper });

    await expect(
      act(async () => {
        await result.current.saveSymbol({
          id: 'invalid',
          name: 'Invalid',
          category: 'custom',
          imageUrl: null,
        });
      }),
    ).rejects.toThrowError();

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        expect.objectContaining({ tone: 'error', message: expect.stringContaining('abgelehnt') }),
      );
    });
    expect(result.current.symbols.find((symbol) => symbol.id === 'invalid')).toBeUndefined();
  });

  it('retries saving a symbol after refreshing an expired token', async () => {
    const fetchMock = global.fetch as unknown as Mock;
    refreshAccessTokenMock.mockResolvedValue('refreshed-token');

    const makeSymbolsResponse = (symbols: unknown[] = []) =>
      new Response(JSON.stringify({ symbols }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    fetchMock
      .mockReset()
      .mockResolvedValueOnce(makeSymbolsResponse()) // Mount fetch
      .mockResolvedValueOnce( // Operation 1: 401 Expired
        new Response(JSON.stringify({ message: 'expired' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce( // Operation 2: 200 OK after retry
        new Response(JSON.stringify({ id: 'refresh-id', name: 'Neu', category: 'cat', imageUrl: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const wrapper = ({ children }: { children: ReactNode }) => (
      <SymbolStoreProvider>{children}</SymbolStoreProvider>
    );

    const { result } = renderHook(() => useSymbolStore(), { wrapper });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

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
    // Expect at least one call to the symbols endpoint with the refreshed token
    await waitFor(() => {
      const calls = fetchMock.mock.calls;
      const refreshCall = calls.find(call => 
        call[0] === 'http://localhost/api/v1/symbols' && 
        call[1]?.headers?.Authorization === 'Bearer refreshed-token'
      );
      expect(refreshCall).toBeDefined();
    });
  });

  it('surfaces authentication expiry when refresh fails', async () => {
    const fetchMock = global.fetch as unknown as Mock;
    refreshAccessTokenMock.mockResolvedValue(null);

    const makeSymbolsResponse = (symbols: unknown[] = []) =>
      new Response(JSON.stringify({ symbols }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    fetchMock.mockReset();
    fetchMock.mockImplementation((url) => {
      if (url.includes('/api/v1/symbols')) {
        return Promise.resolve(
          new Response(JSON.stringify({ message: 'expired' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(makeSymbolsResponse());
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <SymbolStoreProvider>{children}</SymbolStoreProvider>
    );

    const { result } = renderHook(() => useSymbolStore(), { wrapper });

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
});
