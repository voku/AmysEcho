import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveApiUrl } from './resolveApiUrl';

describe('resolveApiUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    window.localStorage.clear();
  });

  it('returns normalized path when API base is not configured', () => {
    vi.stubEnv('VITE_API_URL', '');
    expect(resolveApiUrl('/api/v1/models/latest')).toBe('/api/v1/models/latest');
    expect(resolveApiUrl('api/v1/models/latest')).toBe('/api/v1/models/latest');
  });

  it('normalizes /api and /api/v1 suffixes from env config', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/api/v1/');
    expect(resolveApiUrl('/api/v1/models/latest')).toBe('https://api.example.com/api/v1/models/latest');

    vi.stubEnv('VITE_API_URL', 'https://api.example.com/api');
    expect(resolveApiUrl('/api/v1/models/latest')).toBe('https://api.example.com/api/v1/models/latest');
  });

  it('prefers explicitly provided base', () => {
    vi.stubEnv('VITE_API_URL', 'https://env.example.com');
    expect(resolveApiUrl('/api/v1/models/latest', 'https://preferred.example.com/api/v1')).toBe(
      'https://preferred.example.com/api/v1/models/latest',
    );
  });

  it('uses runtime UI API base from localStorage when available', () => {
    vi.stubEnv('VITE_API_URL', 'https://env.example.com');
    window.localStorage.setItem('webapp:api-config', JSON.stringify({ apiBaseUrl: 'https://runtime.example.com/api' }));

    expect(resolveApiUrl('/api/v1/models/latest')).toBe('https://runtime.example.com/api/v1/models/latest');
  });
});
