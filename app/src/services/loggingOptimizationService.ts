import { logger } from '../utils/logger';
import { performanceOptimizationService } from './performanceOptimizationService';

// Logging levels
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

// Logging categories for fine-grained control
export enum LogCategory {
  PERFORMANCE = 'performance',
  GESTURE_RECOGNITION = 'gesture_recognition',
  DATABASE = 'database',
  NETWORK = 'network',
  UI = 'ui',
  ANALYTICS = 'analytics',
  GENERAL = 'general'
}

// Logging optimization service
export class LoggingOptimizationService {
  private static instance: LoggingOptimizationService;
  private currentLogLevel = LogLevel.INFO;
  private categoryLevels = new Map<LogCategory, LogLevel>();
  private logQueue: Array<{ level: LogLevel; category: LogCategory; message: string; data?: any }> = [];
  private batchSize = 10;
  private batchTimer: NodeJS.Timeout | null = null;
  private isProduction = __DEV__ !== true;

  private constructor() {
    this.initializeLoggingOptimization();
  }

  public static getInstance(): LoggingOptimizationService {
    if (!LoggingOptimizationService.instance) {
      LoggingOptimizationService.instance = new LoggingOptimizationService();
    }
    return LoggingOptimizationService.instance;
  }

  // Initialize logging optimization
  private initializeLoggingOptimization(): void {
    // Set default log levels based on environment
    this.setDefaultLogLevels();

    // Start batch processing for performance
    this.startBatchProcessing();

    // Adjust logging based on performance
    this.setupPerformanceBasedLogging();
  }

  // Set default log levels
  private setDefaultLogLevels(): void {
    if (this.isProduction) {
      // Production: more restrictive logging
      this.currentLogLevel = LogLevel.WARN;
      this.categoryLevels.set(LogCategory.PERFORMANCE, LogLevel.INFO);
      this.categoryLevels.set(LogCategory.GESTURE_RECOGNITION, LogLevel.WARN);
      this.categoryLevels.set(LogCategory.DATABASE, LogLevel.ERROR);
      this.categoryLevels.set(LogCategory.NETWORK, LogLevel.WARN);
      this.categoryLevels.set(LogCategory.UI, LogLevel.ERROR);
      this.categoryLevels.set(LogCategory.ANALYTICS, LogLevel.INFO);
      this.categoryLevels.set(LogCategory.GENERAL, LogLevel.WARN);
    } else {
      // Development: more verbose logging
      this.currentLogLevel = LogLevel.DEBUG;
      this.categoryLevels.set(LogCategory.PERFORMANCE, LogLevel.DEBUG);
      this.categoryLevels.set(LogCategory.GESTURE_RECOGNITION, LogLevel.DEBUG);
      this.categoryLevels.set(LogCategory.DATABASE, LogLevel.INFO);
      this.categoryLevels.set(LogCategory.NETWORK, LogLevel.INFO);
      this.categoryLevels.set(LogCategory.UI, LogLevel.DEBUG);
      this.categoryLevels.set(LogCategory.ANALYTICS, LogLevel.DEBUG);
      this.categoryLevels.set(LogCategory.GENERAL, LogLevel.INFO);
    }
  }

  // Setup performance-based logging adjustments
  private setupPerformanceBasedLogging(): void {
    // Adjust logging when performance is poor
    setInterval(() => {
      const metrics = performanceOptimizationService.getMetrics();

      // Reduce logging if memory usage is high
      if (metrics.memoryUsage > 80) {
        this.adjustLogLevelForPerformance(LogLevel.WARN);
      }
      // Reduce logging if CPU usage is high (simplified)
      else if (metrics.cpuUsage > 80) {
        this.adjustLogLevelForPerformance(LogLevel.ERROR);
      }
      // Restore normal logging when performance improves
      else {
        this.restoreNormalLogLevel();
      }
    }, 30000); // Check every 30 seconds
  }

  // Adjust log level for performance
  private adjustLogLevelForPerformance(level: LogLevel): void {
    if (this.currentLogLevel > level) {
      this.currentLogLevel = level;
      logger.info(`Reduced log level to ${LogLevel[level]} due to performance constraints`);
    }
  }

  // Restore normal log level
  private restoreNormalLogLevel(): void {
    const normalLevel = this.isProduction ? LogLevel.WARN : LogLevel.DEBUG;
    if (this.currentLogLevel < normalLevel) {
      this.currentLogLevel = normalLevel;
      logger.info(`Restored normal log level to ${LogLevel[normalLevel]}`);
    }
  }

  // Start batch processing
  private startBatchProcessing(): void {
    this.batchTimer = setInterval(() => {
      this.processLogBatch();
    }, 5000); // Process every 5 seconds
  }

  // Process batched logs
  private processLogBatch(): void {
    if (this.logQueue.length === 0) return;

    // Group logs by level and category
    const groupedLogs = this.groupLogsByLevelAndCategory();

    // Process each group
    Object.keys(groupedLogs).forEach(key => {
      const logs = groupedLogs[key];
      if (logs.length > 0) {
        this.processLogGroup(logs);
      }
    });

    // Clear processed logs
    this.logQueue = [];
  }

