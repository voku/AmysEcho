/**
 * Memory optimization utilities for gesture recognition
 * Manages history buffers and implements cleanup strategies
 */

export class MemoryOptimizer {
  private static instance: MemoryOptimizer;
  private cleanupCallbacks: Map<string, () => void> = new Map();
  private memoryPressureLevel = 0; // 0 = normal, 1 = moderate, 2 = high
  private lastCleanupTime = 0;
  private readonly CLEANUP_INTERVAL = 30000; // 30 seconds
  private readonly HIGH_MEMORY_THRESHOLD = 50 * 1024 * 1024; // 50MB
  private readonly CRITICAL_MEMORY_THRESHOLD = 100 * 1024 * 1024; // 100MB

  private constructor() {
    this.startMemoryMonitoring();
  }

  static getInstance(): MemoryOptimizer {
    if (!MemoryOptimizer.instance) {
      MemoryOptimizer.instance = new MemoryOptimizer();
    }
    return MemoryOptimizer.instance;
  }

  /**
   * Register a cleanup callback for a component
   */
  registerCleanupCallback(componentId: string, callback: () => void): void {
    this.cleanupCallbacks.set(componentId, callback);
  }

  /**
   * Unregister a cleanup callback
   */
  unregisterCleanupCallback(componentId: string): void {
    this.cleanupCallbacks.delete(componentId);
  }

  /**
   * Perform memory cleanup based on current pressure level
   */
  performCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanupTime < this.CLEANUP_INTERVAL && this.memoryPressureLevel === 0) {
      return; // Don't cleanup too frequently under normal conditions
    }

    this.lastCleanupTime = now;

    // Execute all registered cleanup callbacks
    for (const [componentId, callback] of this.cleanupCallbacks) {
      try {
        callback();
      } catch (error) {
        console.warn(`Memory cleanup failed for ${componentId}:`, error);
      }
    }

    // Force garbage collection if available (development only)
    if (typeof window !== 'undefined' && (window as any).gc) {
      (window as any).gc();
    }
  }

  /**
   * Get optimized history buffer size based on memory pressure
   */
  getOptimizedHistorySize(baseSize: number): number {
    switch (this.memoryPressureLevel) {
      case 0: return baseSize; // Normal
      case 1: return Math.max(3, Math.floor(baseSize * 0.7)); // Moderate - reduce by 30%
      case 2: return Math.max(2, Math.floor(baseSize * 0.5)); // High - reduce by 50%
      default: return baseSize;
    }
  }

  /**
   * Create a memory-efficient circular buffer
   */
  createCircularBuffer<T>(maxSize: number): CircularBuffer<T> {
    return new CircularBuffer<T>(this.getOptimizedHistorySize(maxSize));
  }

  /**
   * Optimize array operations for memory efficiency
   */
  optimizeArrayOperations<T>(array: T[], operation: (item: T) => boolean): T[] {
    // Use more memory-efficient filtering when under pressure
    if (this.memoryPressureLevel >= 1) {
      const result: T[] = [];
      for (let i = 0; i < array.length; i++) {
        const item = array[i];
        if (item !== undefined && operation(item)) {
          result.push(item);
        }
      }
      return result;
    }

    return array.filter(operation);
  }

  /**
   * Get current memory status
   */
  getMemoryStatus(): {
    pressureLevel: number;
    lastCleanupTime: number;
    registeredComponents: number;
    estimatedMemoryUsage: number;
  } {
    return {
      pressureLevel: this.memoryPressureLevel,
      lastCleanupTime: this.lastCleanupTime,
      registeredComponents: this.cleanupCallbacks.size,
      estimatedMemoryUsage: this.estimateMemoryUsage()
    };
  }

  /**
   * Estimate current memory usage (rough approximation)
   */
  private estimateMemoryUsage(): number {
    // Rough estimation based on registered components and history buffers
    // This is a simplified calculation - real memory profiling would be more accurate
    let estimatedUsage = 0;

    // Base overhead for the system
    estimatedUsage += 1024 * 1024; // 1MB base

    // Estimate per component
    estimatedUsage += this.cleanupCallbacks.size * 512 * 1024; // 512KB per component

    // Adjust based on pressure level
    switch (this.memoryPressureLevel) {
      case 1: estimatedUsage *= 1.2; break;
      case 2: estimatedUsage *= 1.5; break;
    }

    return estimatedUsage;
  }

  /**
   * Start memory monitoring
   */
  private startMemoryMonitoring(): void {
    if (typeof window === 'undefined') return;

    // Check memory usage periodically
    setInterval(() => {
      this.checkMemoryPressure();
    }, 10000); // Check every 10 seconds

    // Also check on visibility change (tab becomes active)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.checkMemoryPressure();
        this.performCleanup();
      }
    });
  }

  /**
   * Check current memory pressure level
   */
  private checkMemoryPressure(): void {
    if (typeof window === 'undefined' || !window.performance) return;

    try {
      // Use Performance.memory if available (Chrome/Edge)
      const memory = (window.performance as any).memory;
      if (memory) {
        const usedMemory = memory.usedJSHeapSize;
        const totalMemory = memory.totalJSHeapSize;

        if (usedMemory > this.CRITICAL_MEMORY_THRESHOLD) {
          this.memoryPressureLevel = 2;
        } else if (usedMemory > this.HIGH_MEMORY_THRESHOLD || usedMemory / totalMemory > 0.8) {
          this.memoryPressureLevel = 1;
        } else {
          this.memoryPressureLevel = 0;
        }
      } else {
        // Fallback: estimate based on component count and time
        const componentCount = this.cleanupCallbacks.size;
        const timeSinceStart = Date.now() - this.lastCleanupTime;

        if (componentCount > 10 && timeSinceStart > 300000) { // 5 minutes
          this.memoryPressureLevel = 1;
        } else if (componentCount > 15 && timeSinceStart > 600000) { // 10 minutes
          this.memoryPressureLevel = 2;
        } else {
          this.memoryPressureLevel = 0;
        }
      }
    } catch (error) {
      // Memory monitoring failed, assume normal pressure but log for diagnostics
      console.debug('Memory monitoring check failed, reverting to normal pressure state:', error);
      this.memoryPressureLevel = 0;
    }
  }

  /**
   * Force garbage collection (development only)
   */
  forceGC(): void {
    if (typeof window !== 'undefined' && (window as any).gc) {
      (window as any).gc();
    }
  }
}

