// @ts-nocheck
/**
 * Resource management for cleanup and disposal
 * Handles cleanup of event listeners, media streams, timeouts, and observers
 */

export class ResourceManager {
  private resources: Set<() => void | Promise<void>> = new Set();
  private eventListeners: Array<{ element: EventTarget; type: string; listener: EventListener }> = [];
  private mediaStreams: MediaStream[] = [];
  private timeouts: number[] = [];
  private observers: (ResizeObserver | MutationObserver)[] = [];

  /**
   * Register a cleanup function
   */
  registerCleanup(cleanupFn: () => void | Promise<void>): void {
    this.resources.add(cleanupFn);
  }

  /**
   * Register an event listener for cleanup
   */
  registerEventListener(element: EventTarget, type: string, listener: EventListener): void {
    this.eventListeners.push({ element, type, listener });
  }

  /**
   * Register a media stream for cleanup
   */
  registerMediaStream(stream: MediaStream): void {
    this.mediaStreams.push(stream);
  }

  /**
   * Register a timeout for cleanup
   */
  registerTimeout(timeoutId: number): void {
    this.timeouts.push(timeoutId);
  }

  /**
   * Register an observer for cleanup
   */
  registerObserver(observer: ResizeObserver | MutationObserver): void {
    this.observers.push(observer);
  }

  /**
   * Dispose all registered resources
   */
  async dispose(): Promise<void> {
    const errors: Error[] = [];

    // Clean up custom resources
    for (const cleanupFn of this.resources) {
      try {
        const result = cleanupFn();
        if (result && typeof result.then === 'function') {
          await result;
        }
      } catch (e) {
        errors.push(e as Error);
      }
    }
    this.resources.clear();

    // Clean up event listeners
    for (const { element, type, listener } of this.eventListeners) {
      try {
        element.removeEventListener(type, listener);
      } catch (e) {
        errors.push(e as Error);
      }
    }
    this.eventListeners = [];

    // Clean up media streams
    for (const stream of this.mediaStreams) {
      try {
        stream.getTracks().forEach(track => track.stop());
      } catch (e) {
        errors.push(e as Error);
      }
    }
    this.mediaStreams = [];

    // Clean up timeouts
    for (const timeoutId of this.timeouts) {
      try {
        clearTimeout(timeoutId);
      } catch (e) {
        errors.push(e as Error);
      }
    }
    this.timeouts = [];

    // Clean up observers
    for (const observer of this.observers) {
      try {
        observer.disconnect();
      } catch (e) {
        errors.push(e as Error);
      }
    }
    this.observers = [];

    if (errors.length > 0) {
      console.warn('Resource cleanup errors:', errors);
    }
  }

  /**
   * Check if resources are properly cleaned up
   */
  isClean(): boolean {
    return this.resources.size === 0 &&
           this.eventListeners.length === 0 &&
           this.mediaStreams.length === 0 &&
           this.timeouts.length === 0 &&
           this.observers.length === 0;
  }
}