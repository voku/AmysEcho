enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

declare const __DEV__: boolean | undefined;
const isDev: boolean = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

class Logger {
  private level: LogLevel = isDev ? LogLevel.DEBUG : LogLevel.INFO;

  debug(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

export const logger = new Logger();
export { LogLevel };
