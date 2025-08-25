import { Buffer } from 'buffer';

const getApiUrl = () => process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';
const getApiToken = () => process.env.EXPO_PUBLIC_API_TOKEN || 'demo-token';

const KEY = 'dgsCentroids';
const MLP_KEY = 'dgsMlpModel';
const MLP_META_KEY = 'dgsMlpModelMeta';

type StorageLike = {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
};

async function getStorage(): Promise<StorageLike> {
  try {
    if (typeof (globalThis as any).window === 'undefined') {
      throw new Error('no window');
    }
    const mod = await import('@react-native-async-storage/async-storage');
    return mod.default as StorageLike;
  } catch {
    const mem = new Map<string, string>();
    return {
      async setItem(key: string, value: string) {
        mem.set(key, value);
      },
      async getItem(key: string) {
        return mem.get(key) ?? null;
      },
    };
  }
}

export type Point = [number, number, number];
export type CentroidMap = Record<string, Point[]>;

export async function fetchCentroids(profileId?: string): Promise<{ centroids: CentroidMap; counts: Record<string, number> } | null> {
  try {
    const url = new URL('/api/v1/dgs/model', getApiUrl());
    if (profileId) url.searchParams.set('profileId', profileId);
    const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${getApiToken()}` } });
    if (!resp.ok) return null;
    const data = await resp.json();
    const storage = await getStorage();
    await storage.setItem(`${KEY}:${profileId || 'global'}`, JSON.stringify(data));
    return data;
  } catch (error) {
    console.error('Failed to fetch MLP model:', error);
    return null;
  }
}

export async function getCachedCentroids(profileId?: string): Promise<{ centroids: CentroidMap; counts: Record<string, number> } | null> {
  const storage = await getStorage();
  const raw = await storage.getItem(`${KEY}:${profileId || 'global'}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

type MlpMeta = { etag?: string; checksum?: string; version?: string };

export async function fetchMlpModel(profileId?: string): Promise<string | null> {
  try {
    const url = new URL('/api/v1/dgs/mlp-model', getApiUrl());
    if (profileId) url.searchParams.set('profileId', profileId);
    const headers: Record<string, string> = { Authorization: `Bearer ${getApiToken()}` };
    if (profileId) headers['X-Profile-Id'] = profileId;
    // Conditional request using cached ETag
    const storage = await getStorage();
    const prevMetaRaw = await storage.getItem(`${MLP_META_KEY}:${profileId || 'global'}`);
    let prevMeta: MlpMeta | null = null;
    try { prevMeta = prevMetaRaw ? JSON.parse(prevMetaRaw) : null; } catch {}
    if (prevMeta?.etag) headers['If-None-Match'] = prevMeta.etag;

    const resp = await fetch(url.toString(), { headers });
    if (resp.status === 304) {
      // Not modified, keep cached model
      return storage.getItem(`${MLP_KEY}:${profileId || 'global'}`);
    }
    if (!resp.ok) return null;
    const lenHeader = resp.headers.get('Content-Length');
    if (lenHeader && parseInt(lenHeader, 10) > 5 * 1024 * 1024) {
      // Safety: do not accept files larger than 5 MB
      return null;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    const b64 = buf.toString('base64');
    await storage.setItem(`${MLP_KEY}:${profileId || 'global'}`, b64);
    const meta: MlpMeta = {
      etag: resp.headers.get('ETag') || undefined,
      checksum: resp.headers.get('X-Checksum-SHA256') || undefined,
      version: resp.headers.get('X-Model-Version') || undefined,
    };
    await storage.setItem(`${MLP_META_KEY}:${profileId || 'global'}`, JSON.stringify(meta));
    return b64;
  } catch (error) {
    console.error('Failed to fetch MLP model:', error);
    return null;
  }
}

export async function getCachedMlpModel(profileId?: string): Promise<string | null> {
  const storage = await getStorage();
  return storage.getItem(`${MLP_KEY}:${profileId || 'global'}`);
}