  // Group logs by level and category
  private groupLogsByLevelAndCategory(): Record<string, typeof this.logQueue> {
    return this.logQueue.reduce((groups, log) => {
      const key = `${log.level}_${log.category}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(log);
      return groups;
    }, {} as Record<string, typeof this.logQueue>);
  }

  // Process a group of logs
  private processLogGroup(logs: typeof this.logQueue): void {
    if (logs.length === 1) {
      // Single log - process normally
      this.processSingleLog(logs[0]);
    } else {
      // Multiple logs - batch them
      const sampleLog = logs[0];
      const count = logs.length;

      // Log a summary for batched logs
      const summaryMessage = `[BATCH] ${count} ${LogLevel[sampleLog.level]} logs in ${sampleLog.category}`;

      this.logMessage(LogLevel.INFO, LogCategory.PERFORMANCE, summaryMessage, {
        totalLogs: count,
        sampleMessage: logs[0].message,
        category: sampleLog.category
      });

      // Only log first few individual logs if in debug mode
      if (!this.isProduction && logs.length <= 3) {
        logs.forEach(log => this.processSingleLog(log));
      }
    }
  }

  // Process a single log
  private processSingleLog(log: typeof this.logQueue[0]): void {
    this.logMessage(log.level, log.category, log.message, log.data);
  }

  // Log a message
  public log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    data?: any
  ): void {
    // Check if this log should be processed
    if (!this.shouldLog(level, category)) {
      return;
    }

    // Add to queue for batch processing
    this.logQueue.push({ level, category, message, data });

    // Process immediately if high priority
    if (level <= LogLevel.ERROR || this.logQueue.length >= this.batchSize) {
      this.processLogBatch();
    }
  }

  // Check if a log should be processed
  private shouldLog(level: LogLevel, category: LogCategory): boolean {
    // Check global log level
    if (level > this.currentLogLevel) {
      return false;
    }

    // Check category-specific log level
    const categoryLevel = this.categoryLevels.get(category);
    if (categoryLevel !== undefined && level > categoryLevel) {
      return false;
    }

    return true;
  }

  // Log message using the logger
  private logMessage(level: LogLevel, category: LogCategory, message: string, data?: any): void {
    const fullMessage = `[${category}] ${message}`;

    switch (level) {
      case LogLevel.ERROR:
        logger.error(fullMessage, data);
        break;
      case LogLevel.WARN:
        logger.warn(fullMessage, data);
        break;
      case LogLevel.INFO:
        logger.info(fullMessage, data);
        break;
      case LogLevel.DEBUG:
        logger.debug(fullMessage, data);
        break;
      case LogLevel.TRACE:
        logger.debug(fullMessage, data); // Use debug for trace level
        break;
    }
  }

  // Convenience methods for different log levels
  public error(category: LogCategory, message: string, data?: any): void {
    this.log(LogLevel.ERROR, category, message, data);
  }

  public warn(category: LogCategory, message: string, data?: any): void {
    this.log(LogLevel.WARN, category, message, data);
  }

  public info(category: LogCategory, message: string, data?: any): void {
    this.log(LogLevel.INFO, category, message, data);
  }

  public debug(category: LogCategory, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, category, message, data);
  }

  public trace(category: LogCategory, message: string, data?: any): void {
    this.log(LogLevel.TRACE, category, message, data);
  }

  // Set global log level
  public setLogLevel(level: LogLevel): void {
    this.currentLogLevel = level;
    logger.info(`Global log level set to ${LogLevel[level]}`);
  }

  // Set category-specific log level
  public setCategoryLogLevel(category: LogCategory, level: LogLevel): void {
    this.categoryLevels.set(category, level);
    logger.info(`Log level for ${category} set to ${LogLevel[level]}`);
  }

  // Get current log configuration
  public getLogConfiguration(): {
    globalLevel: LogLevel;
    categoryLevels: Record<string, LogLevel>;
    isProduction: boolean;
    queueSize: number;
  } {
    const categoryLevels: Record<string, LogLevel> = {};
    this.categoryLevels.forEach((level, category) => {
      categoryLevels[category] = level;
    });

    return {
      globalLevel: this.currentLogLevel,
      categoryLevels,
      isProduction: this.isProduction,
      queueSize: this.logQueue.length
    };
  }

  // Enable/disable production mode
  public setProductionMode(isProduction: boolean): void {
    this.isProduction = isProduction;
    this.setDefaultLogLevels();
    logger.info(`Production mode ${isProduction ? 'enabled' : 'disabled'}`);
  }

  // Set batch size
  public setBatchSize(size: number): void {
    this.batchSize = Math.max(1, size);
    logger.info(`Log batch size set to ${this.batchSize}`);
  }

  // Get logging statistics
  public getLoggingStats(): {
    queueSize: number;
    processedLogs: number;
    batchSize: number;
    isProduction: boolean;
  } {
    return {
      queueSize: this.logQueue.length,
      processedLogs: 0, // Would need to track this
      batchSize: this.batchSize,
      isProduction: this.isProduction
    };
  }

  // Flush all queued logs
  public flushLogs(): void {
    this.processLogBatch();
    logger.info('Flushed all queued logs');
  }

  // Cleanup
  public cleanup(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }

    this.logQueue = [];
    logger.info('Logging optimization service cleaned up');
  }
}

// Export singleton instance
export const loggingOptimizationService = LoggingOptimizationService.getInstance();