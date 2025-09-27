import { logger } from '../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { batteryOptimizationService } from './batteryOptimizationService';

// Performance monitoring interfaces
export interface PerformanceMetrics {
  memoryUsage: number;
  cpuUsage: number;
  batteryLevel: number;
  frameRate: number;
  webviewMessageCount: number;
  gestureProcessingTime: number;
  lastUpdated: number;
}

export interface BatteryInfo {
  level: number;
  isLowPowerMode: boolean;
  isCharging: boolean;
}

export interface MemoryInfo {
  used: number;
  available: number;
  total: number;
}

export interface WebViewMessageBatch {
  messages: any[];
  timestamp: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

// Performance optimization service
export class PerformanceOptimizationService {
  private static instance: PerformanceOptimizationService;
  private metrics: PerformanceMetrics;
  private messageBatch: WebViewMessageBatch;
  private batchTimer: NodeJS.Timeout | null = null;
  private memoryCleanupTimer: NodeJS.Timeout | null = null;
  private batteryCheckTimer: NodeJS.Timeout | null = null;
  private isLowPowerMode = false;
  private webviewRefs: Set<any> = new Set();

  private constructor() {
    this.metrics = {
      memoryUsage: 0,
      cpuUsage: 0,
      batteryLevel: 100,
      frameRate: 30,
      webviewMessageCount: 0,
      gestureProcessingTime: 0,
      lastUpdated: Date.now()
    };

    this.messageBatch = {
      messages: [],
      timestamp: Date.now(),
      priority: 'medium'
    };

    this.initializePerformanceMonitoring();
    this.registerBatteryCallback();
  }

  // Register callback for battery optimization service to avoid circular dependency
  private registerBatteryCallback(): void {
    if (typeof window !== 'undefined') {
      (window as any).performanceOptimizationCallback = (data: any) => {
        if (data.action === 'enableBatteryOptimizations') {
          this.updateMetrics({
            frameRate: data.frameRate,
            batteryLevel: data.batteryLevel,
          });
        } else if (data.action === 'disableBatteryOptimizations') {
          this.updateMetrics({
            frameRate: data.frameRate,
            batteryLevel: data.batteryLevel,
          });
        }
      };
    }
  }

  public static getInstance(): PerformanceOptimizationService {
    if (!PerformanceOptimizationService.instance) {
      PerformanceOptimizationService.instance = new PerformanceOptimizationService();
    }
    return PerformanceOptimizationService.instance;
  }

  // Initialize performance monitoring
  private initializePerformanceMonitoring(): void {
    // Start memory cleanup timer (every 30 seconds)
    this.memoryCleanupTimer = setInterval(() => {
      this.performMemoryCleanup();
    }, 30000);

    // Start battery monitoring (every 60 seconds)
    this.batteryCheckTimer = setInterval(() => {
      this.checkBatteryStatus();
    }, 60000);

    // Start message batch processing (every 100ms)
    this.batchTimer = setInterval(() => {
      this.processMessageBatch();
    }, 100);
  }

  // Memory management optimization
  private async performMemoryCleanup(): Promise<void> {
    try {
      // Force garbage collection if available (development only)
      if (__DEV__ && global.gc) {
        global.gc();
      }

      // Clear cached data older than 1 hour
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      await this.clearOldCacheEntries(oneHourAgo);

      // Optimize WebView memory usage
      this.optimizeWebViewMemory();

      // Update memory metrics
      await this.updateMemoryMetrics();

      logger.debug('Memory cleanup completed');
    } catch (error) {
      logger.warn('Memory cleanup failed', error);
    }
  }

  // Clear old cache entries
  private async clearOldCacheEntries(olderThan: number): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key =>
        key.startsWith('cache_') ||
        key.startsWith('gesture_') ||
        key.startsWith('temp_')
      );

