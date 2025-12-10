import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'webapp:api-config';
const PERSISTED_TOKEN_KEY = 'webapp:api-config:persisted-token';
const PERSISTED_CRYPTO_KEY = 'webapp:api-config:persisted-key';
const SESSION_STORAGE_KEY = 'webapp:api-config:session';
const SESSION_CRYPTO_KEY = 'webapp:api-config:session:key';
const DEFAULT_NON_PROD_API_BASE = 'http://localhost:5000';
const DEV_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://localhost:5173',
  'https://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'https://localhost:4173',
  'https://127.0.0.1:4173',
]);

export function resolveFallbackApiBase(
  env: Pick<ImportMetaEnv, 'MODE'> & { VITE_API_URL?: string } = import.meta.env,
  runtimeWindow: Pick<Window, 'location'> | undefined = typeof window !== 'undefined' ? window : undefined,
): string {
  if (env.MODE === 'test') return DEFAULT_NON_PROD_API_BASE;
  const envBase = env['VITE_API_URL'] as string | undefined;
  if (envBase?.trim()) return envBase.trim().replace(/\/$/, '');
  const runtimeOrigin = runtimeWindow?.location?.origin;
  const isValidRuntimeOrigin =
    runtimeOrigin &&
    runtimeOrigin !== 'null' &&
    /^https?:\/\//i.test(runtimeOrigin) &&
    !DEV_ORIGINS.has(runtimeOrigin);
  if (isValidRuntimeOrigin) {
    return runtimeOrigin.replace(/\/$/, '');
  }
  return DEFAULT_NON_PROD_API_BASE;
}

type EncryptedToken = {
  ciphertext: string;
  iv: string;
};

type StoredEncryptedToken = {
  encrypted: EncryptedToken;
  source: 'persisted' | 'session';
};

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

type StoredApiConfig = {
  apiBaseUrl: string;
  tokens: AuthTokens;
  persistToken: boolean;
};

type ApiConfigContextValue = {
  apiBaseUrl: string;
  apiToken: string;
  refreshToken: string;
  persistToken: boolean;
  setApiBaseUrl: (value: string) => void;
  setApiToken: (value: string) => void;
  setTokens: (tokens: AuthTokens) => void;
  setPersistToken: (value: boolean) => void;
  clearApiToken: () => void;
  refreshAccessToken: () => Promise<string | null>;
  uploadEndpoint: string;
  modelEndpoint: string;
};

function createDefaultConfig(): StoredApiConfig {
  return {
    apiBaseUrl: resolveFallbackApiBase(),
    tokens: { accessToken: '', refreshToken: '' },
    persistToken: false,
  } satisfies StoredApiConfig;
}

const initialEncryptedToken: { current: StoredEncryptedToken | null } = { current: null };

function toBase64(data: ArrayBuffer | Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data).toString('base64');
  }
  let binary = '';
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'));
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

let persistedCryptoKey: Promise<CryptoKey> | null = null;
let sessionCryptoKey: Promise<CryptoKey> | null = null;

async function getPersistedCryptoKey(): Promise<CryptoKey> {
  if (typeof window === 'undefined') {
    throw new Error('CryptoKey kann ohne Browser nicht erzeugt werden.');
  }
  const storedKey = window.localStorage.getItem(PERSISTED_CRYPTO_KEY);
  if (!storedKey) {
    persistedCryptoKey = null;
  }
  const createKey = () => {
    const currentStoredKey = window.localStorage.getItem(PERSISTED_CRYPTO_KEY);
    const rawBytes = currentStoredKey ? fromBase64(currentStoredKey) : new Uint8Array(32);
    if (!currentStoredKey) {
      window.crypto.getRandomValues(rawBytes);
      window.localStorage.setItem(PERSISTED_CRYPTO_KEY, toBase64(rawBytes));
    }
    // Create a proper Uint8Array with its own ArrayBuffer for importKey
    const keyBytes = new Uint8Array(rawBytes);
    return window.crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  };

  const resolveKey = async (): Promise<CryptoKey> => {
    if (!persistedCryptoKey) {
      persistedCryptoKey = createKey();
    }
    try {
      return await persistedCryptoKey;
    } catch (error) {
      console.warn('Ungültiger gespeicherter CryptoKey, erstelle neu', error);
      window.localStorage.removeItem(PERSISTED_CRYPTO_KEY);
      persistedCryptoKey = createKey();
      return persistedCryptoKey;
    }
  };

  const key = await resolveKey();
  if (!key) {
    throw new Error('CryptoKey konnte nicht erzeugt werden.');
  }
  return key;
}

