import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import { ApiConfigProvider, useApiConfig, resolvePollUrl } from './useApiConfig';

describe('useApiConfig', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    Object.defineProperty(window, 'crypto', { value: webcrypto, writable: true });
  });

  it('provides default values and computed upload endpoint', () => {
    const { result } = renderHook(() => useApiConfig(), { wrapper: ApiConfigProvider });

    expect(result.current.apiBaseUrl).toBe('http://localhost:3000');
    expect(result.current.apiToken).toBe('');
    expect(result.current.persistToken).toBe(false);
    expect(result.current.uploadEndpoint).toBe('http://localhost:3000/api/v1/dgs/sample-bundles');
    expect(result.current.modelEndpoint).toBe('http://localhost:3000/latest-mlp-model');
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

    expect(result.current.apiBaseUrl).toBe('http://localhost:3000');
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
