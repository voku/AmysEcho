import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TelemetryEvent {
  timestamp: number;
  latencyMs: number;
  event: string;
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
  private workQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.enqueue(async () => {
      try {
        const raw = await AsyncStorage.getItem(this.KEY);
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const sanitized = parsed
              .filter(this.isTelemetryEvent)
              .slice(-this.MAX) as TelemetryEvent[];
            this.buffer = sanitized;
          } else {
            console.warn('Persisted telemetry is not an array and will be ignored.');
          }
        } catch (e) {
          console.warn('Error parsing stored telemetry events.', e);
        }
      } catch (e) {
        console.warn('Error loading telemetry events from storage.', e);
      }
    });
  }

  private enqueue<T>(task: () => Promise<T> | T): Promise<T> {
    const run = this.workQueue.then(() => task());
    // Do not let rejections break the queue
    this.workQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private isTelemetryEvent(value: unknown): value is TelemetryEvent {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as any).timestamp === 'number' &&
      typeof (value as any).latencyMs === 'number' &&
      typeof (value as any).event === 'string'
    );
  }

  add(event: string, latencyMs: number, source?: string): Promise<void> {
    return this.enqueue(async () => {
      this.buffer.push({ timestamp: Date.now(), latencyMs, event, source });
      if (this.buffer.length > this.MAX) {
        this.buffer.shift();
      }
      // TODO: Batch persistence to reduce AsyncStorage writes under high event volume
      try {
        await AsyncStorage.setItem(this.KEY, JSON.stringify(this.buffer));
      } catch (e) {
        // Best-effort persistence; ignore storage errors
        console.warn('Failed to persist telemetry events.', e);
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
        console.warn('Error clearing stored telemetry events', e);
        this.buffer = data;
        return [];
      }
    });
  }
}

export const telemetry = new Telemetry();