/**
 * Memory-efficient circular buffer implementation
 */
export class CircularBuffer<T> {
  private buffer: (T | undefined)[] = [];
  private writeIndex = 0;
  private readIndex = 0;
  private size = 0;
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.buffer = new Array(maxSize);
  }

  /**
   * Add item to buffer
   */
  push(item: T): void {
    this.buffer[this.writeIndex] = item;
    this.writeIndex = (this.writeIndex + 1) % this.maxSize;

    if (this.size < this.maxSize) {
      this.size++;
    } else {
      // Buffer is full, advance read index
      this.readIndex = (this.readIndex + 1) % this.maxSize;
    }
  }

  /**
   * Get item at index (0 = most recent)
   */
  get(index: number): T | undefined {
    if (index >= this.size) return undefined;
    const actualIndex = (this.writeIndex - 1 - index + this.maxSize) % this.maxSize;
    return this.buffer[actualIndex];
  }

  /**
   * Get all items as array (most recent first)
   */
  toArray(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.size; i++) {
      const item = this.get(i);
      if (item !== undefined) {
        result.push(item);
      }
    }
    return result;
  }

  /**
   * Get buffer size
   */
  getSize(): number {
    return this.size;
  }

  /**
   * Clear buffer
   */
  clear(): void {
    this.buffer.fill(undefined);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.size = 0;
  }

  /**
   * Resize buffer (creates new buffer)
   */
  resize(newMaxSize: number): void {
    const currentItems = this.toArray();
    this.maxSize = newMaxSize;
    this.buffer = new Array(newMaxSize);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.size = 0;

    // Re-add items up to new max size, preserving chronological order
    // toArray() returns most recent first, so we need to reverse for chronological order
    const itemsToAdd = Math.min(currentItems.length, newMaxSize);
    for (let i = itemsToAdd - 1; i >= 0; i--) {
      const item = currentItems[i];
      if (item !== undefined) {
        this.push(item);
      }
    }
  }
}