async function getSessionCryptoKey(): Promise<CryptoKey> {
  if (typeof window === 'undefined') {
    throw new Error('CryptoKey kann ohne Browser nicht erzeugt werden.');
  }
  const storedKey = window.sessionStorage.getItem(SESSION_CRYPTO_KEY);
  if (!storedKey) {
    sessionCryptoKey = null;
  }
  const createKey = () => {
    const currentStoredKey = window.sessionStorage.getItem(SESSION_CRYPTO_KEY);
    const rawBytes = currentStoredKey ? fromBase64(currentStoredKey) : new Uint8Array(32);
    if (!currentStoredKey) {
      window.crypto.getRandomValues(rawBytes);
      window.sessionStorage.setItem(SESSION_CRYPTO_KEY, toBase64(rawBytes));
    }
    const keyBytes = new Uint8Array(rawBytes);
    return window.crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  };

  if (!sessionCryptoKey) {
    sessionCryptoKey = createKey();
  }

  try {
    return await sessionCryptoKey;
  } catch (error) {
    console.warn('Ungültiger Sitzungsschlüssel, erstelle neu', error);
    window.sessionStorage.removeItem(SESSION_CRYPTO_KEY);
    sessionCryptoKey = createKey();
    return sessionCryptoKey;
  }
}

async function encryptToken(value: string, source: StoredEncryptedToken['source']): Promise<EncryptedToken> {
  const key = source === 'session' ? await getSessionCryptoKey() : await getPersistedCryptoKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);
  const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return { ciphertext: toBase64(ciphertext), iv: toBase64(iv) };
}

async function decryptToken(encrypted: EncryptedToken, source: StoredEncryptedToken['source']): Promise<string> {
  const key = source === 'session' ? await getSessionCryptoKey() : await getPersistedCryptoKey();
  const ivBytes = Uint8Array.from(fromBase64(encrypted.iv));
  const ciphertext = Uint8Array.from(fromBase64(encrypted.ciphertext));
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(decrypted);
}

function normalizeApiBase(raw: string | undefined): string {
  if (!raw) return resolveFallbackApiBase();
  const trimmed = raw.trim();
  if (!trimmed) return resolveFallbackApiBase();
  return trimmed.replace(/\/$/, '');
}

function readFromStorage(): StoredApiConfig {
  if (typeof window === 'undefined') return createDefaultConfig();
  initialEncryptedToken.current = null;
  const fallbackBase = resolveFallbackApiBase();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const persistedRaw = window.localStorage.getItem(PERSISTED_TOKEN_KEY);
    const sessionRaw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const persistedParsed = persistedRaw ? JSON.parse(persistedRaw) : {};
    const sessionParsed = sessionRaw ? JSON.parse(sessionRaw) : {};
    const persistToken = Boolean(parsed?.persistToken);
    const storedBase = persistToken
      ? persistedParsed?.apiBaseUrl ?? sessionParsed?.apiBaseUrl ?? parsed?.apiBaseUrl
      : parsed?.apiBaseUrl;
    const normalizedStoredBase = normalizeApiBase(storedBase);
    const apiBaseUrl =
      normalizedStoredBase === DEFAULT_NON_PROD_API_BASE && fallbackBase !== DEFAULT_NON_PROD_API_BASE
        ? fallbackBase
        : normalizedStoredBase;
    const tokenSource =
      persistedParsed.apiToken && persistedParsed.iv
        ? { encrypted: { ciphertext: persistedParsed.apiToken, iv: persistedParsed.iv }, source: 'persisted' as const }
        : sessionParsed.apiToken && sessionParsed.iv
          ? { encrypted: { ciphertext: sessionParsed.apiToken, iv: sessionParsed.iv }, source: 'session' as const }
          : null;
    if (tokenSource) {
      initialEncryptedToken.current = tokenSource;
    }
    return {
      apiBaseUrl: apiBaseUrl ?? fallbackBase,
      tokens: { accessToken: '', refreshToken: '' },
      persistToken,
    } satisfies StoredApiConfig;
  } catch (error) {
    console.warn('Konnte API-Konfiguration nicht lesen', error);
    return createDefaultConfig();
  }
}

const ApiConfigContext = createContext<ApiConfigContextValue | null>(null);

