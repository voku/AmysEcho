import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gdprService } from './gdprService';

describe('gdprService', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('exportProfile requests ZIP export from server and returns archive metadata', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]).buffer, {
        status: 200,
        headers: {
          'X-Profile-Checksum': 'checksum-abc',
        },
      }),
    );

    const result = await gdprService.exportProfile('amy-1', {
      apiBaseUrl: 'http://localhost:5000',
      apiToken: 'secret-token',
    });

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:5000/api/v1/profiles/amy-1/export', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret-token',
      },
    });
    expect(result?.fileName).toBe('profile_amy-1_export.zip');
    expect(result?.checksum).toBe('checksum-abc');
    expect(result?.blob.type).toBe('application/zip');
  });

  it('exportLocalData only includes known local browser keys', () => {
    localStorage.setItem('apiUrl', 'http://localhost:5000');
    localStorage.setItem('selectedTheme', 'dark');
    localStorage.setItem('webapp:api-config', '{"apiBaseUrl":"http://localhost:5000"}');
    localStorage.setItem('unrelated_key', 'should-not-export');

    const result = gdprService.exportLocalData();

    expect(result).toEqual({
      apiUrl: 'http://localhost:5000',
      selectedTheme: 'dark',
      'webapp:api-config': {
        apiBaseUrl: 'http://localhost:5000',
      },
    });
    expect(result).not.toHaveProperty('unrelated_key');
  });
});
