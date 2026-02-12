import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveApiUrl } from './resolveApiUrl';

describe('resolveApiUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns path when VITE_API_URL is not configured', () => {
    vi.stubEnv('VITE_API_URL', '');
    expect(resolveApiUrl('/api/v1/models/latest')).toBe('/api/v1/models/latest');
  });

  it('normalizes /api and /api/v1 suffixes', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/api/v1/');
    expect(resolveApiUrl('/api/v1/models/latest')).toBe('https://api.example.com/api/v1/models/latest');

    vi.stubEnv('VITE_API_URL', 'https://api.example.com/api');
    expect(resolveApiUrl('/api/v1/models/latest')).toBe('https://api.example.com/api/v1/models/latest');
  });
});
