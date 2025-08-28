import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'practiceSchedules';
const LAST_SHOWN_KEY = 'practiceSchedules:lastShown';

import { PracticeSchedule } from '../types';

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export async function listSchedules(): Promise<PracticeSchedule[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function addSchedule(partial: Omit<PracticeSchedule, 'id' | 'enabled'> & { enabled?: boolean }): Promise<PracticeSchedule> {
  const all = await listSchedules();
  const rec: PracticeSchedule = { id: genId(), enabled: true, ...partial } as PracticeSchedule;
  all.push(rec);
  await AsyncStorage.setItem(KEY, JSON.stringify(all));
  return rec;
}

export async function setScheduleEnabled(id: string, enabled: boolean): Promise<void> {
  const all = await listSchedules();
  const idx = all.findIndex((s) => s.id === id);
  if (idx >= 0) {
    all[idx].enabled = enabled;
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
  }
}

export async function removeSchedule(id: string): Promise<void> {
  const all = await listSchedules();
  const next = all.filter((s) => s.id !== id);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

export async function getDueGesture(now: Date = new Date()): Promise<string | null> {
  const all = await listSchedules();
  if (all.length === 0) return null;
  // Use UTC-based fields for deterministic behavior across time zones
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const lastShownRaw = await AsyncStorage.getItem(LAST_SHOWN_KEY);
  const lastShown: Record<string, string> = lastShownRaw ? JSON.parse(lastShownRaw) : {};
  for (const s of all) {
    if (!s.enabled) continue;
    if (s.daysOfWeek && s.daysOfWeek.length && !s.daysOfWeek.includes(day)) continue;
    if (s.hour === hour && s.minute === minute) {
      const key = `${now.toDateString()}:${s.id}`;
      if (lastShown[key]) continue; // already shown this minute/day
      lastShown[key] = '1';
      await AsyncStorage.setItem(LAST_SHOWN_KEY, JSON.stringify(lastShown));
      return s.gestureId;
    }
  }
  return null;
}
