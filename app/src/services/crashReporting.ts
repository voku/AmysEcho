import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_TOKEN, API_URL } from '../constants';
import { logger } from '../utils/logger';

const STORAGE_KEY = 'crashReportsQueue';
const CRASH_ENDPOINT = `${API_URL}/api/crash-reports`;

import { CrashReport } from '../types';

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
      stack: e.stack,
      timestamp: Date.now(),
      extra,
    };
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
    // JS exceptions via React Native's ErrorUtils if available
    const g: any = global as any;
    const ErrorUtilsObj = g.ErrorUtils;
    if (ErrorUtilsObj && typeof ErrorUtilsObj.getGlobalHandler === 'function') {
      const prev = ErrorUtilsObj.getGlobalHandler();
      ErrorUtilsObj.setGlobalHandler((error: any, isFatal?: boolean) => {
        enqueueCrashReport(error, { isFatal });
        if (typeof prev === 'function') prev(error, isFatal);
      });
    }

    // Unhandled promise rejections
    if (typeof g.addEventListener === 'function') {
      // Not standard in RN; fallback to node-like handler below
    }
    if (typeof g.onunhandledrejection === 'undefined') {
      g.onunhandledrejection = (event: any) => {
        const reason = event && event.reason ? event.reason : event;
        enqueueCrashReport(reason, { unhandledRejection: true });
      };
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

