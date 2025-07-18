import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureModelEntry } from '../model';

const KEY = 'usageStats';

export async function incrementUsage(entry: GestureModelEntry, profileId: string): Promise<void> {
  const raw = await AsyncStorage.getItem(KEY);
  const data: Record<string, number> = raw ? JSON.parse(raw) : {};
  const key = `${profileId}:${entry.id}`;
  data[key] = (data[key] || 0) + 1;
  await AsyncStorage.setItem(KEY, JSON.stringify(data));
}

export async function loadUsageStats(profileId: string): Promise<Record<string, number>> {
  const raw = await AsyncStorage.getItem(KEY);
  const data: Record<string, number> = raw ? JSON.parse(raw) : {};
  const out: Record<string, number> = {};
  const prefix = `${profileId}:`;
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith(prefix)) {
      out[key.slice(prefix.length)] = value;
    }
  }
  return out;
}
