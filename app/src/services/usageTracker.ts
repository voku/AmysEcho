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
