import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useApiConfig } from '../hooks/useApiConfig';
import { useMessage } from './MessageContext';

export interface SymbolDefinition {
  id: string;
  name: string;
  category: string;
  imageUrl?: string | null;
}

interface SymbolStoreValue {
  symbols: SymbolDefinition[];
  loading: boolean;
  syncError: string | null;
  lastSyncedAt: number | null;
  refresh: () => Promise<void>;
  saveSymbol: (input: SymbolDefinition & { imageDataUrl?: string | null }) => Promise<SymbolDefinition>;
  removeSymbol: (id: string) => Promise<void>;
}

const CACHE_KEY = 'amysecho_symbols';

const SymbolStoreContext = createContext<SymbolStoreValue | undefined>(undefined);

type CachedSymbols = { symbols: SymbolDefinition[]; cachedAt: number };

function readCache(): CachedSymbols {
  if (typeof window === 'undefined') return { symbols: [], cachedAt: 0 };
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return { symbols: [], cachedAt: 0 };
    const parsed = JSON.parse(raw) as CachedSymbols;
    if (!Array.isArray(parsed.symbols)) return { symbols: [], cachedAt: 0 };
    return { symbols: parsed.symbols, cachedAt: parsed.cachedAt ?? 0 };
  } catch (error) {
    console.warn('Konnte Symbol-Cache nicht lesen', error);
    return { symbols: [], cachedAt: 0 };
  }
}

function writeCache(symbols: SymbolDefinition[]): void {
  if (typeof window === 'undefined') return;
  const payload: CachedSymbols = { symbols, cachedAt: Date.now() };
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const reason = payload?.error || payload?.message || response.statusText;
    throw new Error(reason);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export function SymbolStoreProvider({ children }: { children: ReactNode }) {
  const { apiBaseUrl, apiToken } = useApiConfig();
  const { showToast } = useMessage();
  const [{ symbols }, setState] = useState<CachedSymbols>(() => readCache());
  const [loading, setLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const resolveHeaders = useCallback((): HeadersInit => {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (apiToken) {
      headers['Authorization'] = `Bearer ${apiToken}`;
    }
    return headers;
  }, [apiToken]);

  const fetchSymbols = useCallback(async (options?: { silent?: boolean }) => {
    setLoading(true);
    try {
      const data = await fetchJson<{ symbols: SymbolDefinition[] }>(`${apiBaseUrl}/api/v1/symbols`, {
        headers: resolveHeaders(),
      });
      setState({ symbols: data.symbols, cachedAt: Date.now() });
      writeCache(data.symbols);
      setSyncError(null);
      setLastSyncedAt(Date.now());
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unbekannter Fehler beim Laden der Symbole';
      setSyncError(reason);
      if (!options?.silent) {
        showToast({ message: `Symbol-Liste konnte nicht geladen werden: ${reason}`, tone: 'warning' });
      }
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, resolveHeaders, showToast]);

  const refresh = useCallback(() => fetchSymbols(), [fetchSymbols]);

  useEffect(() => {
    if (symbols.length === 0) {
      void fetchSymbols({ silent: true });
    }
  }, [fetchSymbols, symbols.length]);

  const saveSymbol = useCallback(
    async (input: SymbolDefinition & { imageDataUrl?: string | null }) => {
      const payload = { ...input, imageDataUrl: input.imageDataUrl ?? undefined };
      try {
        const saved = await fetchJson<SymbolDefinition>(`${apiBaseUrl}/api/v1/symbols`, {
          method: 'POST',
          headers: resolveHeaders(),
          body: JSON.stringify(payload),
        });
        setState((prev) => {
          const nextSymbols = prev.symbols.some((s) => s.id === saved.id)
            ? prev.symbols.map((s) => (s.id === saved.id ? saved : s))
            : [...prev.symbols, saved];
          writeCache(nextSymbols);
          return { symbols: nextSymbols, cachedAt: Date.now() };
        });
        setSyncError(null);
        setLastSyncedAt(Date.now());
        showToast({ message: 'Symbol gespeichert', tone: 'success' });
        return saved;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unbekannter Fehler beim Speichern';
        showToast({ message: `Server nicht erreichbar, lokal gespeichert: ${reason}`, tone: 'warning' });
        const fallback: SymbolDefinition = {
          id: input.id,
          name: input.name,
          category: input.category,
          imageUrl: input.imageDataUrl ?? input.imageUrl ?? null,
        };
        setState((prev) => {
          const nextSymbols = prev.symbols.some((s) => s.id === fallback.id)
            ? prev.symbols.map((s) => (s.id === fallback.id ? fallback : s))
            : [...prev.symbols, fallback];
          writeCache(nextSymbols);
          return { symbols: nextSymbols, cachedAt: Date.now() };
        });
        setSyncError(reason);
        return fallback;
      }
    },
    [apiBaseUrl, resolveHeaders, showToast],
  );

  const removeSymbol = useCallback(
    async (id: string) => {
      try {
        await fetchJson<void>(`${apiBaseUrl}/api/v1/symbols/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: resolveHeaders(),
        });
        setState((prev) => {
          const nextSymbols = prev.symbols.filter((symbol) => symbol.id !== id);
          writeCache(nextSymbols);
          return { symbols: nextSymbols, cachedAt: Date.now() };
        });
        setSyncError(null);
        setLastSyncedAt(Date.now());
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unbekannter Fehler beim Löschen';
        setState((prev) => {
          const nextSymbols = prev.symbols.filter((symbol) => symbol.id !== id);
          writeCache(nextSymbols);
          return { symbols: nextSymbols, cachedAt: Date.now() };
        });
        setSyncError(reason);
        showToast({ message: `Symbol nur lokal gelöscht: ${reason}`, tone: 'warning' });
      }
    },
    [apiBaseUrl, resolveHeaders, showToast],
  );

  const value = useMemo<SymbolStoreValue>(
    () => ({ symbols, loading, syncError, lastSyncedAt, refresh, saveSymbol, removeSymbol }),
    [lastSyncedAt, loading, refresh, removeSymbol, saveSymbol, symbols, syncError],
  );

  return <SymbolStoreContext.Provider value={value}>{children}</SymbolStoreContext.Provider>;
}

export function useSymbolStore(): SymbolStoreValue {
  const ctx = useContext(SymbolStoreContext);
  if (!ctx) {
    throw new Error('useSymbolStore must be used within a SymbolStoreProvider');
  }
  return ctx;
}
