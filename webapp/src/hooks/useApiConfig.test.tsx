import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { ApiConfigProvider, useApiConfig, resolvePollUrl } from './useApiConfig';

describe('useApiConfig', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('provides default values and computed upload endpoint', () => {
    const { result } = renderHook(() => useApiConfig(), { wrapper: ApiConfigProvider });

    expect(result.current.apiBaseUrl).toBe('http://localhost:3000');
    expect(result.current.apiToken).toBe('');
    expect(result.current.uploadEndpoint).toBe('http://localhost:3000/api/v1/dgs/sample-bundles');
  });

  it('normalizes API base URL by removing trailing slashes', () => {
    const { result } = renderHook(() => useApiConfig(), { wrapper: ApiConfigProvider });

    act(() => {
      result.current.setApiBaseUrl('https://api.example.com/');
    });

    expect(result.current.apiBaseUrl).toBe('https://api.example.com');
    expect(result.current.uploadEndpoint).toBe('https://api.example.com/api/v1/dgs/sample-bundles');
  });

  it('persists API base URL to localStorage but not tokens', () => {
    const { result } = renderHook(() => useApiConfig(), { wrapper: ApiConfigProvider });

    act(() => {
      result.current.setApiBaseUrl('https://api.example.com');
      result.current.setApiToken('secret-token-123');
    });

    const stored = window.localStorage.getItem('webapp:api-config');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.apiBaseUrl).toBe('https://api.example.com');
    expect(parsed.apiToken).toBe(''); // Token should not be persisted
  });

  it('loads API base URL from localStorage on initialization', () => {
    window.localStorage.setItem(
      'webapp:api-config',
      JSON.stringify({ apiBaseUrl: 'https://stored.example.com', apiToken: '' }),
    );

    const { result } = renderHook(() => useApiConfig(), { wrapper: ApiConfigProvider });

    expect(result.current.apiBaseUrl).toBe('https://stored.example.com');
    expect(result.current.apiToken).toBe(''); // Token should never be loaded from storage
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
