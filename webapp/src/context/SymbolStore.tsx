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
  imageDataUrl?: string | null;
  pending?: boolean;
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

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const SymbolStoreContext = createContext<SymbolStoreValue | undefined>(undefined);

type CachedSymbols = { symbols: SymbolDefinition[]; pending: SymbolDefinition[]; cachedAt: number };

function readCache(): CachedSymbols {
  if (typeof window === 'undefined') return { symbols: [], pending: [], cachedAt: 0 };
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return { symbols: [], pending: [], cachedAt: 0 };
    const parsed = JSON.parse(raw) as CachedSymbols;
    if (!Array.isArray(parsed.symbols)) return { symbols: [], pending: [], cachedAt: 0 };
    return {
      symbols: parsed.symbols,
      pending: Array.isArray(parsed.pending) ? parsed.pending : [],
      cachedAt: parsed.cachedAt ?? 0,
    };
  } catch (error) {
    console.warn('Konnte Symbol-Cache nicht lesen', error);
    return { symbols: [], pending: [], cachedAt: 0 };
  }
}

function writeCache(symbols: SymbolDefinition[], pending: SymbolDefinition[]): void {
  if (typeof window === 'undefined') return;
  const payload: CachedSymbols = { symbols, pending, cachedAt: Date.now() };
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error instanceof Error && error.message.includes('body stream already read')) {
      throw error;
    }
    throw error instanceof Error ? error : new Error('Netzwerkfehler');
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const reason = payload?.error || payload?.message || response.statusText;
    throw new HttpError(response.status, reason);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

function mergePendingSymbols(symbols: SymbolDefinition[], pending: SymbolDefinition[]): SymbolDefinition[] {
  if (pending.length === 0) return symbols;
  const filtered = symbols.filter((symbol) => !pending.some((pendingSymbol) => pendingSymbol.id === symbol.id));
  const pendingWithFlag = pending.map((symbol) => ({ ...symbol, pending: true }));
  return [...filtered, ...pendingWithFlag];
}

