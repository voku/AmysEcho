import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_TOKEN, API_URL } from '../constants';
import { logger } from '../utils/logger';

const STORAGE_KEY = 'crashReportsQueue';
const CRASH_ENDPOINT = `${API_URL}/api/crash-reports`;

export interface CrashReport {
  id: string;
  name: string;
  message: string;
  stack?: string;
  timestamp: number;
  extra?: Record<string, unknown>;
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export async function enqueueCrashReport(error: unknown, extra?: Record<string, unknown>): Promise<void> {
  try {
    const e = normalizeError(error);
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const queue: CrashReport[] = raw ? JSON.parse(raw) : [];
    const report: CrashReport = {
      id: genId(),
      name: e.name || 'Error',
      message: e.message || String(error),
      timestamp: Date.now(),
    };

    if (e.stack) {
      report.stack = e.stack;
    }
    if (extra) {
      report.extra = extra;
    }
    queue.push(report);
    // Keep queue bounded to avoid unbounded growth
    const bounded = queue.slice(-100);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(bounded));
  } catch (err) {
    // Best effort: never throw from crash handler
    logger.warn('Failed to enqueue crash report', err as any);
  }
}

export async function flushCrashReports(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const queue: CrashReport[] = raw ? JSON.parse(raw) : [];
    if (!queue.length) return 0;
    const res = await fetch(CRASH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify(queue),
    });
    if (!res.ok) throw new Error(`Crash upload failed: ${res.status}`);
    await AsyncStorage.removeItem(STORAGE_KEY);
    return queue.length;
  } catch (err) {
    logger.warn('Crash report upload failed', err as any);
    return 0;
  }
}

function normalizeError(err: unknown): { name?: string; message?: string; stack?: string } {
  if (err && typeof err === 'object') {
    const anyErr = err as any;
    return {
      name: anyErr.name,
      message: anyErr.message,
      stack: anyErr.stack,
    };
  }
  return { message: String(err) };
}

/**
 * Install global crash handlers for JS exceptions and unhandled rejections.
 * Safe to call multiple times.
 */
export function initCrashReporting(): void {
  try {
    type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;
    const g = globalThis as any;
    const WRAP_FLAG = '__amysEchoCrashWrapped__';

    // JS exceptions via React Native's ErrorUtils
    const errorUtils = g.ErrorUtils;
    if (errorUtils?.getGlobalHandler && errorUtils?.setGlobalHandler) {
      const prevErrorHandler: GlobalErrorHandler = errorUtils.getGlobalHandler();
      if (!(prevErrorHandler as any)?.[WRAP_FLAG]) {
        const wrapped: GlobalErrorHandler = (error, isFatal) => {
          void enqueueCrashReport(error, { isFatal });
          try {
            prevErrorHandler?.(error, isFatal);
          } catch {}
        };
        (wrapped as any)[WRAP_FLAG] = true;
        errorUtils.setGlobalHandler(wrapped);
      }
    }

    // Unhandled promise rejections
    const prevRejectionHandler = g.onunhandledrejection as ((event: any) => void) | undefined;
    if (!(prevRejectionHandler as any)?.[WRAP_FLAG]) {
      const wrappedRejection = (event: any) => {
        const reason = event?.reason ?? event;
        void enqueueCrashReport(reason, { unhandledRejection: true });
        try {
          prevRejectionHandler?.(event);
        } catch {}
      };
      (wrappedRejection as any)[WRAP_FLAG] = true;
      g.onunhandledrejection = wrappedRejection;
    }
  } catch (err) {
    logger.warn('initCrashReporting failed', err as any);
  }
}

// Helper to be called on app start to flush any pending crashes
export async function onAppStartCrashFlush(): Promise<void> {
  try {
    const uploaded = await flushCrashReports();
    if (uploaded > 0) {
      logger.info(`Uploaded ${uploaded} crash report(s)`);
    }
  } catch {}
}

