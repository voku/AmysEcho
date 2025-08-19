import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, API_TOKEN } from '../constants';

const KEY = 'dgsCentroids';

export type Point = [number, number, number];
export type CentroidMap = Record<string, Point[]>;

export async function fetchCentroids(profileId?: string): Promise<{ centroids: CentroidMap; counts: Record<string, number> } | null> {
  try {
    const url = new URL('/api/v1/dgs/model', API_URL);
    if (profileId) url.searchParams.set('profileId', profileId);
    const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${API_TOKEN}` } });
    if (!resp.ok) return null;
    const data = await resp.json();
    await AsyncStorage.setItem(`${KEY}:${profileId || 'global'}`, JSON.stringify(data));
    return data;
  } catch {
    return null;
  }
}

export async function getCachedCentroids(profileId?: string): Promise<{ centroids: CentroidMap; counts: Record<string, number> } | null> {
  const raw = await AsyncStorage.getItem(`${KEY}:${profileId || 'global'}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