export function ApiConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<StoredApiConfig>(() => readFromStorage());
  const refreshInFlight = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    const loadEncryptedToken = async () => {
      if (!initialEncryptedToken.current) return;
      try {
        const decrypted = await decryptToken(
          initialEncryptedToken.current.encrypted,
          initialEncryptedToken.current.source,
        );
        const parsedTokens = (() => {
          try {
            const parsed = JSON.parse(decrypted) as Partial<AuthTokens>;
            if (parsed && typeof parsed === 'object' && typeof parsed.accessToken === 'string') {
              return {
                accessToken: parsed.accessToken,
                refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : '',
              } satisfies AuthTokens;
            }
          } catch (error) {
            // Fall through to legacy handling
          }
          return { accessToken: decrypted, refreshToken: '' } satisfies AuthTokens;
        })();
        if (!cancelled) {
          setConfig((prev) => ({ ...prev, tokens: parsedTokens }));
        }
      } catch (error) {
        console.warn('Konnte verschlüsselten Token nicht laden', error);
        if (initialEncryptedToken.current?.source === 'persisted') {
          window.localStorage.removeItem(PERSISTED_TOKEN_KEY);
          window.localStorage.removeItem(PERSISTED_CRYPTO_KEY);
          persistedCryptoKey = null;
        }
        if (initialEncryptedToken.current?.source === 'session') {
          window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
          window.sessionStorage.removeItem(SESSION_CRYPTO_KEY);
          sessionCryptoKey = null;
        }
      } finally {
        initialEncryptedToken.current = null;
      }
    };

    loadEncryptedToken();
    return () => {
      cancelled = true;
    };
  }, [config.persistToken]);

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
    let cancelled = false;

    const persistTokenConfig = async () => {
      try {
        if (config.persistToken) {
          if (!config.tokens.accessToken && initialEncryptedToken.current) {
            return;
          }
          const encrypted = await encryptToken(JSON.stringify(config.tokens), 'persisted');
          if (!cancelled) {
            window.localStorage.setItem(
              PERSISTED_TOKEN_KEY,
              JSON.stringify({ apiBaseUrl: config.apiBaseUrl, apiToken: encrypted.ciphertext, iv: encrypted.iv }),
            );
            window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
            window.sessionStorage.removeItem(SESSION_CRYPTO_KEY);
          }
        } else {
          window.localStorage.removeItem(PERSISTED_TOKEN_KEY);
          window.localStorage.removeItem(PERSISTED_CRYPTO_KEY);
          persistedCryptoKey = null;
          if (config.tokens.accessToken || config.tokens.refreshToken) {
            const encrypted = await encryptToken(JSON.stringify(config.tokens), 'session');
            if (!cancelled) {
              window.sessionStorage.setItem(
                SESSION_STORAGE_KEY,
                JSON.stringify({ apiBaseUrl: config.apiBaseUrl, apiToken: encrypted.ciphertext, iv: encrypted.iv }),
              );
            }
          } else if (!initialEncryptedToken.current) {
            window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
            window.sessionStorage.removeItem(SESSION_CRYPTO_KEY);
          }
        }
      } catch (error) {
        console.warn('Konnte API-Token-Konfiguration nicht speichern', error);
      }
    };

    persistTokenConfig();
    return () => {
      cancelled = true;
    };
  }, [config.apiBaseUrl, config.persistToken, config.tokens.accessToken, config.tokens.refreshToken]);

  const setApiBaseUrl = useCallback((value: string) => {
    setConfig((prev) => ({ ...prev, apiBaseUrl: normalizeApiBase(value) }));
  }, []);

  const setApiToken = useCallback((value: string) => {
    setConfig((prev) => ({ ...prev, tokens: { ...prev.tokens, accessToken: value } }));
  }, []);

  const setTokens = useCallback((tokens: AuthTokens) => {
    setConfig((prev) => ({ ...prev, tokens }));
  }, []);

  const setPersistToken = useCallback((value: boolean) => {
    setConfig((prev) => {
      const next = { ...prev, persistToken: value };
      if (!value) {
        next.tokens = { accessToken: '', refreshToken: '' };
      }
      return next;
    });
  }, []);

  const clearApiToken = useCallback(() => {
    setConfig((prev) => ({ ...prev, tokens: { accessToken: '', refreshToken: '' } }));
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    const currentRefreshToken = config.tokens.refreshToken;
    if (!currentRefreshToken) return null;
    if (typeof window === 'undefined') return null;
    if (refreshInFlight.current) return refreshInFlight.current;

    const refreshPromise = (async () => {
      try {
        const response = await fetch(`${normalizeApiBase(config.apiBaseUrl)}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: currentRefreshToken }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || response.statusText);
        }

        const nextAccessToken: string | undefined = payload?.tokens?.accessToken;
        const nextRefreshToken: string = payload?.tokens?.refreshToken ?? currentRefreshToken;

        if (!nextAccessToken) {
          throw new Error('Token-Antwort unvollständig.');
        }

        setConfig((prev) => ({
          ...prev,
          tokens: { accessToken: nextAccessToken, refreshToken: nextRefreshToken },
        }));

        return nextAccessToken;
      } catch (error) {
        console.warn('Token-Refresh fehlgeschlagen', error);
        setConfig((prev) => ({ ...prev, tokens: { accessToken: '', refreshToken: '' } }));
        return null;
      } finally {
        refreshInFlight.current = null;
      }
    })();

    refreshInFlight.current = refreshPromise;
    return refreshPromise;
  }, [config.apiBaseUrl, config.tokens.refreshToken]);

  const value = useMemo<ApiConfigContextValue>(() => {
    const normalizedBase = normalizeApiBase(config.apiBaseUrl);
    const uploadEndpoint = `${normalizedBase}/api/v1/dgs/sample-bundles`;
    const modelEndpoint = `${normalizedBase}/latest-mlp-model`;
    return {
      apiBaseUrl: normalizedBase,
      apiToken: config.tokens.accessToken,
      refreshToken: config.tokens.refreshToken,
      persistToken: config.persistToken,
      setApiBaseUrl,
      setApiToken,
      setTokens,
      setPersistToken,
      clearApiToken,
      refreshAccessToken,
      uploadEndpoint,
      modelEndpoint,
    };
  }, [
    config.apiBaseUrl,
    config.tokens.accessToken,
    config.tokens.refreshToken,
    config.persistToken,
    setApiBaseUrl,
    setApiToken,
    setTokens,
    setPersistToken,
    clearApiToken,
    refreshAccessToken,
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
