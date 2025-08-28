export interface TelemetryEvent {
  timestamp: number;
  latencyMs: number;
  event?: string;
  source?: string;
}