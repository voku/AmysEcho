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
  private workQueue: Promise<any>;

  constructor() {
    this.workQueue = (async () => {
      try {
        const raw = await AsyncStorage.getItem(this.KEY);
        if (raw) {
          try {
            this.buffer = JSON.parse(raw) as TelemetryEvent[];
          } catch (e) {
            console.warn('Failed to parse persisted telemetry events.', e);
          }
        }
      } catch (e) {
        console.warn('Failed to load telemetry events from storage.', e);
      }
    })();
  }

  private enqueue<T>(task: () => Promise<T> | T): Promise<T> {
    const result = this.workQueue.then(task);
    // Prevent unhandled rejections from breaking the queue
    this.workQueue = result.catch(() => {});
    return result;
  }

  add(event: string, latencyMs: number, source?: string): Promise<void> {
    return this.enqueue(async () => {
      this.buffer.push({ timestamp: Date.now(), latencyMs, event, source });
      if (this.buffer.length > this.MAX) {
        this.buffer.shift();
      }
      try {
        await AsyncStorage.setItem(this.KEY, JSON.stringify(this.buffer));
      } catch {
        // Best-effort persistence; ignore storage errors
      }
    });
  }

  dump(): Promise<TelemetryEvent[]> {
    return this.enqueue(async () => {
      const data = this.buffer;
      if (data.length === 0) {
        return [];
      }
      this.buffer = [];
      try {
        await AsyncStorage.setItem(this.KEY, '[]');
        return data;
      } catch (e) {
        console.warn('Failed to clear telemetry from storage', e);
        this.buffer = data.concat(this.buffer);
        return [];
      }
    });
  }
}

export const telemetry = new Telemetry();

