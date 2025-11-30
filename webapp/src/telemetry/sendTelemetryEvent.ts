import { telemetry } from './recorder';

interface TelemetryPayload {
  latencyMs?: number;
  source?: string;
  timestamp?: number;
  [key: string]: unknown;
}

export async function sendTelemetryEvent(event: string, payload: TelemetryPayload = {}): Promise<void> {
  const { latencyMs, source, timestamp, ...details } = payload;
  const message = {
    type: 'telemetry',
    event,
    ...details,
    ...(typeof latencyMs === 'number' ? { latencyMs } : {}),
    ...(source ? { source } : {}),
  };
  if (timestamp !== undefined) {
    (message as any).timestamp = timestamp;
  }

  try {
    const bridge =
      (typeof window !== 'undefined' && (window as any).ReactNativeWebView) ||
      (globalThis as any).ReactNativeWebView;
    const postMessage =
      typeof bridge === 'function' ? bridge : (typeof bridge?.postMessage === 'function' ? bridge.postMessage : null);
    postMessage?.(JSON.stringify(message));
  } catch (err) {
    console.warn(`Failed to send '${event}' telemetry event:`, err);
  }

  try {
    await telemetry.add(event, {
      latencyMs: typeof latencyMs === 'number' ? latencyMs : undefined,
      source,
      timestamp,
      details,
    });
  } catch (err) {
    console.warn(`Failed to send '${event}' telemetry event:`, err);
  }
}
