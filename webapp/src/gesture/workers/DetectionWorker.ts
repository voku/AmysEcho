/**
 * DetectionWorker — Web Worker prototype for offloading MediaPipe detection.
 *
 * PROTOTYPE STATUS: This module implements the worker-side of the detection
 * offload described in docs/testing/benchmarks/worker_offload_2026-03-25.md.
 *
 * Architecture:
 *   Main thread          Worker thread
 *   ─────────────        ─────────────────────────────────
 *   createImageBitmap ──▶ receive ImageBitmap (transferred, zero-copy)
 *   wait for result  ◀── gesture recognizer results (structured clone)
 *
 * Why ImageBitmap?
 * - HTMLVideoElement cannot be transferred to a Worker (DOM object).
 * - ImageBitmap IS transferable: `postMessage(bitmap, [bitmap])` gives
 *   zero-copy ownership transfer to the worker thread.
 * - MediaPipe GestureRecognizer.recognizeForVideo() also accepts HTMLImageElement
 *   and ImageBitmap via its `recognize()` method in STATIC_IMAGE_MODE, but for
 *   VIDEO mode we need `recognizeForVideo()` which expects a VideoFrame or
 *   HTMLVideoElement in newer Tasks Vision builds, or ImageBitmap in older ones.
 *
 * Current limitation:
 * The MediaPipe Tasks Vision @0.10.x `recognizeForVideo` signature on some CDN
 * builds does NOT accept ImageBitmap. In those cases the worker falls back to
 * `recognize()` (IMAGE mode). A fuller implementation would use OffscreenCanvas
 * or MediaStream-over-MessageChannel, which requires Chromium 100+ and more
 * complex handshake. See the benchmark doc for recommendations.
 */

/// <reference lib="webworker" />

import type { GestureModelAdapterResult } from '../GestureModelAdapter';

// ── Message shapes ────────────────────────────────────────────────────────────

export interface WorkerDetectRequest {
  type: 'detect';
  id: number;
  /** Transferred ImageBitmap from the main thread (createImageBitmap(video)). */
  bitmap: ImageBitmap;
  /** Frame timestamp in ms (performance.now() on main thread). */
  timestampMs: number;
}

export interface WorkerInitRequest {
  type: 'init';
  /** Tasks Vision WASM CDN base URL, e.g. https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm */
  wasmBase: string;
  /** GestureRecognizer model URL. */
  gestureModelUrl: string;
  /** MediaPipe confidence settings. */
  minDetectionConfidence: number;
  minTrackingConfidence: number;
  numHands: number;
}

export interface WorkerDetectResponse {
  type: 'detect_result';
  id: number;
  timestampMs: number;
  /** Gesture recognizer output (null if no hands detected or error). */
  result: WorkerDetectionResult | null;
  /** Worker-side processing duration in ms. */
  workerProcessingMs: number;
}

export interface WorkerReadyResponse {
  type: 'ready';
}

export interface WorkerErrorResponse {
  type: 'error';
  id?: number;
  message: string;
}

export type WorkerRequest = WorkerDetectRequest | WorkerInitRequest;
export type WorkerResponse = WorkerDetectResponse | WorkerReadyResponse | WorkerErrorResponse;

export interface WorkerHandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface WorkerDetectionResult {
  gestures: Array<Array<{ categoryName: string; score: number }>>;
  landmarks: WorkerHandLandmark[][];
  handednesses: Array<Array<{ categoryName: string }>>;
}

// ── Worker implementation ─────────────────────────────────────────────────────

let recognizer: any = null;
let isInitialized = false;
let pendingFrameId = 0;

async function initRecognizer(req: WorkerInitRequest): Promise<void> {
  try {
    // Load MediaPipe Tasks Vision dynamically inside the worker.
    // importScripts() works for non-module workers; for module workers use import().
    const { FilesetResolver, GestureRecognizer } = await import(
      /* @vite-ignore */ `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs`
    );

    const vision = await FilesetResolver.forVisionTasks(req.wasmBase);

    const options = {
      baseOptions: {
        modelAssetPath: req.gestureModelUrl,
        delegate: 'CPU' as const, // GPU delegate may not work off-thread on all platforms
      },
      runningMode: 'IMAGE' as const, // IMAGE mode since we receive frames as ImageBitmap
      numHands: req.numHands,
      minHandDetectionConfidence: req.minDetectionConfidence,
      minHandPresenceConfidence: req.minDetectionConfidence,
      minTrackingConfidence: req.minTrackingConfidence,
    };

    recognizer = await GestureRecognizer.createFromOptions(vision, options);
    isInitialized = true;
    self.postMessage({ type: 'ready' } satisfies WorkerReadyResponse);
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    } satisfies WorkerErrorResponse);
  }
}

function processFrame(req: WorkerDetectRequest): void {
  const start = performance.now();
  const responseId = req.id;

  if (!isInitialized || !recognizer) {
    self.postMessage({
      type: 'detect_result',
      id: responseId,
      timestampMs: req.timestampMs,
      result: null,
      workerProcessingMs: performance.now() - start,
    } satisfies WorkerDetectResponse);
    req.bitmap.close();
    return;
  }

  try {
    // `recognize()` accepts ImageBitmap in IMAGE mode
    const mpResult = recognizer.recognize(req.bitmap);
    req.bitmap.close();

    const result: WorkerDetectionResult | null =
      mpResult && mpResult.landmarks?.length
        ? {
            gestures: mpResult.gestures ?? [],
            landmarks: (mpResult.landmarks ?? []).map((hand: any[]) =>
              hand.map((lm: any) => ({ x: lm.x, y: lm.y, z: lm.z ?? 0 })),
            ),
            handednesses: mpResult.handednesses ?? [],
          }
        : null;

    self.postMessage({
      type: 'detect_result',
      id: responseId,
      timestampMs: req.timestampMs,
      result,
      workerProcessingMs: performance.now() - start,
    } satisfies WorkerDetectResponse);
  } catch (err) {
    req.bitmap.close();
    self.postMessage({
      type: 'error',
      id: responseId,
      message: err instanceof Error ? err.message : String(err),
    } satisfies WorkerErrorResponse);
  }
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (req.type === 'init') {
    void initRecognizer(req);
  } else if (req.type === 'detect') {
    // Drop stale frames if the worker is falling behind
    if (req.id < pendingFrameId) {
      req.bitmap.close();
      return;
    }
    pendingFrameId = req.id;
    processFrame(req);
  }
});
