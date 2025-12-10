import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { ApiConfigProvider, useApiConfig, resolveFallbackApiBase, resolvePollUrl } from './useApiConfig';

describe('useApiConfig', () => {
  const DEFAULT_API_BASE = 'http://localhost:5000';

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    Object.defineProperty(window, 'crypto', { value: webcrypto, writable: true });
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('provides default values and computed upload endpoint', () => {
    const { result } = renderHook(() => useApiConfig(), { wrapper: ApiConfigProvider });

    expect(result.current.apiBaseUrl).toBe(DEFAULT_API_BASE);
    expect(result.current.apiToken).toBe('');
    expect(result.current.persistToken).toBe(false);
    expect(result.current.uploadEndpoint).toBe(`${DEFAULT_API_BASE}/api/v1/dgs/sample-bundles`);
    expect(result.current.modelEndpoint).toBe(`${DEFAULT_API_BASE}/latest-mlp-model`);
  });

  it('uses environment override as fallback API base', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/');

    const fallbackBase = resolveFallbackApiBase({
      MODE: 'production',
      VITE_API_URL: import.meta.env['VITE_API_URL'],
    } as any);

    expect(fallbackBase).toBe('https://api.example.com');
  });

  it('keeps non-production default when no environment override is provided', () => {
    const fallbackBase = resolveFallbackApiBase(
      { MODE: 'production', VITE_API_URL: undefined } as any,
      { location: { origin: 'http://localhost:5173' } } as any,
    );

    expect(fallbackBase).toBe(DEFAULT_API_BASE);
  });

  it('ignores invalid runtime origin values', () => {
    const fileOriginBase = resolveFallbackApiBase(
      { MODE: 'production', VITE_API_URL: undefined } as any,
      { location: { origin: 'file://' } } as any,
    );
    const nullOriginBase = resolveFallbackApiBase(
      { MODE: 'production', VITE_API_URL: undefined } as any,
      { location: { origin: 'null' } } as any,
    );

    expect(fileOriginBase).toBe(DEFAULT_API_BASE);
    expect(nullOriginBase).toBe(DEFAULT_API_BASE);
  });

  it('uses runtime origin when running in production without override', () => {
    const fallbackBase = resolveFallbackApiBase(
      { MODE: 'production', VITE_API_URL: undefined } as any,
      { location: { origin: 'https://amysecho.example.com' } } as any,
    );

    expect(fallbackBase).toBe('https://amysecho.example.com');
  });

  it('overwrites persisted localhost base when environment demands production backend', async () => {
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('VITE_API_URL', 'https://amysecho.moelleken.org');

    window.localStorage.setItem(
      'webapp:api-config',
      JSON.stringify({ apiBaseUrl: DEFAULT_API_BASE, persistToken: false }),
    );

    const { result } = renderHook(() => useApiConfig(), { wrapper: ApiConfigProvider });

    await waitFor(() => {
      expect(result.current.apiBaseUrl).toBe('https://amysecho.moelleken.org');
    });
  });

  it('normalizes API base URL by removing trailing slashes', () => {
    const { result } = renderHook(() => useApiConfig(), { wrapper: ApiConfigProvider });

    act(() => {
      result.current.setApiBaseUrl('https://api.example.com/');
    });

    expect(result.current.apiBaseUrl).toBe('https://api.example.com');
    expect(result.current.uploadEndpoint).toBe('https://api.example.com/api/v1/dgs/sample-bundles');
    expect(result.current.modelEndpoint).toBe('https://api.example.com/latest-mlp-model');
  });

  it('persists API base URL and token only after opt-in', async () => {
    const { result } = renderHook(() => useApiConfig(), { wrapper: ApiConfigProvider });

    await act(async () => {
      result.current.setApiBaseUrl('https://api.example.com');
      result.current.setApiToken('secret-token-123');
    });

    expect(window.localStorage.getItem('webapp:api-config:persisted-token')).toBeNull();

    await act(async () => {
      result.current.setPersistToken(true);
      result.current.setApiToken('secret-token-123');
    });

    await waitFor(() => {
      expect(window.localStorage.getItem('webapp:api-config:persisted-token')).toBeTruthy();
    });

    const stored = window.localStorage.getItem('webapp:api-config');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.apiBaseUrl).toBe('https://api.example.com');
    expect(parsed.persistToken).toBe(true);

    const persistedStored = window.localStorage.getItem('webapp:api-config:persisted-token');
    expect(persistedStored).toBeTruthy();
    const persistedParsed = JSON.parse(persistedStored!);
    expect(persistedParsed.apiBaseUrl).toBe('https://api.example.com');
    expect(persistedParsed.apiToken).toBeTypeOf('string');
    expect(persistedParsed.apiToken).not.toBe('secret-token-123');
    expect(persistedParsed.iv).toBeTypeOf('string');
  });

  it('encrypts session-scoped tokens without enabling persistence', async () => {
    const { result, unmount } = renderHook(() => useApiConfig(), { wrapper: ApiConfigProvider });

    await act(async () => {
      result.current.setApiBaseUrl('https://session.example.com');
      result.current.setApiToken('session-token');
    });

    await waitFor(() => {
      const sessionStored = window.sessionStorage.getItem('webapp:api-config:session');
      expect(sessionStored).toBeTruthy();
      const parsed = JSON.parse(sessionStored!);
      expect(parsed.apiBaseUrl).toBe('https://session.example.com');
      expect(parsed.apiToken).toBeTypeOf('string');
      expect(parsed.apiToken).not.toBe('session-token');
      expect(parsed.iv).toBeTypeOf('string');
      expect(window.sessionStorage.getItem('webapp:api-config:session:key')).toBeTruthy();
    });

    unmount();

    const { result: reloaded } = renderHook(() => useApiConfig(), { wrapper: ApiConfigProvider });

    expect(reloaded.current.persistToken).toBe(false);
    expect(reloaded.current.apiBaseUrl).toBe('https://session.example.com');
    await waitFor(() => {
      expect(reloaded.current.apiToken).toBe('session-token');
    });
  });

  it('loads API base URL and token from storage when persistence was enabled', async () => {
    const { result, unmount } = renderHook(() => useApiConfig(), { wrapper: ApiConfigProvider });

    await act(async () => {
      result.current.setApiBaseUrl('https://stored.example.com');
      result.current.setApiToken('persisted-token');
      result.current.setPersistToken(true);
    });

    await waitFor(() => {
      expect(window.localStorage.getItem('webapp:api-config:persisted-token')).toBeTruthy();
    });

    unmount();

    const { result: second } = renderHook(() => useApiConfig(), { wrapper: ApiConfigProvider });

    expect(second.current.apiBaseUrl).toBe('https://stored.example.com');
    expect(second.current.persistToken).toBe(true);

    await waitFor(() => {
      expect(second.current.apiToken).toBe('persisted-token');
    });
  });

  it('restores persisted token after a simulated page reload', async () => {
    const { result, unmount } = renderHook(() => useApiConfig(), { wrapper: ApiConfigProvider });

    await act(async () => {
      result.current.setApiBaseUrl('https://stored.example.com');
      result.current.setApiToken('persisted-token');
      result.current.setPersistToken(true);
    });

    await waitFor(() => {
      expect(window.localStorage.getItem('webapp:api-config:persisted-token')).toBeTruthy();
      expect(window.localStorage.getItem('webapp:api-config:persisted-key')).toBeTruthy();
    });

    unmount();
    window.sessionStorage.clear();

    const { result: reloaded } = renderHook(() => useApiConfig(), { wrapper: ApiConfigProvider });

    expect(reloaded.current.apiBaseUrl).toBe('https://stored.example.com');
    expect(reloaded.current.persistToken).toBe(true);

    await waitFor(() => {
      expect(reloaded.current.apiToken).toBe('persisted-token');
    });
  });

  it('stores refresh tokens and refreshes access tokens when needed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ tokens: { accessToken: 'next-access', refreshToken: 'next-refresh' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result, unmount } = renderHook(() => useApiConfig(), { wrapper: ApiConfigProvider });

    await act(async () => {
      result.current.setTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
      result.current.setPersistToken(true);
    });

    await waitFor(() => {
      expect(window.localStorage.getItem('webapp:api-config:persisted-token')).toBeTruthy();
    });

    unmount();

    const { result: reloaded } = renderHook(() => useApiConfig(), { wrapper: ApiConfigProvider });

    await waitFor(() => {
      expect(reloaded.current.apiToken).toBe('access-1');
      expect(reloaded.current.refreshToken).toBe('refresh-1');
    });

    await act(async () => {
      const refreshed = await reloaded.current.refreshAccessToken();
      expect(refreshed).toBe('next-access');
    });

    await waitFor(() => {
      expect(reloaded.current.apiToken).toBe('next-access');
      expect(reloaded.current.refreshToken).toBe('next-refresh');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:5000/api/v1/auth/refresh',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('regenerates persisted crypto key when stored key is invalid', async () => {
    window.localStorage.setItem('webapp:api-config:persisted-key', 'invalid-key');

    const { result } = renderHook(() => useApiConfig(), { wrapper: ApiConfigProvider });

    await act(async () => {
      result.current.setApiBaseUrl('https://regen.example.com');
      result.current.setPersistToken(true);
      result.current.setApiToken('persisted-token');
    });

    await waitFor(() => {
      const storedKey = window.localStorage.getItem('webapp:api-config:persisted-key');
      expect(storedKey).toBeTruthy();
      expect(storedKey).not.toBe('invalid-key');
      expect(window.localStorage.getItem('webapp:api-config:persisted-token')).toBeTruthy();
    });
  });

  it('clears corrupted persisted tokens so the hook can recover', async () => {
    const cryptoKeyBytes = new Uint8Array(32);
    webcrypto.getRandomValues(cryptoKeyBytes);
    window.localStorage.setItem('webapp:api-config', JSON.stringify({ apiBaseUrl: 'https://broken.example.com', persistToken: true }));
    window.localStorage.setItem('webapp:api-config:persisted-key', Buffer.from(cryptoKeyBytes).toString('base64'));
    window.localStorage.setItem(
      'webapp:api-config:persisted-token',
      JSON.stringify({ apiBaseUrl: 'https://broken.example.com', apiToken: '!!invalid!!', iv: '!!invalid!!' }),
    );

    const { result } = renderHook(() => useApiConfig(), { wrapper: ApiConfigProvider });

    expect(result.current.apiBaseUrl).toBe('https://broken.example.com');
    expect(result.current.persistToken).toBe(true);

    await waitFor(() => {
      expect(result.current.apiToken).toBe('');
      expect(window.localStorage.getItem('webapp:api-config:persisted-token')).toBeNull();
      expect(window.localStorage.getItem('webapp:api-config:persisted-key')).toBeNull();
    });
  });

  it('clears token storage when opting out', async () => {
    const { result } = renderHook(() => useApiConfig(), { wrapper: ApiConfigProvider });

    await act(async () => {
      result.current.setApiBaseUrl('https://api.example.com');
      result.current.setPersistToken(true);
      result.current.setApiToken('secret-token-123');
    });

    await waitFor(() => {
      expect(window.localStorage.getItem('webapp:api-config:persisted-token')).toBeTruthy();
    });

    act(() => {
      result.current.setPersistToken(false);
    });

    await waitFor(() => {
      expect(window.localStorage.getItem('webapp:api-config:persisted-token')).toBeNull();
      expect(window.localStorage.getItem('webapp:api-config:persisted-key')).toBeNull();
    });

    expect(result.current.apiToken).toBe('');
    const parsed = JSON.parse(window.localStorage.getItem('webapp:api-config')!);
    expect(parsed.persistToken).toBe(false);
  });

  it('falls back to default when empty base URL is set', () => {
    const { result } = renderHook(() => useApiConfig(), { wrapper: ApiConfigProvider });

    act(() => {
      result.current.setApiBaseUrl('');
    });

    expect(result.current.apiBaseUrl).toBe(DEFAULT_API_BASE);
  });

  it('throws error when used without provider', () => {
    expect(() => {
      renderHook(() => useApiConfig());
    }).toThrow('ApiConfigProvider fehlt');
  });
});

