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
}

class Logger {
  private serviceName: string;
  private logLevel: LogLevel;

  constructor(serviceName: string = 'amys-echo-server') {
    this.serviceName = serviceName;
    this.logLevel = config.nodeEnv === 'development' ? LogLevel.DEBUG : LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  private formatLogEntry(level: LogLevel, message: string, data?: any, userId?: string): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
      service: this.serviceName,
      data,
      userId,
      requestId: this.generateRequestId(),
    };
  }

  private generateRequestId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private writeLog(entry: LogEntry): void {
    const output = config.nodeEnv === 'development'
      ? `${entry.timestamp} [${entry.level}] ${entry.service}: ${entry.message}`
      : JSON.stringify(entry);

    if (entry.level === 'ERROR') {
      console.error(output);
    } else if (entry.level === 'WARN') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  error(message: string, data?: any, userId?: string): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const entry = this.formatLogEntry(LogLevel.ERROR, message, data, userId);
      this.writeLog(entry);
    }
  }

  warn(message: string, data?: any, userId?: string): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const entry = this.formatLogEntry(LogLevel.WARN, message, data, userId);
      this.writeLog(entry);
    }
  }

  info(message: string, data?: any, userId?: string): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const entry = this.formatLogEntry(LogLevel.INFO, message, data, userId);
      this.writeLog(entry);
    }
  }

  debug(message: string, data?: any, userId?: string): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const entry = this.formatLogEntry(LogLevel.DEBUG, message, data, userId);
      this.writeLog(entry);
    }
  }
}

export const logger = new Logger();
export default logger;