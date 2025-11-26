import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'webapp:api-config';
const FALLBACK_API_BASE = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:3000';

type StoredApiConfig = {
  apiBaseUrl: string;
  apiToken: string;
};

type ApiConfigContextValue = StoredApiConfig & {
  setApiBaseUrl: (value: string) => void;
  setApiToken: (value: string) => void;
  uploadEndpoint: string;
};

const defaultConfig: StoredApiConfig = {
  apiBaseUrl: FALLBACK_API_BASE,
  apiToken: '',
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
    if (!raw) return defaultConfig;
    const parsed = JSON.parse(raw);
    return {
      apiBaseUrl: normalizeApiBase(parsed?.apiBaseUrl),
      // Tokens werden nicht aus dem Storage geladen, um Klartext-Risiken zu vermeiden.
      apiToken: '',
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
      // Speichere nur die API-Basis, um das Speichern von Tokens in Klartext zu vermeiden.
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ apiBaseUrl: config.apiBaseUrl, apiToken: '' }),
      );
    } catch (error) {
      console.warn('Konnte API-Konfiguration nicht speichern', error);
    }
  }, [config.apiBaseUrl]);

  const setApiBaseUrl = useCallback((value: string) => {
    setConfig((prev) => ({ ...prev, apiBaseUrl: normalizeApiBase(value) }));
  }, []);

  const setApiToken = useCallback((value: string) => {
    setConfig((prev) => ({ ...prev, apiToken: value }));
  }, []);

  const value = useMemo<ApiConfigContextValue>(() => {
    const normalizedBase = normalizeApiBase(config.apiBaseUrl);
    const uploadEndpoint = `${normalizedBase}/api/v1/dgs/sample-bundles`;
    return {
      apiBaseUrl: normalizedBase,
      apiToken: config.apiToken,
      setApiBaseUrl,
      setApiToken,
      uploadEndpoint,
    };
  }, [config.apiBaseUrl, config.apiToken, setApiBaseUrl, setApiToken]);

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