describe('resolvePollUrl', () => {
  it('returns undefined when jobId is missing', () => {
    expect(resolvePollUrl('https://api.example.com', '/status', '')).toBeUndefined();
    expect(resolvePollUrl('https://api.example.com', undefined, '')).toBeUndefined();
  });

  it('returns absolute URLs as-is after trimming', () => {
    const absoluteUrl = 'https://other.example.com/poll/123';
    expect(resolvePollUrl('https://api.example.com', absoluteUrl, 'job-1')).toBe(absoluteUrl);
    expect(resolvePollUrl('https://api.example.com', '  https://other.example.com/poll/123  ', 'job-1')).toBe(
      absoluteUrl,
    );
  });

  it('resolves relative URLs against base URL', () => {
    expect(resolvePollUrl('https://api.example.com', '/status/job-1', 'job-1')).toBe(
      'https://api.example.com/status/job-1',
    );
    expect(resolvePollUrl('https://api.example.com/', 'status/job-1', 'job-1')).toBe(
      'https://api.example.com/status/job-1',
    );
  });

  it('removes leading slashes from relative URLs', () => {
    expect(resolvePollUrl('https://api.example.com', '//status/job-1', 'job-1')).toBe(
      'https://api.example.com/status/job-1',
    );
  });

  it('falls back to default endpoint when pollUrl is undefined', () => {
    expect(resolvePollUrl('https://api.example.com', undefined, 'job-123')).toBe(
      'https://api.example.com/api/training-status/job-123',
    );
  });

  it('falls back to default endpoint when pollUrl is empty or whitespace', () => {
    expect(resolvePollUrl('https://api.example.com', '', 'job-123')).toBe(
      'https://api.example.com/api/training-status/job-123',
    );
    expect(resolvePollUrl('https://api.example.com', '   ', 'job-123')).toBe(
      'https://api.example.com/api/training-status/job-123',
    );
  });

  it('encodes jobId in default endpoint', () => {
    expect(resolvePollUrl('https://api.example.com', undefined, 'job/with/slashes')).toBe(
      'https://api.example.com/api/training-status/job%2Fwith%2Fslashes',
    );
  });

  it('normalizes base URL by removing trailing slashes', () => {
    expect(resolvePollUrl('https://api.example.com/', undefined, 'job-1')).toBe(
      'https://api.example.com/api/training-status/job-1',
    );
  });

  it('handles http and https protocols in absolute URLs', () => {
    expect(resolvePollUrl('https://api.example.com', 'http://other.com/poll', 'job-1')).toBe(
      'http://other.com/poll',
    );
    expect(resolvePollUrl('https://api.example.com', 'HTTPS://OTHER.COM/POLL', 'job-1')).toBe(
      'HTTPS://OTHER.COM/POLL',
    );
  });
});
