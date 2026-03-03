export const TRAILING_UUID_SUFFIX_PATTERN = /[-_][0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function stripTrailingUuidSuffix(value: string): string {
  return value.trim().replace(TRAILING_UUID_SUFFIX_PATTERN, '').trim();
}