export function SymbolStoreProvider({ children }: { children: ReactNode }) {
  const { apiBaseUrl, apiToken } = useApiConfig();
  const { showToast } = useMessage();
  const [{ symbols, pending }, setState] = useState<CachedSymbols>(() => readCache());
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

  const flushPending = useCallback(async () => {
    if (pending.length === 0) {
      return { symbols, pending };
    }

    const remainingPending: SymbolDefinition[] = [];
    let syncedCount = 0;
    let updatedSymbols = symbols;

    for (const pendingSymbol of pending) {
      try {
        const payload = {
          id: pendingSymbol.id,
          name: pendingSymbol.name,
          category: pendingSymbol.category,
          imageUrl: pendingSymbol.imageDataUrl ? null : pendingSymbol.imageUrl ?? null,
          imageDataUrl: pendingSymbol.imageDataUrl ?? null,
        };
        const saved = await fetchJson<SymbolDefinition>(`${apiBaseUrl}/api/v1/symbols`, {
          method: 'POST',
          headers: resolveHeaders(),
          body: JSON.stringify(payload),
        });
        syncedCount += 1;
        updatedSymbols = updatedSymbols.some((symbol) => symbol.id === saved.id)
          ? updatedSymbols.map((symbol) => (symbol.id === saved.id ? saved : symbol))
          : [...updatedSymbols, saved];
      } catch (error) {
        if (error instanceof HttpError && error.status >= 400 && error.status < 500) {
          showToast({
            message: `Symbol "${pendingSymbol.name}" konnte nicht synchronisiert werden: ${error.message}`,
            tone: 'error',
          });
          updatedSymbols = updatedSymbols.filter((symbol) => symbol.id !== pendingSymbol.id);
        } else {
          remainingPending.push(pendingSymbol);
        }
      }
    }

    const mergedSymbols = mergePendingSymbols(updatedSymbols, remainingPending);
    setState((prev) => {
      void prev;
      return { symbols: mergedSymbols, pending: remainingPending, cachedAt: Date.now() };
    });
    writeCache(mergedSymbols, remainingPending);

    if (syncedCount > 0) {
      showToast({ message: 'Offline gespeicherte Symbole synchronisiert.', tone: 'success' });
    }

    return { symbols: mergedSymbols, pending: remainingPending };
  }, [apiBaseUrl, pending, resolveHeaders, showToast, symbols]);

  const fetchSymbols = useCallback(async (options?: { silent?: boolean }) => {
    setLoading(true);
    try {
      const { pending: pendingSymbols } = await flushPending();
      const data = await fetchJson<{ symbols: SymbolDefinition[] }>(`${apiBaseUrl}/api/v1/symbols`, {
        headers: resolveHeaders(),
      });
      const mergedSymbols = mergePendingSymbols(data.symbols, pendingSymbols);
      setState({ symbols: mergedSymbols, pending: pendingSymbols, cachedAt: Date.now() });
      writeCache(mergedSymbols, pendingSymbols);
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
  }, [apiBaseUrl, flushPending, resolveHeaders, showToast]);

  const refresh = useCallback(() => fetchSymbols(), [fetchSymbols]);

  useEffect(() => {
    if (symbols.length === 0 || pending.length > 0) {
      void fetchSymbols({ silent: true });
    }
  }, [fetchSymbols, pending.length, symbols.length]);

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
          const nextPending = prev.pending.filter((symbol) => symbol.id !== saved.id);
          const nextSymbols = prev.symbols.some((s) => s.id === saved.id)
            ? prev.symbols.map((s) => (s.id === saved.id ? saved : s))
            : [...prev.symbols, saved];
          const mergedSymbols = mergePendingSymbols(nextSymbols, nextPending);
          writeCache(mergedSymbols, nextPending);
          return { symbols: mergedSymbols, pending: nextPending, cachedAt: Date.now() };
        });
        setSyncError(null);
        setLastSyncedAt(Date.now());
        showToast({ message: 'Symbol gespeichert', tone: 'success' });
        return saved;
      } catch (error) {
        if (error instanceof HttpError && error.status >= 400 && error.status < 500) {
          const reason = error.message || 'Ungültige Eingabe';
          showToast({ message: `Symbol abgelehnt: ${reason}`, tone: 'error' });
          setSyncError(reason);
          throw error;
        }

        const reason = error instanceof Error ? error.message : 'Unbekannter Fehler beim Speichern';
        showToast({ message: `Server nicht erreichbar, lokal gespeichert: ${reason}`, tone: 'warning' });
        const fallback: SymbolDefinition = {
          id: input.id,
          name: input.name,
          category: input.category,
          imageUrl: input.imageDataUrl ? null : input.imageUrl ?? null,
          imageDataUrl: input.imageDataUrl ?? null,
        };
        setState((prev) => {
          const nextPending = prev.pending.some((symbol) => symbol.id === fallback.id)
            ? prev.pending.map((symbol) => (symbol.id === fallback.id ? fallback : symbol))
            : [...prev.pending, fallback];
          const nextSymbols = prev.symbols.some((s) => s.id === fallback.id)
            ? prev.symbols.map((s) => (s.id === fallback.id ? fallback : s))
            : [...prev.symbols, fallback];
          const mergedSymbols = mergePendingSymbols(nextSymbols, nextPending);
          writeCache(mergedSymbols, nextPending);
          return { symbols: mergedSymbols, pending: nextPending, cachedAt: Date.now() };
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
          const nextPending = prev.pending.filter((symbol) => symbol.id !== id);
          const mergedSymbols = mergePendingSymbols(nextSymbols, nextPending);
          writeCache(mergedSymbols, nextPending);
          return { symbols: mergedSymbols, pending: nextPending, cachedAt: Date.now() };
        });
        setSyncError(null);
        setLastSyncedAt(Date.now());
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unbekannter Fehler beim Löschen';
        setState((prev) => {
          const nextSymbols = prev.symbols.filter((symbol) => symbol.id !== id);
          const nextPending = prev.pending.filter((symbol) => symbol.id !== id);
          const mergedSymbols = mergePendingSymbols(nextSymbols, nextPending);
          writeCache(mergedSymbols, nextPending);
          return { symbols: mergedSymbols, pending: nextPending, cachedAt: Date.now() };
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
