import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  
  // Use ref to track current state for async operations
  const stateRef = useRef({ symbols, pending });
  useEffect(() => {
    stateRef.current = { symbols, pending };
  }, [symbols, pending]);

  // Memoize merged symbols to prevent infinite re-renders in components that depend on this array
  const mergedSymbols = useMemo(() => mergePendingSymbols(symbols, pending), [symbols, pending]);

  const resolveHeaders = useCallback((): HeadersInit => {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (apiToken) {
      headers['Authorization'] = `Bearer ${apiToken}`;
    }
    return headers;
  }, [apiToken]);

  const flushPending = useCallback(async () => {
    const currentPending = stateRef.current.pending;
    const currentSymbols = stateRef.current.symbols;
    
    if (currentPending.length === 0) {
      return { symbols: currentSymbols, pending: currentPending };
    }

    // Check if we have an API token
    if (!apiToken || apiToken.trim().length === 0) {
      // Don't try to flush if there's no token - items remain pending
      return { symbols: currentSymbols, pending: currentPending };
    }

    const remainingPending: SymbolDefinition[] = [];
    let syncedCount = 0;
    let updatedSymbols = currentSymbols;

    for (let i = 0; i < currentPending.length; i++) {
      const pendingSymbol = currentPending[i];
      if (!pendingSymbol) continue; // Skip if undefined (should not happen, but satisfies TypeScript)
      
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
          // For authentication errors, keep items pending instead of removing them
          if (error.status === 401) {
            showToast({
              message: `Anmeldung abgelaufen. Offline Gebärden werden nach erneuter Anmeldung synchronisiert.`,
              tone: 'warning',
            });
            // Keep current item and all remaining unprocessed items as pending when auth fails
            remainingPending.push(...currentPending.slice(i));
            break; // Stop trying to sync if auth failed
          } else {
            showToast({
              message: `Gebärde "${pendingSymbol.name}" konnte nicht synchronisiert werden: ${error.message}`,
              tone: 'error',
            });
            updatedSymbols = updatedSymbols.filter((symbol) => symbol.id !== pendingSymbol.id);
          }
        } else {
          remainingPending.push(pendingSymbol);
        }
      }
    }

    setState((prev) => {
      // Merge with latest state to avoid overwriting concurrent changes
      // Use updated symbols from flush, but preserve any new pending items added during flush
      const finalSymbols = updatedSymbols;
      // Keep items that failed to sync (remainingPending) plus new items added during flush
      // Exclude items from original pending that were successfully synced
      const flushedIds = new Set(currentPending.map(p => p.id));
      const newPendingDuringFlush = prev.pending.filter(p => !flushedIds.has(p.id));
      const finalPending = [...remainingPending, ...newPendingDuringFlush];
      writeCache(finalSymbols, finalPending);
      return { symbols: finalSymbols, pending: finalPending, cachedAt: Date.now() };
    });

    if (syncedCount > 0) {
      showToast({ message: 'Offline gespeicherte Gebärden synchronisiert.', tone: 'success' });
    }

    return { symbols: updatedSymbols, pending: remainingPending };
  }, [apiBaseUrl, apiToken, resolveHeaders, showToast]);

  const fetchSymbols = useCallback(async (options?: { silent?: boolean }) => {
    setLoading(true);
    try {
      const { pending: pendingSymbols } = await flushPending();
      const data = await fetchJson<{ symbols: SymbolDefinition[] }>(`${apiBaseUrl}/api/v1/symbols`, {
        headers: resolveHeaders(),
      });
      setState((prev) => {
        // Merge fetched symbols with any pending items added during the fetch
        const finalPending = [...pendingSymbols, ...prev.pending.filter(p => !pendingSymbols.find(ps => ps.id === p.id))];
        writeCache(data.symbols, finalPending);
        return { symbols: data.symbols, pending: finalPending, cachedAt: Date.now() };
      });
      setSyncError(null);
      setLastSyncedAt(Date.now());
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unbekannter Fehler beim Laden der Gesten';
      setSyncError(reason);
      if (!options?.silent) {
        showToast({ message: `Gebärden-Liste konnte nicht geladen werden: ${reason}`, tone: 'warning' });
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
      // Check if we have an API token before attempting to save
      if (!apiToken || apiToken.trim().length === 0) {
        showToast({
          message: 'Keine Anmeldung. Bitte in den Einstellungen API-Token konfigurieren.',
          tone: 'warning',
        });
        // Save locally as pending
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
          writeCache(nextSymbols, nextPending);
          return { symbols: nextSymbols, pending: nextPending, cachedAt: Date.now() };
        });
        return fallback;
      }

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
          writeCache(nextSymbols, nextPending);
          return { symbols: nextSymbols, pending: nextPending, cachedAt: Date.now() };
        });
        setSyncError(null);
        setLastSyncedAt(Date.now());
        showToast({ message: 'Gebärde gespeichert', tone: 'success' });
        return saved;
      } catch (error) {
        if (error instanceof HttpError && error.status >= 400 && error.status < 500) {
          const reason = error.message || 'Ungültige Eingabe';
          // Provide more helpful message for authentication errors
          const userMessage = error.status === 401
            ? 'Anmeldung abgelaufen. Bitte in den Einstellungen API-Token neu eingeben.'
            : `Gebärde abgelehnt: ${reason}`;
          showToast({ message: userMessage, tone: 'error' });
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
          writeCache(nextSymbols, nextPending);
          return { symbols: nextSymbols, pending: nextPending, cachedAt: Date.now() };
        });
        setSyncError(reason);
        return fallback;
      }
    },
    [apiBaseUrl, apiToken, resolveHeaders, showToast],
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
          writeCache(nextSymbols, nextPending);
          return { symbols: nextSymbols, pending: nextPending, cachedAt: Date.now() };
        });
        setSyncError(null);
        setLastSyncedAt(Date.now());
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unbekannter Fehler beim Löschen';
        setState((prev) => {
          const nextSymbols = prev.symbols.filter((symbol) => symbol.id !== id);
          const nextPending = prev.pending.filter((symbol) => symbol.id !== id);
          writeCache(nextSymbols, nextPending);
          return { symbols: nextSymbols, pending: nextPending, cachedAt: Date.now() };
        });
        setSyncError(reason);
        showToast({ message: `Gebärde nur lokal gelöscht: ${reason}`, tone: 'warning' });
      }
    },
    [apiBaseUrl, resolveHeaders, showToast],
  );

  const value = useMemo<SymbolStoreValue>(
    () => ({ symbols: mergedSymbols, loading, syncError, lastSyncedAt, refresh, saveSymbol, removeSymbol }),
    [lastSyncedAt, loading, mergedSymbols, refresh, removeSymbol, saveSymbol, syncError],
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