      for (const key of cacheKeys) {
        try {
          const value = await AsyncStorage.getItem(key);
          if (value) {
            const parsed = JSON.parse(value);
            if (parsed.timestamp && parsed.timestamp < olderThan) {
              await AsyncStorage.removeItem(key);
            }
          }
        } catch (_error) {
          // Remove corrupted entries
          await AsyncStorage.removeItem(key);
        }
      }
    } catch (error) {
      logger.warn('Failed to clear old cache entries', error);
    }
  }

  // Optimize WebView memory usage
  private optimizeWebViewMemory(): void {
    this.webviewRefs.forEach(webview => {
      try {
        if (webview && webview.injectJavaScript) {
          // Inject memory optimization script
          webview.injectJavaScript(`
            if (window.__optimizeMemory) {
              window.__optimizeMemory();
            }
            // Clear unused gesture data
            if (window.__clearGestureCache) {
              window.__clearGestureCache();
            }
          `);
        }
      } catch (error) {
        logger.warn('Failed to optimize WebView memory', error);
      }
    });
  }

  // Update memory metrics
  private async updateMemoryMetrics(): Promise<void> {
    try {
      // Get memory info (limited on mobile)
      const memoryInfo = await this.getMemoryInfo();
      this.metrics.memoryUsage = memoryInfo.used;
      this.metrics.lastUpdated = Date.now();
    } catch (error) {
      logger.warn('Failed to update memory metrics', error);
    }
  }

  // Get memory information
  private async getMemoryInfo(): Promise<MemoryInfo> {
    // On React Native, memory info is limited
    // This is a placeholder for future memory monitoring
    return {
      used: 0, // Would need native module for actual memory info
      available: 0,
      total: 0
    };
  }

  // Battery status monitoring
  private async checkBatteryStatus(): Promise<void> {
    try {
      const batteryInfo = batteryOptimizationService.getBatteryStatus();

      this.metrics.batteryLevel = batteryInfo.level;
      this.isLowPowerMode = batteryInfo.isLowPowerMode;

      // Adjust performance based on battery level
      if (this.isLowPowerMode) {
        this.enableLowPowerMode();
      } else {
        this.disableLowPowerMode();
      }
    } catch (error) {
      logger.warn('Failed to check battery status', error);
    }
  }

  // Enable low power mode optimizations
  private enableLowPowerMode(): void {
    // Get battery-optimized parameters (no emergency bypass for general optimizations)
    const batteryParams = batteryOptimizationService.getBatteryOptimizedParams(false);

    // Apply battery optimizations
    this.metrics.frameRate = batteryParams.frameRate;

    // Adjust batch processing based on battery level
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      // Increase batch interval in low power mode
      this.batchTimer = setInterval(() => {
        this.processMessageBatch();
      }, batteryParams.telemetryInterval / 10); // Process batches more frequently than telemetry
    }

    logger.info('Low power mode enabled with battery optimizations', batteryParams);
  }

  // Disable low power mode
  private disableLowPowerMode(): void {
    // Restore normal parameters
    this.metrics.frameRate = 30;

    // Restore normal batch processing
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = setInterval(() => {
        this.processMessageBatch();
      }, 100); // Normal 100ms interval
    }

    logger.info('Low power mode disabled');
  }

  // WebView message batching
  public addWebViewMessage(message: any, priority: 'low' | 'medium' | 'high' | 'critical' = 'medium'): void {
    // Check if this is an emergency gesture that should bypass battery optimizations
    const isEmergencyGesture = this.isEmergencyGestureMessage(message);

    this.messageBatch.messages.push({
      ...message,
      priority,
      timestamp: Date.now(),
      isEmergencyGesture
    });

    this.metrics.webviewMessageCount++;

    // Process critical messages immediately, or emergency gestures in low power mode
    if (priority === 'critical' || (isEmergencyGesture && this.isLowPowerMode)) {
      this.processMessageBatch();
    } else if (priority === 'high') {
      this.processMessageBatch();
    }
  }

  // Process batched messages
  private processMessageBatch(): void {
    if (this.messageBatch.messages.length === 0) return;

    // Separate emergency gestures from regular messages
    const emergencyMessages = this.messageBatch.messages.filter(m => m.isEmergencyGesture);
    const regularMessages = this.messageBatch.messages.filter(m => !m.isEmergencyGesture);

    // Process emergency messages immediately with full performance
    if (emergencyMessages.length > 0) {
      logger.info(`Processing ${emergencyMessages.length} emergency messages with full performance`);
      this.sendMessagesToWebViews(emergencyMessages, true); // true = emergency mode
    }

    // Group regular messages by priority
    const highPriority = regularMessages.filter(m => m.priority === 'high' || m.priority === 'critical');
    const mediumPriority = regularMessages.filter(m => m.priority === 'medium');
    const lowPriority = regularMessages.filter(m => m.priority === 'low');

    // Process high priority messages first
    if (highPriority.length > 0) {
      this.sendMessagesToWebViews(highPriority);
    }

    // Process medium priority messages
    if (mediumPriority.length > 0 && !this.isLowPowerMode) {
      this.sendMessagesToWebViews(mediumPriority);
    }

    // Process low priority messages only when not in low power mode
    if (lowPriority.length > 0 && !this.isLowPowerMode) {
      this.sendMessagesToWebViews(lowPriority);
    }

    // Clear processed messages
    this.messageBatch.messages = [];
    this.messageBatch.timestamp = Date.now();
  }

  // Check if message contains emergency gesture
  private isEmergencyGestureMessage(message: any): boolean {
    if (!message || typeof message !== 'object') return false;

    // Check various message formats for emergency gestures
    const emergencyKeywords = ['hilfe', 'help', 'emergency', 'stop', 'danger', 'notfall', 'gefahr'];

    // Check gesture field
    if (message.gesture && typeof message.gesture === 'string') {
      if (emergencyKeywords.some(keyword => message.gesture.toLowerCase().includes(keyword))) {
        return true;
      }
    }

    // Check message content
    if (message.message && typeof message.message === 'string') {
      if (emergencyKeywords.some(keyword => message.message.toLowerCase().includes(keyword))) {
        return true;
      }
    }

    // Check for emergency flag
    if (message.isEmergency === true || message.emergency === true) {
      return true;
    }

    return false;
  }

  // Send messages to WebViews with optimization
  private sendMessagesToWebViews(messages: any[], isEmergencyMode: boolean = false): void {
    if (messages.length === 0) return;

    // Group messages by type for better processing
    const groupedMessages = this.groupMessagesByType(messages);

    this.webviewRefs.forEach(webview => {
      try {
        if (webview && webview.injectJavaScript) {
          // Create optimized batch script
          const batchScript = this.createOptimizedBatchScript(groupedMessages, isEmergencyMode);
          webview.injectJavaScript(batchScript);
        }
      } catch (error) {
        logger.warn('Failed to send batched messages to WebView', error);
      }
    });
  }

  // Group messages by type for optimization
  private groupMessagesByType(messages: any[]): Record<string, any[]> {
    return messages.reduce((groups, message) => {
      const type = message.type || 'unknown';
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(message);
      return groups;
    }, {} as Record<string, any[]>);
  }

  // Create optimized batch script
  private createOptimizedBatchScript(groupedMessages: Record<string, any[]>, isEmergencyMode: boolean = false): string {
    const scripts: string[] = [];

    // In emergency mode, prioritize gesture messages and disable batching optimizations
    if (isEmergencyMode) {
      // Handle gesture messages first and individually for immediate processing
      const emergencyGestures = groupedMessages['gesture'] ?? [];
      emergencyGestures.forEach(msg => {
          scripts.push(`window.__handleGesture && window.__handleGesture(${JSON.stringify(msg)});`);
      });

      // Handle other emergency messages
      Object.keys(groupedMessages).forEach(type => {
        if (type !== 'gesture') {
          const messages = groupedMessages[type] ?? [];
          messages.forEach(msg => {
            scripts.push(`window.__handleMessage && window.__handleMessage(${JSON.stringify(msg)});`);
          });
        }
      });

      return scripts.join('\n');
    }

    // Normal batching for non-emergency messages
    // Handle telemetry messages specially (most common)
    const telemetryMessages = groupedMessages['telemetry'] ?? [];
    if (telemetryMessages.length > 0) {
      const telemetryBatch = telemetryMessages
        .map(msg =>
          `window.__handleTelemetry && window.__handleTelemetry(${JSON.stringify(msg.data)});`
        )
        .join('\n');
      scripts.push(telemetryBatch);
    }

    // Handle gesture messages
    const gestureMessages = groupedMessages['gesture'] ?? [];
    if (gestureMessages.length > 0) {
      const gestureBatch = gestureMessages
        .map(msg =>
          `window.__handleGesture && window.__handleGesture(${JSON.stringify(msg)});`
        )
        .join('\n');
      scripts.push(gestureBatch);
    }

    // Handle other message types
    Object.keys(groupedMessages).forEach(type => {
      if (type !== 'telemetry' && type !== 'gesture') {
        const batch = (groupedMessages[type] ?? [])
          .map(msg => `window.__handleMessage && window.__handleMessage(${JSON.stringify(msg)});`)
          .join('\n');
        scripts.push(batch);
      }
    });

    return scripts.join('\n');
  }

  // Register WebView for optimization
  public registerWebView(webview: any): void {
    this.webviewRefs.add(webview);
  }

  // Unregister WebView
  public unregisterWebView(webview: any): void {
    this.webviewRefs.delete(webview);
  }

  // Update performance metrics
  public updateMetrics(updates: Partial<PerformanceMetrics>): void {
    this.metrics = { ...this.metrics, ...updates };
  }

  // Get current performance metrics
  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  // Check if in low power mode
  public isInLowPowerMode(): boolean {
    return this.isLowPowerMode;
  }

  // Adaptive frame rate based on performance
  public getAdaptiveFrameRate(): number {
    if (this.isLowPowerMode) {
      return Math.max(15, this.metrics.frameRate * 0.7);
    }

    // Adjust based on CPU usage (placeholder logic)
    if (this.metrics.cpuUsage > 80) {
      return Math.max(20, this.metrics.frameRate * 0.8);
    }

    return this.metrics.frameRate;
  }

  // Compress landmark data for transmission with advanced optimization
  public compressLandmarks(landmarks: number[][][]): string {
    if (!landmarks || landmarks.length === 0) return '';

    // Flatten and apply delta encoding for better compression
    const flattened = landmarks.flat(2);
    if (flattened.length === 0) return '';

    // Delta encoding: store differences instead of absolute values
    const firstValue = flattened[0];
    if (typeof firstValue !== 'number' || !Number.isFinite(firstValue)) {
      return '';
    }
    const deltas: number[] = [firstValue]; // First value as-is
    for (let i = 1; i < flattened.length; i++) {
      const current = flattened[i];
      const previous = flattened[i - 1];
      if (typeof current !== 'number' || typeof previous !== 'number') {
        continue;
      }
      deltas.push(current - previous);
    }

    // Quantize to reduce precision (adaptive based on low power mode)
    const precision = this.isLowPowerMode ? 50 : 100; // Lower precision in low power mode
    const compressed = deltas.map(delta => Math.round(delta * precision) / precision);

    return compressed.join(',');
  }

  // Decompress landmark data
  public decompressLandmarks(compressed: string): number[][][] {
    if (!compressed) return [];

    const deltas = compressed.split(',').map(coord => Number.parseFloat(coord));
    const firstDeltaCandidate = deltas[0];
    if (typeof firstDeltaCandidate !== 'number' || !Number.isFinite(firstDeltaCandidate)) return [];
    const firstDelta = firstDeltaCandidate;

    // Reverse delta encoding
    const coords: number[] = [firstDelta];
    for (let i = 1; i < deltas.length; i++) {
      const previous = coords[i - 1];
      const deltaValue = deltas[i];
      if (previous === undefined || !Number.isFinite(previous) || typeof deltaValue !== 'number' || !Number.isFinite(deltaValue)) {
        continue;
      }
      coords.push(previous + deltaValue);
    }

    // Reconstruct landmark structure
    const landmarks: number[][][] = [];
    for (let i = 0; i < coords.length; i += 3) {
      if (i + 2 < coords.length) {
        landmarks.push([coords.slice(i, i + 3)]);
      }
    }

    return landmarks;
  }

  // Get optimized processing parameters based on device state
  public getOptimizedProcessingParams(): {
    frameRate: number;
    compressionEnabled: boolean;
    batchSize: number;
    telemetryEnabled: boolean;
  } {
    const isLowPower = this.isInLowPowerMode();
    const highMemoryUsage = this.metrics.memoryUsage > 80;

    return {
      frameRate: this.getAdaptiveFrameRate(),
      compressionEnabled: true, // Always compress to save bandwidth
      batchSize: isLowPower ? 5 : 10, // Smaller batches in low power mode
      telemetryEnabled: !isLowPower && !highMemoryUsage // Disable telemetry when resources are constrained
    };
  }

  // Cleanup on app close
  public cleanup(): void {
    if (this.memoryCleanupTimer) {
      clearInterval(this.memoryCleanupTimer);
      this.memoryCleanupTimer = null;
    }

    if (this.batteryCheckTimer) {
      clearInterval(this.batteryCheckTimer);
      this.batteryCheckTimer = null;
    }

    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }

    // Clear WebView references
    this.webviewRefs.clear();

    logger.info('Performance optimization service cleaned up');
  }
}

// Export singleton instance
export const performanceOptimizationService = PerformanceOptimizationService.getInstance();