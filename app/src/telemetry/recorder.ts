
import { TelemetryEvent } from '../types';

class Telemetry {
  private buffer: TelemetryEvent[] = [];
  private readonly MAX = 500;

  add(event: string, latencyMs: number, source?: string) {
    this.buffer.push({ timestamp: Date.now(), latencyMs, event, source });
    if (this.buffer.length > this.MAX) {
      this.buffer.shift();
    }
  }

  dump() {
    const data = this.buffer;
    this.buffer = [];
    return data;
  }
}

export const telemetry = new Telemetry();

