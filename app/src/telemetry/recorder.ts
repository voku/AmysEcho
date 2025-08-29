import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TelemetryEvent {
  timestamp: number;
  latencyMs: number;
  event?: string;
  source?: string;
}

/**
 * Lightweight telemetry recorder that buffers events in memory and persists
 * them to AsyncStorage so they survive app restarts. The buffer is capped at a
 * small size to avoid unbounded growth.
 */
export class Telemetry {
  private buffer: TelemetryEvent[] = [];
  private readonly MAX = 500;
  private readonly KEY = 'telemetryEvents';
  private ready: Promise<void>;

  constructor() {
    this.ready = AsyncStorage.getItem(this.KEY)
      .then((raw) => {
        if (raw) {
          try {
            this.buffer = JSON.parse(raw) as TelemetryEvent[];
          } catch {}
        }
      })
      .catch(() => {});
  }

  async add(event: string, latencyMs: number, source?: string) {
    await this.ready;
    this.buffer.push({ timestamp: Date.now(), latencyMs, event, source });
    if (this.buffer.length > this.MAX) {
      this.buffer.shift();
    }
    try {
      await AsyncStorage.setItem(this.KEY, JSON.stringify(this.buffer));
    } catch {
      // Best-effort persistence; ignore storage errors
    }
  }

  async dump(): Promise<TelemetryEvent[]> {
    await this.ready;
    const data = this.buffer;
    this.buffer = [];
    try {
      await AsyncStorage.removeItem(this.KEY);
    } catch {
      // ignore storage errors
    }
    return data;
  }
}

export const telemetry = new Telemetry();

