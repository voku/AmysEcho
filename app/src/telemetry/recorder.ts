
export interface TelemetryEvent {
    timestamp: number;
    latencyMs: number;
  }
  
  class Telemetry {
    private buffer: TelemetryEvent[] = [];
    private readonly MAX = 500;
  
    add(latencyMs: number) {
      this.buffer.push({ timestamp: Date.now(), latencyMs });
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

