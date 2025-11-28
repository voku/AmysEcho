import { LOG_LEVEL } from '../constants';

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

declare const __DEV__: boolean | undefined;
const isDev: boolean = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

const levelMap: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
};

interface LogContext {
  userId?: string;
  sessionId?: string;
  gesture?: string;
  component?: string;
  timestamp?: number;
}

class Logger {
  private level: LogLevel;
  private context: LogContext = {};

  constructor() {
    const defaultLevel = isDev ? LogLevel.DEBUG : LogLevel.INFO;
    this.level = levelMap[LOG_LEVEL] ?? defaultLevel;
  }

  setContext(context: Partial<LogContext>): void {
    this.context = { ...this.context, ...context };
  }

  clearContext(): void {
    this.context = {};
  }

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const ctx = context || this.context;
    const contextStr = Object.keys(ctx).length > 0
      ? ` [${Object.entries(ctx).map(([k, v]) => `${k}:${v}`).join(', ')}]`
      : '';

    return `[${timestamp}] [${level}]${contextStr} ${message}`;
  }

  debug(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log(this.formatMessage('DEBUG', message), ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(this.formatMessage('INFO', message), ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(this.formatMessage('WARN', message), ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(this.formatMessage('ERROR', message), ...args);
    }
  }

  // Convenience methods for common patterns
  gestureEvent(gesture: string, event: string, data?: any): void {
    this.info(`Gesture ${gesture}: ${event}`, data);
  }

  apiCall(endpoint: string, method: string, status?: number, duration?: number): void {
    const statusStr = status ? ` (${status})` : '';
    const durationStr = duration ? ` in ${duration}ms` : '';
    this.info(`API ${method} ${endpoint}${statusStr}${durationStr}`);
  }

  performanceMetric(name: string, value: number, details?: any): void {
    // Keep signature flexible: allow optional details object for richer logs
    if (details) {
      this.debug(`Performance: ${name} = ${value}ms`, details);
    } else {
      this.debug(`Performance: ${name} = ${value}ms`);
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

export const logger = new Logger();
export default logger;
export { LogLevel };
export type { LogContext };
