import config from '../config/index.js';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  service: string;
  data?: any;
  userId?: string;
  requestId?: string;
  duration?: number;
  endpoint?: string;
  method?: string;
  statusCode?: number;
}

interface LogContext {
  userId?: string;
  requestId?: string;
  sessionId?: string;
  endpoint?: string;
  method?: string;
  duration?: number;
  statusCode?: number;
}

export class Logger {
  private serviceName: string;
  private logLevel: LogLevel;
  private context: LogContext = {};

  constructor(serviceName: string = 'amys-echo-server') {
    this.serviceName = serviceName;
    this.logLevel = config.nodeEnv === 'development' ? LogLevel.DEBUG : LogLevel.INFO;
  }

  setContext(context: Partial<LogContext>): void {
    this.context = { ...this.context, ...context };
  }

  clearContext(): void {
    this.context = {};
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  private formatLogEntry(level: LogLevel, message: string, data?: any, userId?: string): LogEntry {
    const ctx = { ...this.context };
    if (userId) ctx.userId = userId;

    return {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
      service: this.serviceName,
      data,
      ...ctx,
    };
  }

  private writeLog(entry: LogEntry): void {
    const output = config.nodeEnv === 'development'
      ? `${entry.timestamp} [${entry.level}] ${entry.service}: ${entry.message}${entry.duration ? ` (${entry.duration}ms)` : ''}`
      : JSON.stringify(entry);

    if (entry.level === 'ERROR') {
      console.error(output);
    } else if (entry.level === 'WARN') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  private log(level: LogLevel, message: string, data?: any, userId?: string): void {
    if (!this.shouldLog(level)) return;
    const entry = this.formatLogEntry(level, message, data, userId);
    this.writeLog(entry);
  }

  error(message: string, data?: any, userId?: string): void {
    this.log(LogLevel.ERROR, message, data, userId);
  }

  warn(message: string, data?: any, userId?: string): void {
    this.log(LogLevel.WARN, message, data, userId);
  }

  info(message: string, data?: any, userId?: string): void {
    this.log(LogLevel.INFO, message, data, userId);
  }

  debug(message: string, data?: any, userId?: string): void {
    this.log(LogLevel.DEBUG, message, data, userId);
  }

  // Convenience methods for common patterns
  apiRequest(method: string, endpoint: string, statusCode?: number, duration?: number, userId?: string): void {
    const message = `${method} ${endpoint}`;
    const data = statusCode ? { statusCode, duration } : { duration };
    const level = statusCode && statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO;

    this.log(level, message, data, userId);
  }

  databaseOperation(operation: string, table: string, duration?: number, userId?: string): void {
    const message = `DB ${operation} on ${table}`;
    this.debug(message, { duration }, userId);
  }

  gestureProcessing(gesture: string, confidence: number, duration?: number, userId?: string): void {
    const message = `Processed gesture: ${gesture}`;
    this.info(message, { confidence, duration }, userId);
  }

  trainingOperation(operation: string, modelId: string, duration?: number, userId?: string): void {
    const message = `Training ${operation} for model ${modelId}`;
    this.info(message, { duration }, userId);
  }

  modelOperation(operation: string, modelId: string, details?: any, userId?: string): void {
    const message = `Model ${operation}: ${modelId}`;
    this.info(message, details, userId);
  }

  recognitionResult(gesture: string, confidence: number, source: 'cloud' | 'local', duration?: number, userId?: string): void {
    const message = `Recognition result: ${gesture} (${source})`;
    this.info(message, { confidence, source, duration }, userId);
  }

  performanceMetric(name: string, value: number, unit: string = 'ms', userId?: string): void {
    this.debug(`Performance: ${name} = ${value}${unit}`, { name, value, unit }, userId);
  }

  // Enhanced error logging with context
  logErrorWithContext(
    message: string,
    error: Error | unknown,
    context?: Record<string, any>,
    userId?: string
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fullMessage = `${message}: ${errorMessage}`;

    this.error(fullMessage, {
      ...context,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    }, userId);
  }

  // Request lifecycle logging
  requestStart(method: string, url: string, userId?: string, requestId?: string): void {
    this.setContext({ method, endpoint: url, requestId });
    this.info(`${method} ${url} - Request started`, { method, url }, userId);
  }

  requestEnd(method: string, url: string, statusCode: number, duration: number, userId?: string): void {
    const level = statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO;
    const message = `${method} ${url} - Request completed`;

    this.log(level, message, { method, url, statusCode, duration }, userId);
    this.clearContext();
  }
}

export const logger = new Logger();
export default logger;
export type { LogContext };