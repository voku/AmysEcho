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
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly PERSIST_DELAY_MS = 1000;

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
      const entry: TelemetryEvent = { timestamp: Date.now(), latencyMs, event };
      if (source) {
        entry.source = source;
      }
      this.buffer.push(entry);
      if (this.buffer.length > this.MAX) {
        this.buffer.shift();
      }
      this.schedulePersist();
    });
  }

  dump(): Promise<TelemetryEvent[]> {
    return this.enqueue(async () => {
      if (this.persistTimer) {
        clearTimeout(this.persistTimer);
        this.persistTimer = null;
        try {
          await AsyncStorage.setItem(this.KEY, JSON.stringify(this.buffer));
        } catch (e) {
          console.warn(
            'Failed to persist telemetry before dump. Aborting dump to prevent data loss.',
            e,
          );
          return [];
        }
      }
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

  private schedulePersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.enqueue(async () => {
        try {
          await AsyncStorage.setItem(this.KEY, JSON.stringify(this.buffer));
        } catch (e) {
          // Best-effort persistence; ignore storage errors
          console.warn('Failed to persist telemetry events.', e);
        }
      });
    }, this.PERSIST_DELAY_MS);
  }
}

export const telemetry = new Telemetry();

