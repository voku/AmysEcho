import { telemetry } from './recorder';

interface TelemetryPayload {
  latencyMs?: number;
  source?: string;
  timestamp?: number;
  [key: string]: unknown;
}

interface TelemetryMessage {
  type: 'telemetry';
  event: string;
  latencyMs?: number;
  source?: string;
  timestamp?: number;
  [key: string]: unknown;
}

export async function sendTelemetryEvent(event: string, payload: TelemetryPayload = {}): Promise<void> {
  const { latencyMs, source, timestamp, ...details } = payload;
  const message: TelemetryMessage = {
    type: 'telemetry',
    event,
    ...details,
    ...(typeof latencyMs === 'number' ? { latencyMs } : {}),
    ...(source ? { source } : {}),
    ...(timestamp !== undefined ? { timestamp } : {}),
  };

  try {
    const bridge =
      (typeof window !== 'undefined' && (window as any).ReactNativeWebView) ||
      (globalThis as any).ReactNativeWebView;
    if (typeof bridge === 'function') {
      bridge(JSON.stringify(message));
    } else if (typeof bridge?.postMessage === 'function') {
      bridge.postMessage(JSON.stringify(message));
    }
  } catch (err) {
    console.warn(`Failed to send '${event}' telemetry event:`, err);
  }

  try {
    const options: Parameters<typeof telemetry.add>[1] = { details };
    if (typeof latencyMs === 'number') {
      options.latencyMs = latencyMs;
    }
    if (source !== undefined) {
      options.source = source;
    }
    if (timestamp !== undefined) {
      options.timestamp = timestamp;
    }
    await telemetry.add(event, options);
  } catch (err) {
    console.warn(`Failed to send '${event}' telemetry event:`, err);
  }
}
