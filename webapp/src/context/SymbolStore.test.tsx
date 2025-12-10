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
      'amysecho_symbols',
      JSON.stringify({ symbols: [{ id: 'seed', name: 'Seed', category: 'seed', imageUrl: null }], pending: [], cachedAt: Date.now() }),
    );

    fetchMock
      .mockRejectedValueOnce(new TypeError('Network error'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'offline-symbol', name: 'Offline', category: 'custom', imageUrl: null }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        makeSymbolsResponse([{ id: 'offline-symbol', name: 'Offline', category: 'custom', imageUrl: null }]),
      )
      .mockResolvedValueOnce(
        makeSymbolsResponse([{ id: 'offline-symbol', name: 'Offline', category: 'custom', imageUrl: null }]),
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
      expect(result.current.symbols.find((symbol) => symbol.id === 'offline-symbol')).toBeDefined();
    });

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => {
      const syncedSymbol = result.current.symbols.find((symbol) => symbol.id === 'offline-symbol');
      expect(syncedSymbol?.pending).toBeUndefined();
      expect(syncedSymbol?.name).toBe('Offline');
      const cacheAfter = JSON.parse(localStorage.getItem('amysecho_symbols') ?? '{}');
      expect(cacheAfter.pending?.length ?? 0).toBe(0);
    });
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
      .mockResolvedValueOnce(makeSymbolsResponse())
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

    const wrapper = ({ children }: { children: ReactNode }) => (
      <SymbolStoreProvider>{children}</SymbolStoreProvider>
    );

    const { result } = renderHook(() => useSymbolStore(), { wrapper });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
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
      expect(saved?.pending).toBeUndefined();
      expect(saved?.name).toBe('Neu');
    });

    expect(refreshAccessTokenMock).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost/api/v1/symbols',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer refreshed-token' }),
      }),
    );
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
    let callCount = 0;
    fetchMock.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve(makeSymbolsResponse());
      }
      return Promise.resolve(
        new Response(JSON.stringify({ message: 'expired' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <SymbolStoreProvider>{children}</SymbolStoreProvider>
    );

    const { result } = renderHook(() => useSymbolStore(), { wrapper });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

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
