/**
 * Object pooling system for performance optimization
 * Reuses objects to reduce garbage collection pressure
 */
export class ObjectPool {
    constructor(createFn, resetFn, maxSize = 100) {
        this.pool = [];
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.maxSize = maxSize;
    }
    /**
     * Get an object from the pool or create a new one
     */
    acquire() {
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
    release(obj) {
        if (this.pool.length < this.maxSize) {
            this.pool.push(obj);
        }
    }
    /**
     * Get current pool size
     */
    size() {
        return this.pool.length;
    }
    /**
     * Clear the pool
     */
    clear() {
        this.pool = [];
    }
}
/**
 * Specialized pool for landmark arrays
 */
export class LandmarkPool {
    constructor() {
        this.pool = [];
        this.maxSize = 50;
    }
    /**
     * Get a landmark array from the pool
     */
    acquire() {
        const landmarks = this.pool.pop();
        if (landmarks) {
            // Clear the array but keep structure
            landmarks.length = 0;
            return landmarks;
        }
        return [];
    }
    /**
     * Return landmark array to pool
     */
    release(landmarks) {
        if (this.pool.length < this.maxSize && landmarks.length <= 10) { // Reasonable size limit
            // Clear contents but keep reference
            landmarks.length = 0;
            this.pool.push(landmarks);
        }
    }
    /**
     * Get pool statistics
     */
    getStats() {
        return { size: this.pool.length, maxSize: this.maxSize };
    }
}
// Global pools for common objects
export const landmarkPool = new LandmarkPool();
export const arrayPool = new ObjectPool(() => [], (arr) => arr.length = 0, 100);
