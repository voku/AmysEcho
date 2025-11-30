const DEFAULT_SAMPLE_INTERVAL_MS = 2000;

const isDebugEnabled = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  return Boolean((window as any).__gestureDebug ?? (window as any).__DEBUG__ ?? false);
};

const lastLogTimes = new Map<string, number>();

type DebugLevel = 'log' | 'warn' | 'error';

interface DebugLogOptions {
  sampleIntervalMs?: number;
  level?: DebugLevel;
}

export function gestureDebugLog(
  category: string,
  message: string,
  payloadFactory?: () => unknown,
  options: DebugLogOptions = {},
): void {
  if (!isDebugEnabled()) {
    return;
  }

  const now = performance.now();
  const key = `${category}:${message}`;
  const sampleInterval = options.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS;
  const lastLogged = lastLogTimes.get(key) ?? 0;

  if (now - lastLogged < sampleInterval) {
    return;
  }

  lastLogTimes.set(key, now);

  const level: DebugLevel = options.level ?? 'log';
  const payload = payloadFactory ? payloadFactory() : undefined;
  const prefix = `[Gesture][${category || 'general'}] ${message}`;

  if (payload !== undefined) {
    console[level](prefix, payload);
  } else {
    console[level](prefix);
  }
}
