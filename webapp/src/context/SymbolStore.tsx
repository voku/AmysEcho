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
import { useAppState } from '../hooks/useAppState';
import { HttpError, SESSION_EXPIRED_MESSAGE } from '../utils/http';
import { useMessage } from './MessageContext';

export interface SymbolDefinition {
  id: string;
  name: string;
  category: string;
  imageUrl?: string | null | undefined;
  imageDataUrl?: string | null | undefined;
  pending?: boolean | undefined;
  profileId?: string | undefined;
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

const CACHE_KEY_PREFIX = 'amysecho_symbols_';

const SymbolStoreContext = createContext<SymbolStoreValue | undefined>(undefined);

type CachedSymbols = { symbols: SymbolDefinition[]; pending: SymbolDefinition[]; cachedAt: number };
const BASE_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 30000;

function getCacheKey(profileId: string | null): string {
  return `${CACHE_KEY_PREFIX}${profileId || 'global'}`;
}

function readCache(profileId: string | null): CachedSymbols {
  if (typeof window === 'undefined') return { symbols: [], pending: [], cachedAt: 0 };
  try {
    const key = getCacheKey(profileId);
    const raw = window.localStorage.getItem(key);
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

function writeCache(profileId: string | null, symbols: SymbolDefinition[], pending: SymbolDefinition[]): void {
  if (typeof window === 'undefined') return;
  const key = getCacheKey(profileId);
  const payload: CachedSymbols = { symbols, pending, cachedAt: Date.now() };
  window.localStorage.setItem(key, JSON.stringify(payload));
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
  const mergedMap = new Map<string, SymbolDefinition>();
  
  // confirmed symbols first
  const confirmedList = Array.isArray(symbols) ? symbols : [];
  for (const s of confirmedList) {
    if (s && s.id) {
      mergedMap.set(s.id, { ...s, pending: false });
    }
  }
  
  // pending symbols override confirmed ones
  const pendingList = Array.isArray(pending) ? pending : [];
  for (const s of pendingList) {
    if (s && s.id) {
      mergedMap.set(s.id, { ...s, pending: true });
    }
  }
  
  return Array.from(mergedMap.values());
}

export function SymbolStoreProvider({ children }: { children: ReactNode }) {
  const { apiBaseUrl, apiToken, refreshAccessToken } = useApiConfig();
  const { profileId } = useAppState();
  const { showToast } = useMessage();
  
  // Initialize state based on current profileId
  const [state, setState] = useState<CachedSymbols>(() => readCache(profileId));
  const { symbols, pending } = state;
  
  const [loading, setLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const syncingRef = useRef(false);
  const retryStateRef = useRef({ retryCount: 0, nextAllowed: 0 });
  const syncTimerRef = useRef<number | null>(null);
  
  // Use ref to track current state for async operations
  const stateRef = useRef(state);
  
  // Helper to keep ref in sync with state immediately
  const updateStoreState = useCallback((next: CachedSymbols | ((prev: CachedSymbols) => CachedSymbols)) => {
    setState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      stateRef.current = resolved;
      return resolved;
    });
  }, []);

  // Refetch when profileId changes
  useEffect(() => {
    // Update local state from cache immediately on profile switch
    const cached = readCache(profileId);
    updateStoreState(cached);
    // Then fetch fresh data
    void fetchSymbols();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  // Memoize merged symbols to prevent infinite re-renders in components that depend on this array
  const mergedSymbols = useMemo(() => mergePendingSymbols(symbols, pending), [symbols, pending]);
  const pendingCount = pending?.length ?? 0;

  const resolveHeaders = useCallback(
    (tokenOverride?: string): HeadersInit => {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      const activeToken = tokenOverride ?? apiToken;
      if (activeToken) {
        headers['Authorization'] = `Bearer ${activeToken}`;
      }
      return headers;
    },
    [apiToken],
  );

  const withAuthRetry = useCallback(
    async <T,>(
      operation: (tokenOverride?: string) => Promise<T>,
      options?: { silent?: boolean },
    ): Promise<T> => {
      try {
        return await operation();
      } catch (error) {
        if (error instanceof HttpError && error.status === 401) {
          try {
            const refreshed = await refreshAccessToken();
            if (refreshed) {
              return operation(refreshed);
            }
          } catch (refreshError) {
            console.warn('Token refresh failed', refreshError);
          }
          setSyncError(SESSION_EXPIRED_MESSAGE);
          if (!options?.silent) {
            showToast({ message: SESSION_EXPIRED_MESSAGE, tone: 'error' });
          }
          throw new HttpError(401, SESSION_EXPIRED_MESSAGE);
        }
        throw error;
      }
    },
    [refreshAccessToken, showToast],
  );

  const flushPending = useCallback(async () => {
    if (syncingRef.current) return { symbols: stateRef.current.symbols, pending: stateRef.current.pending };
    
    const currentPending = stateRef.current.pending;
    const currentSymbols = stateRef.current.symbols;
    const currentProfileId = profileId;
    
    if (currentPending.length === 0) {
      return { symbols: currentSymbols, pending: currentPending };
    }

    // Check if we have an API token
    if (!apiToken || apiToken.trim().length === 0) {
      return { symbols: currentSymbols, pending: currentPending };
    }

    syncingRef.current = true;
    try {
      const remainingPending: SymbolDefinition[] = [];
      let syncedCount = 0;
      let updatedSymbols = currentSymbols;

      for (let i = 0; i < currentPending.length; i++) {
        const pendingSymbol = currentPending[i];
        if (!pendingSymbol) continue;

        try {
          const payload = {
            id: pendingSymbol.id,
            name: pendingSymbol.name,
            category: pendingSymbol.category,
            imageUrl: pendingSymbol.imageDataUrl ? null : pendingSymbol.imageUrl ?? null,
            imageDataUrl: pendingSymbol.imageDataUrl ?? null,
            profileId: pendingSymbol.profileId ?? currentProfileId ?? undefined,
          };
          const saved = await withAuthRetry(
            (tokenOverride) =>
              fetchJson<SymbolDefinition>(`${apiBaseUrl}/api/v1/symbols`, {
                method: 'POST',
                headers: resolveHeaders(tokenOverride),
                body: JSON.stringify(payload),
              }),
          );
          syncedCount += 1;
          updatedSymbols = updatedSymbols.some((symbol) => symbol.id === saved.id)
            ? updatedSymbols.map((symbol) => (symbol.id === saved.id ? saved : symbol))
            : [...updatedSymbols, saved];
        } catch (error) {
          if (error instanceof HttpError && error.status >= 400 && error.status < 500) {
            if (error.status === 401) {
              remainingPending.push(...currentPending.slice(i));
              break;
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

      updateStoreState((prev) => {
        const finalSymbols = updatedSymbols;
        const prevPending = prev?.pending ?? [];
        const flushedIds = new Set(currentPending.map(p => p.id));
        const newPendingDuringFlush = prevPending.filter(p => !flushedIds.has(p.id));
        const finalPending = [...remainingPending, ...newPendingDuringFlush];
        writeCache(currentProfileId, finalSymbols, finalPending);
        return { symbols: finalSymbols, pending: finalPending, cachedAt: Date.now() };
      });

      if (syncedCount > 0) {
        showToast({ message: 'Offline gespeicherte Gebärden synchronisiert.', tone: 'success' });
      }

      return { symbols: updatedSymbols, pending: remainingPending };
    } finally {
      syncingRef.current = false;
    }
  }, [apiBaseUrl, apiToken, profileId, resolveHeaders, showToast, updateStoreState, withAuthRetry]);

  const fetchSymbols = useCallback(async (options?: { silent?: boolean }) => {
    const now = Date.now();
    const delayRemaining = retryStateRef.current.nextAllowed - now;
    if (options?.silent && delayRemaining > 0 && stateRef.current.pending.length > 0) {
      if (typeof window !== 'undefined') {
        if (syncTimerRef.current) {
          window.clearTimeout(syncTimerRef.current);
        }
        syncTimerRef.current = window.setTimeout(() => {
          syncTimerRef.current = null;
          void fetchSymbols(options);
        }, delayRemaining);
      }
      return;
    }

    setLoading(true);
    const currentProfileId = profileId;

    try {
      const { pending: pendingSymbols } = await flushPending();
      
      const url = new URL(`${apiBaseUrl}/api/v1/symbols`);
      if (currentProfileId) {
        url.searchParams.set('profileId', currentProfileId);
      }

      const data = await withAuthRetry(
        (tokenOverride) =>
          fetchJson<{ symbols: SymbolDefinition[] }>(url.toString(), {
            headers: resolveHeaders(tokenOverride),
          }),
        options?.silent !== undefined ? { silent: options.silent } : undefined,
      );
      
      const nextSymbols = data?.symbols ?? [];
      updateStoreState((prev) => {
        const prevPending = prev?.pending ?? [];
        const finalPending = [...pendingSymbols, ...prevPending.filter(p => !pendingSymbols.find(ps => ps.id === p.id))];
        writeCache(currentProfileId, nextSymbols, finalPending);
        return { symbols: nextSymbols, pending: finalPending, cachedAt: Date.now() };
      });
      retryStateRef.current = { retryCount: 0, nextAllowed: 0 };
      setSyncError(null);
      setLastSyncedAt(Date.now());
    } catch (error) {
      const isAuthError = error instanceof HttpError && error.status === 401;
      const reason = isAuthError
        ? SESSION_EXPIRED_MESSAGE
        : error instanceof Error
          ? error.message
          : 'Unbekannter Fehler beim Laden der Gebärden';
      setSyncError(reason);

      if (!isAuthError) {
        const nextRetryCount = Math.min(retryStateRef.current.retryCount + 1, 6);
        const delay = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * 2 ** (nextRetryCount - 1));
        retryStateRef.current = { retryCount: nextRetryCount, nextAllowed: Date.now() + delay };
        if (typeof window !== 'undefined' && stateRef.current.pending.length > 0) {
          if (syncTimerRef.current) {
            window.clearTimeout(syncTimerRef.current);
          }
          syncTimerRef.current = window.setTimeout(() => {
            syncTimerRef.current = null;
            void fetchSymbols({ silent: true });
          }, delay);
        }
      }

      if (!options?.silent && !isAuthError) {
        showToast({ message: `Gebärden-Liste konnte nicht geladen werden: ${reason}`, tone: 'warning' });
      }
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, flushPending, profileId, resolveHeaders, showToast, updateStoreState, withAuthRetry]);

  const refresh = useCallback(() => fetchSymbols(), [fetchSymbols]);

  useEffect(() => {
    if (symbols.length === 0 || pendingCount > 0) {
      const delay = Math.max(0, retryStateRef.current.nextAllowed - Date.now());
      if (typeof window === 'undefined' || delay === 0) {
        void fetchSymbols({ silent: true });
      } else {
        if (syncTimerRef.current) {
          window.clearTimeout(syncTimerRef.current);
        }
        syncTimerRef.current = window.setTimeout(() => {
          syncTimerRef.current = null;
          void fetchSymbols({ silent: true });
        }, delay);
      }
    }

    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [fetchSymbols, pendingCount, symbols.length]);

  const saveSymbol = useCallback(
    async (input: SymbolDefinition & { imageDataUrl?: string | null }) => {
      const currentProfileId = profileId;
      // Check if we have an API token before attempting to save
      if (!apiToken || apiToken.trim().length === 0) {
        showToast({
          message: 'Keine Anmeldung. Bitte in den Einstellungen API-Token konfigurieren.',
          tone: 'warning',
        });
        const fallback: SymbolDefinition = {
          id: input.id,
          name: input.name,
          category: input.category,
          imageUrl: input.imageDataUrl ? null : input.imageUrl ?? null,
          imageDataUrl: input.imageDataUrl ?? null,
          profileId: currentProfileId ?? undefined,
          pending: true,
        };
        updateStoreState((prev) => {
          const prevPending = prev?.pending ?? [];
          const prevSymbols = prev?.symbols ?? [];
          const nextPending = prevPending.some((symbol) => symbol.id === fallback.id)
            ? prevPending.map((symbol) => (symbol.id === fallback.id ? fallback : symbol))
            : [...prevPending, fallback];
          writeCache(currentProfileId, prevSymbols, nextPending);
          return { symbols: prevSymbols, pending: nextPending, cachedAt: Date.now() };
        });
        return fallback;
      }

      const payload = { 
        ...input, 
        imageDataUrl: input.imageDataUrl ?? undefined,
        profileId: currentProfileId ?? undefined,
      };
      try {
        const saved = await withAuthRetry(
          (tokenOverride) =>
            fetchJson<SymbolDefinition>(`${apiBaseUrl}/api/v1/symbols`, {
              method: 'POST',
              headers: resolveHeaders(tokenOverride),
              body: JSON.stringify(payload),
            }),
        );
        updateStoreState((prev) => {
          const prevPending = prev?.pending ?? [];
          const prevSymbols = prev?.symbols ?? [];
          const nextPending = prevPending.filter((symbol) => symbol.id !== saved.id);
          const nextSymbols = prevSymbols.some((s) => s.id === saved.id)
            ? prevSymbols.map((s) => (s.id === saved.id ? saved : symbol))
            : [...prevSymbols, saved];
          writeCache(currentProfileId, nextSymbols, nextPending);
          return { symbols: nextSymbols, pending: nextPending, cachedAt: Date.now() };
        });
        setSyncError(null);
        setLastSyncedAt(Date.now());
        showToast({ message: 'Gebärde gespeichert', tone: 'success' });
        return saved;
      } catch (error) {
        if (error instanceof HttpError && error.status >= 400 && error.status < 500) {
          const reason = error.status === 401 ? SESSION_EXPIRED_MESSAGE : error.message || 'Ungültige Eingabe';
          if (error.status !== 401) {
            showToast({ message: `Gebärde abgelehnt: ${reason}`, tone: 'error' });
          }
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
          profileId: currentProfileId ?? undefined,
          pending: true,
        };
        updateStoreState((prev) => {
          const prevPending = prev?.pending ?? [];
          const prevSymbols = prev?.symbols ?? [];
          const nextPending = prevPending.some((symbol) => symbol.id === fallback.id)
            ? prevPending.map((symbol) => (symbol.id === fallback.id ? fallback : symbol))
            : [...prevPending, fallback];
          
          writeCache(currentProfileId, prevSymbols, nextPending);
          return { symbols: prevSymbols, pending: nextPending, cachedAt: Date.now() };
        });
        setSyncError(reason);
        setLastSyncedAt(null);
        return fallback;
      }
    },
    [apiBaseUrl, apiToken, profileId, resolveHeaders, showToast, updateStoreState, withAuthRetry],
  );

  const removeSymbol = useCallback(
    async (id: string) => {
      const currentProfileId = profileId;
      try {
        await withAuthRetry(
          (tokenOverride) =>
            fetchJson<void>(`${apiBaseUrl}/api/v1/symbols/${encodeURIComponent(id)}`, {
              method: 'DELETE',
              headers: resolveHeaders(tokenOverride),
            }),
        );
        updateStoreState((prev) => {
          const nextSymbols = (prev?.symbols ?? []).filter((symbol) => symbol.id !== id);
          const nextPending = (prev?.pending ?? []).filter((symbol) => symbol.id !== id);
          writeCache(currentProfileId, nextSymbols, nextPending);
          return { symbols: nextSymbols, pending: nextPending, cachedAt: Date.now() };
        });
        setSyncError(null);
        setLastSyncedAt(Date.now());
      } catch (error) {
        const isAuthError = error instanceof HttpError && error.status === 401;
        const reason = isAuthError
          ? SESSION_EXPIRED_MESSAGE
          : error instanceof Error
            ? error.message
            : 'Unbekannter Fehler beim Löschen';
        updateStoreState((prev) => {
          const nextSymbols = (prev?.symbols ?? []).filter((symbol) => symbol.id !== id);
          const nextPending = (prev?.pending ?? []).filter((symbol) => symbol.id !== id);
          writeCache(currentProfileId, nextSymbols, nextPending);
          return { symbols: nextSymbols, pending: nextPending, cachedAt: Date.now() };
        });
        setSyncError(reason);
        if (!isAuthError) {
          showToast({ message: `Gebärde nur lokal gelöscht: ${reason}`, tone: 'warning' });
        }
      }
    },
    [apiBaseUrl, profileId, resolveHeaders, showToast, updateStoreState, withAuthRetry],
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