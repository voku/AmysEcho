import { Buffer } from 'buffer';

const getApiUrl = () => process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';
const getApiToken = () => process.env.EXPO_PUBLIC_API_TOKEN || 'demo-token';

const KEY = 'dgsCentroids';
const MLP_KEY = 'dgsMlpModel';

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
  } catch {
    return null;
  }
}

export async function getCachedCentroids(profileId?: string): Promise<{ centroids: CentroidMap; counts: Record<string, number> } | null> {
  const storage = await getStorage();
  const raw = await storage.getItem(`${KEY}:${profileId || 'global'}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function fetchMlpModel(profileId?: string): Promise<string | null> {
  try {
    const url = new URL('/api/v1/dgs/mlp-model', getApiUrl());
    if (profileId) url.searchParams.set('profileId', profileId);
    const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${getApiToken()}` } });
    const buf = Buffer.from(await resp.arrayBuffer());
    const b64 = buf.toString('base64');
    const storage = await getStorage();
    await storage.setItem(`${MLP_KEY}:${profileId || 'global'}`, b64);
    return b64;
  } catch {
    return null;
  }
}

export async function getCachedMlpModel(profileId?: string): Promise<string | null> {
  const storage = await getStorage();
  return storage.getItem(`${MLP_KEY}:${profileId || 'global'}`);
}
