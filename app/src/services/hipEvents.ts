import AsyncStorage from '@react-native-async-storage/async-storage';
import { telemetry } from '../telemetry/recorder';

const KEY = 'hipEvents';

export type HIPEndpoint = 'HIP_1' | 'HIP_2' | 'HIP_3' | 'HIP_4';

export interface HIPEvent {
  id: string;
  hip: HIPEndpoint;
  type: string;
  timestamp: number;
  details?: Record<string, any>;
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export async function logHIPEvent(
  hip: HIPEndpoint,
  type: string,
  details?: Record<string, any>,
): Promise<void> {
  const raw = await AsyncStorage.getItem(KEY);
  const current: HIPEvent[] = raw ? JSON.parse(raw) : [];
  const evt: HIPEvent = { id: genId(), hip, type, timestamp: Date.now(), details };
  current.push(evt);
  await AsyncStorage.setItem(KEY, JSON.stringify(current));
  // Also push a lightweight telemetry marker
  telemetry.add(`${hip}:${type}`, 0, 'hip-event');
}

export async function loadHIPEvents(): Promise<HIPEvent[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : [];
}

