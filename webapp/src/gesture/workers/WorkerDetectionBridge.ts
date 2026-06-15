/**
 * WorkerDetectionBridge — main-thread bridge to the DetectionWorker.
 *
 * PROTOTYPE STATUS: See docs/testing/benchmarks/worker-offload-2026-03-25.md.
 *
 * Usage:
 *   const bridge = new WorkerDetectionBridge({ wasmBase, gestureModelUrl, ... });
 *   await bridge.init();
 *
 *   // In the detection loop, instead of calling gestureRecognizer.recognizeForVideo():
 *   const bitmap = await createImageBitmap(videoElement);
 *   const result = await bridge.detect(bitmap, performance.now());
 *   if (result) { ... process landmarks ... }
 *
 *   bridge.dispose(); // cleanup on stop
 */

import { buildMediaPipeTasksVisionUrl } from '../config/MediaPipeDependencies';

import type {
  WorkerDetectResponse,
  WorkerDetectionResult,
  WorkerErrorResponse,
  WorkerInitRequest,
  WorkerResponse,
} from './DetectionWorker';

export interface WorkerBridgeOptions {
  visionBundleUrl?: string;
  wasmBase: string;
  gestureModelUrl: string;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
  numHands?: number;
  /** Timeout in ms waiting for worker to become ready. Default: 10_000. */
  initTimeoutMs?: number;
  /**
   * Factory for constructing the underlying Web Worker.
   * Defaults to `() => new Worker(new URL('./DetectionWorker.ts', import.meta.url), { type: 'module' })`.
   * Override in tests to inject a mock Worker without touching window globals.
   */
  workerFactory?: () => Worker;
}

interface PendingDetect {
  resolve: (result: WorkerDetectionResult | null) => void;
  reject: (err: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class WorkerDetectionBridge {
  private worker: Worker | null = null;
  private ready = false;
  private initTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private initReject: ((error: Error) => void) | null = null;
  private initMessageListener: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  private initErrorListener: ((event: ErrorEvent) => void) | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingDetect>();
  private readonly options: Required<WorkerBridgeOptions>;

  constructor(options: WorkerBridgeOptions) {
    this.options = {
      visionBundleUrl: buildMediaPipeTasksVisionUrl('vision_bundle.mjs'),
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
      numHands: 2,
      initTimeoutMs: 10_000,
      workerFactory: () =>
        new Worker(new URL('./DetectionWorker.ts', import.meta.url), { type: 'module' }),
      ...options,
    };
  }

  /**
   * Spawn the worker and wait until MediaPipe is ready inside it.
   */
  init(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ready = false;
      this.initReject = reject;
      let candidateWorker: Worker;
      try {
        // Use the injected factory (default: Vite ?worker URL import).
        // Vite resolves `new URL('./DetectionWorker.ts', import.meta.url)` as a
        // worker module at build time. In test environments pass a `workerFactory`
        // option to inject a mock instead of touching global Worker.
        candidateWorker = this.options.workerFactory();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      const cleanupInitState = () => {
        if (this.initTimeoutId) {
          clearTimeout(this.initTimeoutId);
          this.initTimeoutId = null;
        }
        if (this.initMessageListener) {
          candidateWorker.removeEventListener('message', this.initMessageListener);
          this.initMessageListener = null;
        }
        if (this.initErrorListener) {
          candidateWorker.removeEventListener('error', this.initErrorListener);
          this.initErrorListener = null;
        }
      };

      this.initTimeoutId = setTimeout(() => {
        cleanupInitState();
        this.initReject = null;
        this.dispose();
        reject(new Error('WorkerDetectionBridge: init timed out'));
      }, this.options.initTimeoutMs);

      const onInit = (event: MessageEvent<WorkerResponse>) => {
        const msg = event.data;
        if (msg.type === 'ready') {
          cleanupInitState();
          this.worker = candidateWorker;
          this.ready = true;
          this.worker.addEventListener('message', this.handleMessage.bind(this));
          this.initReject = null;
          resolve();
        } else if (msg.type === 'error') {
          cleanupInitState();
          this.initReject = null;
          this.dispose();
          reject(new Error(`Worker init error: ${msg.message}`));
        }
      };
      this.initMessageListener = onInit;

      const onInitError = (ev: ErrorEvent) => {
        cleanupInitState();
        this.initReject = null;
        this.dispose();
        reject(new Error(`Worker runtime error: ${ev.message}`));
      };
      this.initErrorListener = onInitError;

      candidateWorker.addEventListener('message', onInit);
      candidateWorker.addEventListener('error', onInitError);

      const initMsg: WorkerInitRequest = {
        type: 'init',
        visionBundleUrl: this.options.visionBundleUrl,
        wasmBase: this.options.wasmBase,
        gestureModelUrl: this.options.gestureModelUrl,
        minDetectionConfidence: this.options.minDetectionConfidence,
        minTrackingConfidence: this.options.minTrackingConfidence,
        numHands: this.options.numHands,
      };
      candidateWorker.postMessage(initMsg);
    });
  }

  /**
   * Send a video frame to the worker for detection.
   * The `bitmap` is transferred (zero-copy) and must not be used after this call.
   *
   * @returns Detected landmarks/gestures, or null if nothing was detected.
   */
  detect(bitmap: ImageBitmap, timestampMs: number): Promise<WorkerDetectionResult | null> {
    if (!this.worker || !this.ready) {
      bitmap.close();
      return Promise.reject(new Error('WorkerDetectionBridge: worker not initialized'));
    }

    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        bitmap.close();
        resolve(null); // timeout = treat as no detection, not an error
      }, 500); // 500 ms per-frame timeout

      this.pending.set(id, { resolve, reject, timeoutId });
      this.worker!.postMessage(
        { type: 'detect', id, bitmap, timestampMs },
        [bitmap], // transfer ownership
      );
    });
  }

  /**
   * Check whether the bridge has been initialised (worker spawned and ready).
   */
  get isReady(): boolean {
    return this.ready;
  }

  dispose(): void {
    this.ready = false;
    if (this.initTimeoutId) {
      clearTimeout(this.initTimeoutId);
      this.initTimeoutId = null;
    }
    if (this.initReject) {
      this.initReject(new Error('WorkerDetectionBridge: initialization cancelled'));
      this.initReject = null;
    }
    if (this.worker && this.initMessageListener) {
      this.worker.removeEventListener('message', this.initMessageListener);
      this.initMessageListener = null;
    }
    if (this.worker && this.initErrorListener) {
      this.worker.removeEventListener('error', this.initErrorListener);
      this.initErrorListener = null;
    }
    for (const { resolve, timeoutId } of this.pending.values()) {
      clearTimeout(timeoutId);
      resolve(null);
    }
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }

  private handleMessage(event: MessageEvent<WorkerResponse>): void {
    const msg = event.data;
    if (msg.type === 'detect_result') {
      const resp = msg as WorkerDetectResponse;
      const pending = this.pending.get(resp.id);
      if (pending) {
        clearTimeout(pending.timeoutId);
        this.pending.delete(resp.id);
        pending.resolve(resp.result);
      }
    } else if (msg.type === 'error') {
      const err = msg as WorkerErrorResponse;
      if (err.id !== undefined) {
        const pending = this.pending.get(err.id);
        if (pending) {
          clearTimeout(pending.timeoutId);
          this.pending.delete(err.id);
          pending.resolve(null); // errors from single frames resolve null, not reject
        }
      }
      console.warn('DetectionWorker error:', err.message);
    }
  }
}
