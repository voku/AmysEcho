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

export function resolveApiUrl(path: string): string {
  const envBase = normalizeConfiguredApiBase(import.meta.env['VITE_API_URL']);
  if (!envBase) {
    return path;
  }
  return `${envBase}${path}`;
}
