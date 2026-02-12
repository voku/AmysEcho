const API_CONFIG_KEY = 'webapp:api-config';

function normalizeConfiguredApiBase(raw: string | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
  const withoutApiPrefix = withoutTrailingSlash
    .replace(/\/api\/v1$/i, '')
    .replace(/\/api$/i, '');
  return withoutApiPrefix;
}

function readApiBaseFromStorage(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    const raw = window.localStorage.getItem(API_CONFIG_KEY);
    if (!raw) {
      return '';
    }
    const parsed = JSON.parse(raw) as { apiBaseUrl?: string };
    return normalizeConfiguredApiBase(parsed.apiBaseUrl);
  } catch {
    return '';
  }
}

export function resolveApiUrl(path: string, preferredBase?: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = normalizeConfiguredApiBase(preferredBase)
    || readApiBaseFromStorage()
    || normalizeConfiguredApiBase(import.meta.env['VITE_API_URL']);

  if (!base) {
    return normalizedPath;
  }

  return `${base}${normalizedPath}`;
}
