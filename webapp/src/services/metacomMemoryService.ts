import type { MetacomSymbolRole } from '../types/metacom';

export type MetacomMemoryItem = {
  id: string;
  label: string;
  emoji: string;
  role?: MetacomSymbolRole;
};

const MEMORY_PREFIX = 'webapp:metacom-memory:';

function getStorageKey(profileId: string | null): string {
  return `${MEMORY_PREFIX}${profileId ?? 'default'}`;
}

export function loadMetacomMemory(profileId: string | null): MetacomMemoryItem[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(getStorageKey(profileId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as MetacomMemoryItem[];
    return Array.isArray(parsed)
      ? parsed.filter(
        (item) =>
          typeof item?.id === 'string'
          && typeof item?.label === 'string'
          && typeof item?.emoji === 'string',
      )
      : [];
  } catch {
    return [];
  }
}

export function saveMetacomMemory(
  profileId: string | null,
  items: MetacomMemoryItem[],
): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getStorageKey(profileId), JSON.stringify(items));
}

export function addMetacomMemoryItem(
  profileId: string | null,
  item: MetacomMemoryItem,
): MetacomMemoryItem[] {
  const existing = loadMetacomMemory(profileId);
  const next = [item, ...existing.filter((entry) => entry.id !== item.id)].slice(0, 12);
  saveMetacomMemory(profileId, next);
  return next;
}

export function clearMetacomMemory(profileId: string | null): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(getStorageKey(profileId));
}
