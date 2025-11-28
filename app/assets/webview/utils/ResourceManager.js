/**
 * Resource management for cleanup and disposal
 * Handles cleanup of event listeners, media streams, timeouts, and observers
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export class ResourceManager {
    constructor() {
        this.resources = new Set();
        this.eventListeners = [];
        this.mediaStreams = [];
        this.timeouts = [];
        this.observers = [];
    }
    /**
     * Register a cleanup function
     */
    registerCleanup(cleanupFn) {
        this.resources.add(cleanupFn);
    }
    /**
     * Register an event listener for cleanup
     */
    registerEventListener(element, type, listener) {
        this.eventListeners.push({ element, type, listener });
    }
    /**
     * Register a media stream for cleanup
     */
    registerMediaStream(stream) {
        this.mediaStreams.push(stream);
    }
    /**
     * Register a timeout for cleanup
     */
    registerTimeout(timeoutId) {
        this.timeouts.push(timeoutId);
    }
    /**
     * Register an observer for cleanup
     */
    registerObserver(observer) {
        this.observers.push(observer);
    }
    /**
     * Dispose all registered resources
     */
    dispose() {
        return __awaiter(this, void 0, void 0, function* () {
            const errors = [];
            // Clean up custom resources
            for (const cleanupFn of this.resources) {
                try {
                    const result = cleanupFn();
                    if (result && typeof result.then === 'function') {
                        yield result;
                    }
                }
                catch (e) {
                    errors.push(e);
                }
            }
            this.resources.clear();
            // Clean up event listeners
            for (const { element, type, listener } of this.eventListeners) {
                try {
                    element.removeEventListener(type, listener);
                }
                catch (e) {
                    errors.push(e);
                }
            }
            this.eventListeners = [];
            // Clean up media streams
            for (const stream of this.mediaStreams) {
                try {
                    stream.getTracks().forEach(track => track.stop());
                }
                catch (e) {
                    errors.push(e);
                }
            }
            this.mediaStreams = [];
            // Clean up timeouts
            for (const timeoutId of this.timeouts) {
                try {
                    clearTimeout(timeoutId);
                }
                catch (e) {
                    errors.push(e);
                }
            }
            this.timeouts = [];
            // Clean up observers
            for (const observer of this.observers) {
                try {
                    observer.disconnect();
                }
                catch (e) {
                    errors.push(e);
                }
            }
            this.observers = [];
            if (errors.length > 0) {
                console.warn('Resource cleanup errors:', errors);
            }
        });
    }
    /**
     * Check if resources are properly cleaned up
     */
    isClean() {
        return this.resources.size === 0 &&
            this.eventListeners.length === 0 &&
            this.mediaStreams.length === 0 &&
            this.timeouts.length === 0 &&
            this.observers.length === 0;
    }
}
