export interface TelemetryEvent {
  timestamp: number;
  event: string;
  latencyMs?: number;
  source?: string;
  details?: Record<string, unknown>;
}

interface EnqueueOptions {
  latencyMs?: number;
  source?: string;
  details?: Record<string, unknown>;
  timestamp?: number;
}

export class TelemetryRecorder {
  private buffer: TelemetryEvent[] = [];
  private readonly MAX = 500;
  private readonly KEY = 'telemetryEvents';
  private workQueue: Promise<void> = Promise.resolve();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly PERSIST_DELAY_MS = 1000;
  private readonly readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.enqueue(async () => {
      try {
        const raw = localStorage.getItem(this.KEY);
        if (!raw) return;
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
        console.warn('Error loading telemetry events from storage.', e);
      }
    });
  }

  private enqueue<T>(task: () => Promise<T> | T): Promise<T> {
    const run = this.workQueue.then(() => task());
    this.workQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private isTelemetryEvent(value: unknown): value is TelemetryEvent {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as any).timestamp === 'number' &&
      typeof (value as any).event === 'string'
    );
  }

  async add(event: string, options: EnqueueOptions = {}): Promise<void> {
    return this.enqueue(async () => {
      const entry: TelemetryEvent = {
        timestamp: options.timestamp ?? Date.now(),
        event,
      };
      if (options.latencyMs !== undefined) {
        entry.latencyMs = options.latencyMs;
      }
      if (options.source) {
        entry.source = options.source;
      }
      if (options.details && Object.keys(options.details).length > 0) {
        entry.details = options.details;
      }

      this.buffer.push(entry);
      if (this.buffer.length > this.MAX) {
        this.buffer = this.buffer.slice(-this.MAX);
      }
      this.schedulePersist();
    });
  }

  async dump(): Promise<TelemetryEvent[]> {
    return this.enqueue(async () => {
      if (this.persistTimer) {
        clearTimeout(this.persistTimer);
        this.persistTimer = null;
        try {
          localStorage.setItem(this.KEY, JSON.stringify(this.buffer));
        } catch (e) {
          console.warn(
            'Failed to persist telemetry before dump. Aborting dump to prevent data loss.',
            e,
          );
          return [];
        }
      }

      if (this.buffer.length === 0) {
        return [];
      }

      const data = this.buffer;
      this.buffer = [];
      try {
        localStorage.setItem(this.KEY, '[]');
        return data;
      } catch (e) {
        console.warn('Error clearing stored telemetry events', e);
        this.buffer = data;
        return [];
      }
    });
  }

  async whenReady(): Promise<void> {
    return this.readyPromise;
  }

  private schedulePersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.enqueue(async () => {
        try {
          localStorage.setItem(this.KEY, JSON.stringify(this.buffer));
        } catch (e) {
          console.warn('Failed to persist telemetry events.', e);
        }
      });
    }, this.PERSIST_DELAY_MS);
  }
}

export const telemetry = new TelemetryRecorder();
