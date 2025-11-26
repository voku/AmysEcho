import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'webapp:api-config';
const SESSION_STORAGE_KEY = 'webapp:api-config:session';
const FALLBACK_API_BASE = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:3000';

type StoredApiConfig = {
  apiBaseUrl: string;
  apiToken: string;
  persistToken: boolean;
};

type ApiConfigContextValue = StoredApiConfig & {
  setApiBaseUrl: (value: string) => void;
  setApiToken: (value: string) => void;
  setPersistToken: (value: boolean) => void;
  clearApiToken: () => void;
  uploadEndpoint: string;
};

const defaultConfig: StoredApiConfig = {
  apiBaseUrl: FALLBACK_API_BASE,
  apiToken: '',
  persistToken: false,
};

function normalizeApiBase(raw: string | undefined): string {
  if (!raw) return FALLBACK_API_BASE;
  const trimmed = raw.trim();
  if (!trimmed) return FALLBACK_API_BASE;
  return trimmed.replace(/\/$/, '');
}

function readFromStorage(): StoredApiConfig {
  if (typeof window === 'undefined') return defaultConfig;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const sessionRaw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const sessionParsed = sessionRaw ? JSON.parse(sessionRaw) : {};
    const persistToken = Boolean(parsed?.persistToken);
    const storedBase = persistToken ? sessionParsed?.apiBaseUrl ?? parsed?.apiBaseUrl : parsed?.apiBaseUrl;
    return {
      apiBaseUrl: normalizeApiBase(storedBase),
      apiToken:
        persistToken && typeof sessionParsed?.apiToken === 'string' ? sessionParsed.apiToken : defaultConfig.apiToken,
      persistToken,
    } satisfies StoredApiConfig;
  } catch (error) {
    console.warn('Konnte API-Konfiguration nicht lesen', error);
    return defaultConfig;
  }
}

const ApiConfigContext = createContext<ApiConfigContextValue | null>(null);

export function ApiConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<StoredApiConfig>(() => readFromStorage());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ apiBaseUrl: config.apiBaseUrl, persistToken: config.persistToken }),
      );
    } catch (error) {
      console.warn('Konnte API-Konfiguration nicht speichern', error);
    }
  }, [config.apiBaseUrl, config.persistToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (config.persistToken) {
        window.sessionStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify({ apiBaseUrl: config.apiBaseUrl, apiToken: config.apiToken }),
        );
      } else {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (error) {
      console.warn('Konnte Session-API-Konfiguration nicht speichern', error);
    }
  }, [config.apiBaseUrl, config.apiToken, config.persistToken]);

  const setApiBaseUrl = useCallback((value: string) => {
    setConfig((prev) => ({ ...prev, apiBaseUrl: normalizeApiBase(value) }));
  }, []);

  const setApiToken = useCallback((value: string) => {
    setConfig((prev) => ({ ...prev, apiToken: value }));
  }, []);

  const setPersistToken = useCallback((value: boolean) => {
    setConfig((prev) => {
      const next = { ...prev, persistToken: value };
      if (!value) {
        next.apiToken = '';
      }
      return next;
    });
  }, []);

  const clearApiToken = useCallback(() => {
    setConfig((prev) => ({ ...prev, apiToken: '' }));
  }, []);

  const value = useMemo<ApiConfigContextValue>(() => {
    const normalizedBase = normalizeApiBase(config.apiBaseUrl);
    const uploadEndpoint = `${normalizedBase}/api/v1/dgs/sample-bundles`;
    return {
      apiBaseUrl: normalizedBase,
      apiToken: config.apiToken,
      persistToken: config.persistToken,
      setApiBaseUrl,
      setApiToken,
      setPersistToken,
      clearApiToken,
      uploadEndpoint,
    };
  }, [
    config.apiBaseUrl,
    config.apiToken,
    config.persistToken,
    setApiBaseUrl,
    setApiToken,
    setPersistToken,
    clearApiToken,
  ]);

  return <ApiConfigContext.Provider value={value}>{children}</ApiConfigContext.Provider>;
}

export function useApiConfig(): ApiConfigContextValue {
  const ctx = useContext(ApiConfigContext);
  if (!ctx) {
    throw new Error('ApiConfigProvider fehlt. Bitte Provider um App legen.');
  }
  return ctx;
}

export function resolvePollUrl(baseUrl: string, pollUrl: string | undefined, jobId: string): string | undefined {
  if (!jobId) return undefined;
  
  const trimmedPollUrl = pollUrl?.trim();
  if (trimmedPollUrl && /^https?:\/\//i.test(trimmedPollUrl)) {
    return trimmedPollUrl;
  }

  const trimmedBase = normalizeApiBase(baseUrl);
  if (trimmedPollUrl) {
    return `${trimmedBase}/${trimmedPollUrl.replace(/^\/+/, '')}`;
  }

  return `${trimmedBase}/api/training-status/${encodeURIComponent(jobId)}`;
}
