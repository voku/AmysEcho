import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { SymbolStoreProvider, useSymbolStore } from './SymbolStore';
import type { ReactNode } from 'react';

const showToastMock = vi.fn();

vi.mock('./MessageContext', async () => {
  const actual = await vi.importActual('./MessageContext');
  return {
    ...actual,
    useMessage: () => ({ showToast: showToastMock }),
    MessageProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});

vi.mock('../hooks/useApiConfig', () => ({ useApiConfig: () => ({ apiBaseUrl: 'http://localhost', apiToken: 'token' }) }));

describe('SymbolStore offline handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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
      result.current.saveSymbol({
        id: 'invalid',
        name: 'Invalid',
        category: 'custom',
        imageUrl: null,
      }),
    ).rejects.toThrowError();

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        expect.objectContaining({ tone: 'error', message: expect.stringContaining('abgelehnt') }),
      );
    });
    expect(result.current.symbols.find((symbol) => symbol.id === 'invalid')).toBeUndefined();
  });
});
