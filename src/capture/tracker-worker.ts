/**
 * The hand tracker in a module worker (card NG-3, docs/capture.md).
 *
 * Runs MediaPipe Tasks Vision 0.10.35 from the app's own origin
 * (`vendor/mediapipe/<version>-<digest>/`, filled by `scripts/assemble.mjs`;
 * the page names the files in `init`, and only files of this origin are
 * loaded): the hand landmarker
 * with two hands on every frame, the pose landmarker (for the shoulders) only
 * on the frames the page asks for. Each frame arrives as an `ImageBitmap`, is
 * tracked and closed at once; only landmark numbers go back. Nothing is
 * stored and nothing is sent anywhere.
 *
 * Protocol (page → worker): `init`, `frame`, `close`.
 * Replies (worker → page): `ready`, `result` (per frame), `error`, `closed`.
 */
import type { TrackerHand, TrackerPoint } from "../recognition/tracker-adapter.js";

export type Delegate = "CPU" | "GPU";

export type TrackerRequest =
  | { readonly type: "init"; readonly delegate: Delegate; readonly pose: boolean; readonly files: TrackerFiles }
  | { readonly type: "frame"; readonly id: number; readonly image: unknown; readonly timestampMs: number; readonly pose: boolean }
  | { readonly type: "close" };

export type TrackerReply =
  | { readonly type: "ready" }
  | { readonly type: "result"; readonly id: number; readonly hands: TrackerHand[]; readonly pose: TrackerPoint[] | null }
  | { readonly type: "error"; readonly id: number | null; readonly message: string }
  | { readonly type: "closed" };

/** The part of the tasks-vision API this worker uses. */
interface Landmarker {
  detectForVideo(image: unknown, timestampMs: number): {
    readonly landmarks: readonly (readonly TrackerPoint[])[];
    readonly handedness?: readonly (readonly { readonly categoryName: string; readonly score: number }[])[];
  };
  close(): void;
}

interface WasmFileset {
  readonly wasmLoaderPath: string;
  readonly wasmBinaryPath: string;
}

interface LandmarkerFactory {
  createFromOptions(fileset: WasmFileset, options: Record<string, unknown>): Promise<Landmarker>;
}

export interface VisionModule {
  readonly FilesetResolver: { forVisionTasks(basePath: string, useModule?: boolean): Promise<WasmFileset> };
  readonly HandLandmarker: LandmarkerFactory;
  readonly PoseLandmarker: LandmarkerFactory;
}

export interface TrackerFiles {
  /** The tasks-vision bundle. */
  readonly bundle: string;
  /** Directory of the wasm loader and binary. */
  readonly wasm: string;
  readonly handModel: string;
  readonly poseModel: string;
}

function closeImage(image: unknown): void {
  const close = (image as { close?: unknown } | null)?.close;
  if (typeof close === "function") close.call(image);
}

function plainPoints(points: readonly TrackerPoint[]): TrackerPoint[] {
  return points.map((point) => (point.visibility === undefined
    ? { x: point.x, y: point.y }
    : { x: point.x, y: point.y, visibility: point.visibility }));
}

/**
 * The worker's message handler, apart from the worker itself so that it can
 * be driven in Node with a fake vision module. `post` sends a reply.
 */
export function createTrackerHost(
  loadVision: (bundle: string) => Promise<VisionModule>,
  origin: string,
  post: (reply: TrackerReply) => void,
): (request: TrackerRequest) => Promise<void> {
  let hands: Landmarker | null = null;
  let pose: Landmarker | null = null;
  let closed = false;
  const close = (): void => {
    hands?.close();
    pose?.close();
    hands = null;
    pose = null;
  };
  return async (request) => {
    if (request.type === "close") {
      closed = true;
      close();
      post({ type: "closed" });
      return;
    }
    if (request.type === "init") {
      try {
        if (closed || hands !== null) throw new Error("tracker already started or closed");
        const files = request.files;
        for (const url of [files.bundle, files.wasm, files.handModel, files.poseModel]) {
          if (new URL(url).origin !== origin) throw new Error("tracker files must come from the app's own origin");
        }
        const vision = await loadVision(files.bundle);
        // In a module worker the wasm loader is an ES module, evaluated once
        // per URL, and the bundle clears the factory it publishes after the
        // first task: a second task needs the loader under a second URL
        // (decision record, "CSP and service worker changes"). The service
        // worker ignores the query for these files.
        const fileset = await vision.FilesetResolver.forVisionTasks(files.wasm, true);
        // The GPU delegate needs a canvas of its own in a worker (spike of card NG-16).
        const OffscreenCanvasClass = (globalThis as { OffscreenCanvas?: new (width: number, height: number) => unknown }).OffscreenCanvas;
        const canvas = request.delegate === "GPU" && OffscreenCanvasClass !== undefined ? { canvas: new OffscreenCanvasClass(1, 1) } : {};
        hands = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: files.handModel, delegate: request.delegate },
          ...canvas,
          runningMode: "VIDEO",
          numHands: 2,
        });
        if (request.pose) {
          pose = await vision.PoseLandmarker.createFromOptions(
            { ...fileset, wasmLoaderPath: `${fileset.wasmLoaderPath}?task=pose` },
            { baseOptions: { modelAssetPath: files.poseModel, delegate: request.delegate }, ...canvas, runningMode: "VIDEO", numPoses: 1 },
          );
        }
        post({ type: "ready" });
      } catch (error) {
        close();
        post({ type: "error", id: null, message: String((error as Error)?.message ?? error) });
      }
      return;
    }
    try {
      if (hands === null) throw new Error("tracker not ready");
      const found = hands.detectForVideo(request.image, request.timestampMs);
      const body = request.pose && pose !== null ? pose.detectForVideo(request.image, request.timestampMs).landmarks[0] ?? null : null;
      post({
        type: "result",
        id: request.id,
        hands: found.landmarks.map((points, index) => ({
          landmarks: plainPoints(points),
          label: found.handedness?.[index]?.[0]?.categoryName ?? "",
          score: found.handedness?.[index]?.[0]?.score ?? 0,
        })),
        pose: body === null ? null : plainPoints(body),
      });
    } catch (error) {
      post({ type: "error", id: request.id, message: String((error as Error)?.message ?? error) });
    } finally {
      // The picture is never kept: closed as soon as it was tracked.
      closeImage(request.image);
    }
  };
}

interface WorkerScope {
  onmessage: ((event: { data: TrackerRequest }) => void) | null;
  postMessage(message: TrackerReply): void;
}

// Installs itself only inside a worker; importing this file elsewhere (a Node test) does nothing.
const scope = globalThis as unknown as Partial<WorkerScope> & { WorkerGlobalScope?: unknown; document?: unknown };
if (typeof scope.WorkerGlobalScope === "function" && scope.document === undefined && typeof scope.postMessage === "function") {
  const worker = scope as WorkerScope;
  const handle = createTrackerHost(
    async (bundle) => (await import(bundle)) as VisionModule,
    new URL(import.meta.url).origin,
    (reply) => worker.postMessage(reply),
  );
  // Requests are handled one after the other, in the order they arrive.
  let queue = Promise.resolve();
  worker.onmessage = (event) => {
    queue = queue.then(() => handle(event.data));
  };
}
