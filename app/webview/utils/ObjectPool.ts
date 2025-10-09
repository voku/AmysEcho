/**
 * Object pooling system for performance optimization
 * Reuses objects to reduce garbage collection pressure
 */

export class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn?: (obj: T) => void;
  private maxSize: number;

  constructor(createFn: () => T, resetFn?: (obj: T) => void, maxSize = 100) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
  }

  /**
   * Get an object from the pool or create a new one
   */
  acquire(): T {
    const obj = this.pool.pop();
    if (obj) {
      if (this.resetFn) {
        this.resetFn(obj);
      }
      return obj;
    }
    return this.createFn();
  }

  /**
   * Return an object to the pool
   */
  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.pool.push(obj);
    }
  }

  /**
   * Get current pool size
   */
  size(): number {
    return this.pool.length;
  }

  /**
   * Clear the pool
   */
  clear(): void {
    this.pool = [];
  }
}

/**
 * Specialized pool for landmark arrays
 */
export class LandmarkPool {
  private pool: number[][][] = [];
  private maxSize = 50;

  /**
   * Get a landmark array from the pool
   */
  acquire(): number[][] {
    const landmarks = this.pool.pop();
    if (landmarks) {
      // Clear the array but keep structure
      landmarks.length = 0;
      return landmarks;
    }
    return [] as number[][];
  }

  /**
   * Return landmark array to pool
   */
  release(landmarks: number[][]): void {
    if (this.pool.length < this.maxSize && landmarks.length <= 10) { // Reasonable size limit
      // Clear contents but keep reference
      landmarks.length = 0;
      this.pool.push(landmarks);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): { size: number; maxSize: number } {
    return { size: this.pool.length, maxSize: this.maxSize };
  }
}

// Global pools for common objects
export const landmarkPool = new LandmarkPool();
export const arrayPool = new ObjectPool<number[]>(
  () => [],
  (arr) => arr.length = 0,
  100
);