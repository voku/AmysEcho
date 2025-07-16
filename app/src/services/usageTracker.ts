import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureModelEntry } from '../model';

const KEY = 'usageStats';

export type UsageStats = Record<string, number>;

export async function getUsageStats(): Promise<UsageStats> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : {};
}

export async function incrementUsage(
  entry: GestureModelEntry,
  profileId: string,
): Promise<void> {
  const data = await getUsageStats();
  const key = `${profileId}:${entry.id}`;
  data[key] = (data[key] || 0) + 1;
  await AsyncStorage.setItem(KEY, JSON.stringify(data));
}
