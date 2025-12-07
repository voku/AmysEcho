import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'webapp:api-config';
const PERSISTED_TOKEN_KEY = 'webapp:api-config:persisted-token';
const PERSISTED_CRYPTO_KEY = 'webapp:api-config:persisted-key';
const SESSION_STORAGE_KEY = 'webapp:api-config:session';
const SESSION_CRYPTO_KEY = 'webapp:api-config:session:key';
const DEFAULT_PROD_API_BASE = 'https://amysecho.moelleken.org';
const DEFAULT_NON_PROD_API_BASE = 'http://localhost:5000';

export function resolveFallbackApiBase(
  env: Pick<ImportMetaEnv, 'MODE'> & { VITE_API_URL?: string } = import.meta.env,
): string {
  const envBase = env['VITE_API_URL'] as string | undefined;
  if (envBase) return envBase;
  return env.MODE === 'production' ? DEFAULT_PROD_API_BASE : DEFAULT_NON_PROD_API_BASE;
}

type EncryptedToken = {
  ciphertext: string;
  iv: string;
};

type StoredEncryptedToken = {
  encrypted: EncryptedToken;
  source: 'persisted' | 'session';
};

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
  modelEndpoint: string;
};

function createDefaultConfig(): StoredApiConfig {
  return {
    apiBaseUrl: resolveFallbackApiBase(),
    apiToken: '',
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

async function getPersistedCryptoKey(): Promise<CryptoKey> {
  if (typeof window === 'undefined') {
    throw new Error('CryptoKey kann ohne Browser nicht erzeugt werden.');
  }
  const storedKey = window.localStorage.getItem(PERSISTED_CRYPTO_KEY);
  if (!storedKey) {
    persistedCryptoKey = null;
  }
  if (!persistedCryptoKey) {
    const rawBytes = storedKey ? fromBase64(storedKey) : new Uint8Array(32);
    if (!storedKey) {
      window.crypto.getRandomValues(rawBytes);
    }
    // Create a proper Uint8Array with its own ArrayBuffer for importKey
    const keyBytes = new Uint8Array(rawBytes);
    persistedCryptoKey = window.crypto.subtle
      .importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
      .then((key) => {
        if (!storedKey) {
          window.localStorage.setItem(PERSISTED_CRYPTO_KEY, toBase64(rawBytes));
        }
        return key;
      });
  }
  const key = persistedCryptoKey;
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
    throw new Error('Kein Session-Crypto-Key vorhanden.');
  }
  const rawBytes = fromBase64(storedKey);
  // Create a proper Uint8Array with its own ArrayBuffer for importKey
  const keyBytes = new Uint8Array(rawBytes);
  return window.crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptToken(value: string): Promise<EncryptedToken> {
  const key = await getPersistedCryptoKey();
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
    const tokenSource =
      persistedParsed.apiToken && persistedParsed.iv
        ? { encrypted: { ciphertext: persistedParsed.apiToken, iv: persistedParsed.iv }, source: 'persisted' as const }
        : sessionParsed.apiToken && sessionParsed.iv
          ? { encrypted: { ciphertext: sessionParsed.apiToken, iv: sessionParsed.iv }, source: 'session' as const }
          : null;
    if (persistToken && tokenSource) {
      initialEncryptedToken.current = tokenSource;
    }
    return {
      apiBaseUrl: normalizeApiBase(storedBase),
      apiToken: '',
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    const loadEncryptedToken = async () => {
      if (!config.persistToken || !initialEncryptedToken.current) return;
      try {
        const decrypted = await decryptToken(
          initialEncryptedToken.current.encrypted,
          initialEncryptedToken.current.source,
        );
        if (!cancelled) {
          setConfig((prev) => ({ ...prev, apiToken: decrypted }));
        }
      } catch (error) {
        console.warn('Konnte verschlüsselten Token nicht laden', error);
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
          if (!config.apiToken && initialEncryptedToken.current) {
            return;
          }
          const encrypted = await encryptToken(config.apiToken);
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
          window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
          window.sessionStorage.removeItem(SESSION_CRYPTO_KEY);
          persistedCryptoKey = null;
        }
      } catch (error) {
        console.warn('Konnte API-Token-Konfiguration nicht speichern', error);
      }
    };

    persistTokenConfig();
    return () => {
      cancelled = true;
    };
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
    const modelEndpoint = `${normalizedBase}/latest-mlp-model`;
    return {
      apiBaseUrl: normalizedBase,
      apiToken: config.apiToken,
      persistToken: config.persistToken,
      setApiBaseUrl,
      setApiToken,
      setPersistToken,
      clearApiToken,
      uploadEndpoint,
      modelEndpoint,
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
