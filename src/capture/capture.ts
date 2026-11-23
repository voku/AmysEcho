/**
 * Camera capture (card NG-3, docs/capture.md): a tap starts it, camera frames
 * go to the hand tracker in a worker, landmark numbers come back.
 *
 * - The camera is requested only by `startCapture`, which only a tap on the
 *   capture path calls. Loading this module requests nothing.
 * - No picture is kept: each frame is turned into an `ImageBitmap`, handed to
 *   the worker and closed there after tracking. What stays, and only in
 *   memory, is landmark numbers, and only when the caller asks for them
 *   (`record`). Nothing is stored and nothing is sent.
 * - The tracker files have their own cache (`TRACKER_CACHE_PREFIX`), filled and
 *   checked here on the first start, never by the board's install.
 */
import { frameSummary, type TrackerFrame, type TrackerHand, type TrackerPoint } from "../recognition/tracker-adapter.js";
import type { Delegate, TrackerFiles, TrackerReply, TrackerRequest } from "./tracker-worker.js";

/** Pose (for the shoulders) runs on every this many frames; the matcher takes the median shoulders of a capture. */
export const POSE_EVERY = 5;
/** The live line says the shoulders are gone only after this many pose results in a row without them. */
export const SHOULDERS_LOST_AFTER = 2;

/** What the live line says about the shoulders, held between pose results. */
export interface ShoulderState {
  readonly seen: boolean;
  /** Pose results in a row without shoulders. */
  readonly posesWithout: number;
}

/**
 * The next shoulder state for the live line. A frame the pose model did not run on
 * (`poseRan` false) changes nothing; shoulders seen show at once; they are reported as
 * gone only after SHOULDERS_LOST_AFTER pose results in a row without them.
 */
export function nextShoulders(state: ShoulderState, shouldersInFrame: boolean, poseRan: boolean | undefined): ShoulderState {
  if (shouldersInFrame) return { seen: true, posesWithout: 0 };
  if (poseRan === false) return state;
  const posesWithout = state.posesWithout + 1;
  return { seen: state.seen && posesWithout < SHOULDERS_LOST_AFTER, posesWithout };
}
/** A recording keeps at most this many frames, the newest; about a minute at 10 frames per second. */
export const MAX_RECORDED_FRAMES = 600;
/** How long the tracker worker may take to start once its files are there. */
export const TRACKER_START_TIMEOUT_MS = 60_000;
/** A tracker download that receives nothing for this long is given up ("tracker_timeout"); the next tap tries again. */
export const TRACKER_STALL_MS = 30_000;
/** Cache names of the tracker files start with this; the board's service worker never deletes them. */
export const TRACKER_CACHE_PREFIX = "amysecho-tracker-";

export type CaptureProblem =
  | "denied" | "no_camera" | "busy" | "unsupported"
  | "tracker_download" | "tracker_storage" | "tracker_timeout" | "tracker_unavailable" | "tracker_failed";
export type CaptureStep = "preparing" | "asking" | "running" | "stopped";

/** All user-facing text of the capture path. German, as everything the child and caregiver see. */
export const CAPTURE_TEXT = {
  title: "Kamera testen",
  intro: "Die Kamera startet erst, wenn du auf „Kamera starten“ tippst. Bilder werden nicht gespeichert und nicht gesendet.",
  start: "Kamera starten",
  stop: "Kamera stoppen",
  back: "Zurück zur Tafel",
  preparing: "Die Handerkennung wird vorbereitet …",
  asking: "Bitte die Kamera erlauben.",
  running: "Die Kamera läuft.",
  stopped: "Die Kamera ist aus.",
  hands: ["Keine Hand im Bild.", "Eine Hand im Bild.", "Zwei Hände im Bild."],
  shoulders: ["Schultern nicht zu sehen.", "Schultern zu sehen."],
  problems: {
    denied: "Die Kamera ist nicht erlaubt. Du kannst sie in den Einstellungen des Browsers erlauben. Die Tafel funktioniert auch ohne Kamera.",
    no_camera: "Es wurde keine Kamera gefunden. Die Tafel funktioniert auch ohne Kamera.",
    busy: "Die Kamera kann gerade nicht starten. Vielleicht benutzt eine andere App sie. Bitte die andere App schließen und noch einmal versuchen.",
    unsupported: "Dieser Browser kann die Kamera hier nicht benutzen. Die Tafel funktioniert auch ohne Kamera.",
    tracker_download: "Die Handerkennung konnte nicht geladen werden. Beim ersten Mal braucht sie Internet (etwa 25 MB). Bitte mit Internet noch einmal auf „Kamera starten“ tippen. Die Tafel funktioniert auch ohne.",
    tracker_storage: "Auf diesem Gerät ist nicht genug Speicher frei für die Handerkennung (etwa 25 MB). Bitte Speicher freigeben und noch einmal versuchen. Die Tafel funktioniert auch ohne.",
    tracker_timeout: "Die Handerkennung lädt nicht weiter. Bitte noch einmal auf „Kamera starten“ tippen. Die Tafel funktioniert auch ohne.",
    tracker_unavailable: "Die Handerkennung konnte nicht gestartet werden. Die Tafel funktioniert auch ohne.",
    tracker_failed: "Die Handerkennung ist ausgefallen. Die Kamera ist aus.",
  } satisfies Record<CaptureProblem, string>,
} as const;

/** What a refused `getUserMedia` means for the person in front of the device. */
export function cameraProblem(error: unknown): CaptureProblem {
  const name = (error as { name?: unknown } | null)?.name;
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDeniedError":
      return "denied";
    case "NotFoundError":
    case "OverconstrainedError":
    case "DevicesNotFoundError":
      return "no_camera";
    case "NotReadableError":
    case "AbortError":
    case "TrackStartError":
      return "busy";
    default:
      return "unsupported";
  }
}

export type TrackerProblem = "tracker_download" | "tracker_storage" | "tracker_timeout" | "tracker_unavailable";

/** A tracker start that failed for a reason the person can act on. */
export class TrackerStartError extends Error {
  constructor(readonly problem: TrackerProblem, message: string) {
    super(message);
  }
}

/** What a failed tracker start means: no network, no storage, a stalled download, or anything else. */
export function trackerProblem(error: unknown): TrackerProblem {
  if (error instanceof TrackerStartError) return error.problem;
  switch ((error as { name?: unknown } | null)?.name) {
    case "QuotaExceededError":
      return "tracker_storage";
    case "TimeoutError":
      return "tracker_timeout";
    case "TypeError": // fetch without a network
    case "NetworkError":
      return "tracker_download";
    default:
      return "tracker_unavailable";
  }
}

export interface CameraStream {
  getTracks(): readonly { stop(): void }[];
}

export interface CameraFrame {
  /** The picture for the tracker; ownership passes to the tracker, which closes it. */
  readonly image: unknown;
  readonly timestampMs: number;
  readonly width: number;
  readonly height: number;
}

export interface FrameSource {
  /** The next camera frame, or null when the source has ended. */
  next(): Promise<CameraFrame | null>;
  close(): void;
}

export interface TrackerResult {
  readonly hands: readonly TrackerHand[];
  readonly pose: readonly TrackerPoint[] | null;
}

export interface TrackerClient {
  detect(image: unknown, timestampMs: number, pose: boolean): Promise<TrackerResult>;
  close(): void;
}

/** What capture needs from the browser; a test passes fakes. */
export interface CaptureEnvironment {
  /** Loads and starts the tracker; `signal` cancels the download and ends a worker that is starting. */
  startTracker(signal?: AbortSignal): Promise<TrackerClient>;
  getUserMedia(constraints: MediaStreamConstraints): Promise<CameraStream>;
  openFrames(stream: CameraStream): Promise<FrameSource>;
  /** False while the page is not visible. The camera is never requested then. */
  isVisible?(): boolean;
}

export interface CaptureOptions {
  /** Keep the landmark frames of this capture in memory, for `stop()` to return. Default false. */
  readonly record?: boolean;
  readonly maxRecordedFrames?: number;
  readonly onStep?: (step: CaptureStep) => void;
  /** Every tracked frame, as it arrives. */
  readonly onFrame?: (frame: TrackerFrame) => void;
  /**
   * Cancels the start at any step (tracker loading, permission request,
   * camera opening) and stops a running capture. A camera obtained after the
   * cancel is stopped at once.
   */
  readonly signal?: AbortSignal;
}

export type CaptureEnd = { readonly kind: "stopped" } | { readonly kind: "problem"; readonly problem: CaptureProblem };

export interface CaptureSession {
  /** Ends the capture: camera off, tracker closed. Returns the recorded frames (empty without `record`) and forgets them. Safe to call twice. */
  stop(): TrackerFrame[];
  /**
   * Starts keeping the landmark frames of this capture from now on, in
   * memory, and forgets any kept before. The camera keeps running. Does
   * nothing after the capture ended.
   */
  startRecording(): void;
  /** Stops keeping frames and returns those kept since `startRecording` (or the start with `record`). The camera keeps running. */
  stopRecording(): TrackerFrame[];
  /** Settles when the capture ends, by `stop()` or by a problem. */
  readonly ended: Promise<CaptureEnd>;
}

export type CaptureStart =
  | { readonly ok: true; readonly session: CaptureSession }
  | { readonly ok: false; readonly problem: CaptureProblem }
  /** Cancelled by `signal`, or the page was hidden before the camera was requested or opened. */
  | { readonly ok: false; readonly cancelled: true };

export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
};

/**
 * Starts a capture: first the tracker (so that a tracker that cannot load
 * never costs a camera prompt), then the camera, then the frame loop. Before
 * the camera is requested, and again when it was granted and when it is open,
 * the start gives up if it was cancelled or the page is not visible; a camera
 * granted after that is stopped at once.
 */
export async function startCapture(environment: CaptureEnvironment, options: CaptureOptions = {}): Promise<CaptureStart> {
  const signal = options.signal;
  const cancelled = { ok: false, cancelled: true } as const;
  const givenUp = (): boolean => signal?.aborted === true || environment.isVisible?.() === false;
  if (givenUp()) return cancelled;
  options.onStep?.("preparing");
  let tracker: TrackerClient;
  try {
    tracker = await environment.startTracker(signal);
  } catch (error) {
    if (signal?.aborted === true) return cancelled;
    return { ok: false, problem: trackerProblem(error) };
  }
  if (givenUp()) {
    tracker.close();
    return cancelled;
  }
  options.onStep?.("asking");
  let stream: CameraStream;
  try {
    stream = await environment.getUserMedia(CAMERA_CONSTRAINTS);
  } catch (error) {
    tracker.close();
    if (signal?.aborted === true) return cancelled;
    return { ok: false, problem: cameraProblem(error) };
  }
  const release = (): void => {
    for (const track of stream.getTracks()) track.stop();
    tracker.close();
  };
  if (givenUp()) {
    release();
    return cancelled;
  }
  let source: FrameSource;
  try {
    source = await environment.openFrames(stream);
  } catch {
    release();
    if (signal?.aborted === true) return cancelled;
    return { ok: false, problem: "busy" };
  }
  if (givenUp()) {
    source.close();
    release();
    return cancelled;
  }

  const limit = Math.max(1, options.maxRecordedFrames ?? MAX_RECORDED_FRAMES);
  let recorded: TrackerFrame[] = [];
  let keeping = options.record === true;
  let running = true;
  let finish: (end: CaptureEnd) => void = () => undefined;
  const ended = new Promise<CaptureEnd>((resolve) => { finish = resolve; });
  const shutDown = (end: CaptureEnd): TrackerFrame[] => {
    if (!running) return [];
    running = false;
    for (const track of stream.getTracks()) track.stop();
    source.close();
    tracker.close();
    const frames = recorded;
    recorded = [];
    options.onStep?.("stopped");
    finish(end);
    return frames;
  };

  signal?.addEventListener("abort", () => shutDown({ kind: "stopped" }), { once: true });
  options.onStep?.("running");
  void (async () => {
    let index = 0;
    let lastMs = Number.NEGATIVE_INFINITY;
    while (running) {
      let frame: CameraFrame | null;
      try {
        frame = await source.next();
      } catch {
        frame = null;
      }
      if (!running) {
        closeImage(frame?.image);
        return;
      }
      if (frame === null) {
        shutDown({ kind: "problem", problem: "busy" });
        return;
      }
      // The tracker's video mode needs strictly increasing timestamps.
      const timestampMs = Math.max(frame.timestampMs, lastMs + 1);
      lastMs = timestampMs;
      let result: TrackerResult;
      const poseRan = index % POSE_EVERY === 0;
      try {
        result = await tracker.detect(frame.image, timestampMs, poseRan);
      } catch {
        if (running) shutDown({ kind: "problem", problem: "tracker_failed" });
        return;
      }
      index += 1;
      if (!running) return;
      const tracked: TrackerFrame = { timestampMs, imageWidth: frame.width, imageHeight: frame.height, hands: result.hands, pose: result.pose, poseRan };
      if (keeping) {
        recorded.push(tracked);
        if (recorded.length > limit) recorded.splice(0, recorded.length - limit);
      }
      options.onFrame?.(tracked);
    }
  })();

  const session: CaptureSession = {
    stop: () => shutDown({ kind: "stopped" }),
    startRecording() {
      if (!running) return;
      recorded = [];
      keeping = true;
    },
    stopRecording() {
      const frames = recorded;
      recorded = [];
      keeping = false;
      return frames;
    },
    ended,
  };
  return { ok: true, session };
}

function closeImage(image: unknown): void {
  const close = (image as { close?: unknown } | null | undefined)?.close;
  if (typeof close === "function") close.call(image);
}

// ---------------------------------------------------------------------------
// Tracker files: their own cache, filled and checked on the first start.

export interface TrackerManifest {
  readonly package: string;
  readonly version: string;
  /** Directory of this build's files below `vendor/mediapipe/`, named after their contents ("<version>-<digest>"). */
  readonly directory: string;
  /** Name of the cache that holds exactly these files: `TRACKER_CACHE_PREFIX` + `directory`. */
  readonly cache: string;
  readonly files: readonly { readonly path: string; readonly sha256: string; readonly bytes: number }[];
}

export function parseTrackerManifest(value: unknown): TrackerManifest {
  const manifest = value as Partial<TrackerManifest> | null;
  if (manifest === null || typeof manifest !== "object" || typeof manifest.directory !== "string"
    || !/^[a-z0-9._-]+$/i.test(manifest.directory) || manifest.directory.startsWith(".")
    || manifest.cache !== TRACKER_CACHE_PREFIX + manifest.directory || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("tracker manifest is malformed");
  }
  for (const file of manifest.files) {
    if (typeof file?.path !== "string" || !/^[a-z0-9_./-]+$/i.test(file.path) || file.path.includes("..")
      || !file.path.startsWith(`${manifest.directory}/`)
      || typeof file.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(file.sha256) || !Number.isInteger(file.bytes)) {
      throw new Error("tracker manifest entry is malformed");
    }
  }
  return manifest as TrackerManifest;
}

export interface CacheLike {
  match(request: string): Promise<Response | undefined>;
  put(request: string, response: Response): Promise<void>;
}

export interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
}

export interface TrackerFileEnvironment {
  readonly caches: CacheStorageLike | undefined;
  readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
  readonly sha256: (bytes: ArrayBuffer) => Promise<string>;
  readonly persist?: () => Promise<boolean>;
}

export interface TrackerFileOptions {
  readonly signal?: AbortSignal;
  /** Give a download up when nothing arrives for this long (default `TRACKER_STALL_MS`). */
  readonly stallMs?: number;
}

function never<T>(signal: AbortSignal | undefined): Promise<T> {
  const waiting = new Promise<T>((_, reject) => {
    if (signal === undefined) return;
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  waiting.catch(() => undefined);
  return waiting;
}

/** Fetches one file; gives up when nothing arrives for `stallMs` (TimeoutError) or `signal` aborts. */
async function download(environment: TrackerFileEnvironment, url: string, options: TrackerFileOptions): Promise<{ bytes: ArrayBuffer; type: string | null }> {
  const stallMs = options.stallMs ?? TRACKER_STALL_MS;
  const controller = new AbortController();
  const forward = (): void => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", forward, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stall: (error: Error) => void = () => undefined;
  const stalled = new Promise<never>((_, reject) => { stall = reject; });
  stalled.catch(() => undefined);
  const arm = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const error = new DOMException(`tracker download stalled: ${url}`, "TimeoutError");
      controller.abort(error);
      stall(error);
    }, stallMs);
  };
  const cancelled = never<never>(options.signal);
  const guarded = <T>(promise: Promise<T>): Promise<T> => Promise.race([promise, stalled, cancelled]);
  try {
    arm();
    const response = await guarded(environment.fetch(url, { cache: "no-cache", signal: controller.signal }));
    if (!response.ok) throw new TrackerStartError("tracker_download", `${url}: HTTP ${response.status}`);
    const type = response.headers.get("content-type");
    if (response.body === null) return { bytes: await guarded(response.arrayBuffer()), type };
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        arm();
        const { done, value } = await guarded(reader.read());
        if (done) break;
        chunks.push(value);
        length += value.byteLength;
      }
    } catch (error) {
      void reader.cancel().catch(() => undefined);
      throw error;
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { bytes: bytes.buffer, type };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", forward);
  }
}

/** The manifest of a complete tracker cache (one that holds its manifest), or null. */
async function cachedManifest(manifestUrl: string, caches: CacheStorageLike): Promise<TrackerManifest | null> {
  for (const name of await caches.keys()) {
    if (!name.startsWith(TRACKER_CACHE_PREFIX)) continue;
    const cached = await (await caches.open(name)).match(manifestUrl);
    if (cached === undefined) continue;
    try {
      const manifest = parseTrackerManifest(await cached.json());
      if (manifest.cache === name) return manifest;
    } catch {
      // A damaged manifest does not make a cache complete.
    }
  }
  return null;
}

/**
 * Makes sure the cache named in the current manifest holds every file of it,
 * each checked against its size and sha256 before it is put in, and then the
 * manifest itself, which marks the cache complete. The files of each build
 * have their own URLs (`<version>-<digest>/...`), so an older cache can never
 * stand in for a newer file. Once the current cache is complete, every other
 * tracker cache is deleted. Offline, a complete cache from earlier is used.
 * Returns the manifest whose files are ready (without a Cache API: the current
 * one, loaded from the network). Throws a `TrackerStartError`, a
 * `QuotaExceededError` (storage full), a `TimeoutError` (stalled download) or
 * the abort reason; the board is not affected either way.
 */
export async function prepareTrackerFiles(manifestUrl: string, environment: TrackerFileEnvironment, options: TrackerFileOptions = {}): Promise<TrackerManifest> {
  let manifestBytes: ArrayBuffer;
  try {
    manifestBytes = (await download(environment, manifestUrl, options)).bytes;
  } catch (error) {
    if (options.signal?.aborted === true) throw options.signal.reason;
    const earlier = environment.caches === undefined ? null : await cachedManifest(manifestUrl, environment.caches);
    if (earlier !== null) return earlier;
    throw error instanceof TrackerStartError || (error as { name?: unknown } | null)?.name === "TimeoutError"
      ? error
      : new TrackerStartError("tracker_download", `${manifestUrl}: ${String((error as Error)?.message ?? error)}`);
  }
  let manifest: TrackerManifest;
  try {
    manifest = parseTrackerManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));
  } catch (error) {
    throw new TrackerStartError("tracker_unavailable", String((error as Error)?.message ?? error));
  }
  if (environment.caches === undefined) return manifest;
  const cache = await environment.caches.open(manifest.cache);
  if (await cache.match(manifestUrl) === undefined) {
    // The tracker files are large; ask the browser not to evict them under storage pressure.
    await environment.persist?.().catch(() => false);
    for (const file of manifest.files) {
      const url = new URL(file.path, manifestUrl).href;
      if (await cache.match(url) !== undefined) continue;
      let fetched: { bytes: ArrayBuffer; type: string | null };
      try {
        fetched = await download(environment, url, options);
      } catch (error) {
        if (options.signal?.aborted === true) throw options.signal.reason;
        if (error instanceof TrackerStartError || (error as { name?: unknown } | null)?.name === "TimeoutError") throw error;
        throw new TrackerStartError("tracker_download", `${url}: ${String((error as Error)?.message ?? error)}`);
      }
      if (fetched.bytes.byteLength !== file.bytes || await environment.sha256(fetched.bytes) !== file.sha256) {
        throw new TrackerStartError("tracker_unavailable", `tracker file ${file.path} does not match its checksum`);
      }
      // A full storage throws QuotaExceededError here ("tracker_storage").
      await cache.put(url, new Response(fetched.bytes, fetched.type === null ? {} : { headers: { "content-type": fetched.type } }));
    }
    await cache.put(manifestUrl, new Response(manifestBytes, { headers: { "content-type": "application/json" } }));
  }
  for (const name of await environment.caches.keys()) {
    if (name.startsWith(TRACKER_CACHE_PREFIX) && name !== manifest.cache) await environment.caches.delete(name);
  }
  return manifest;
}

/** The tracker files of one build, in its directory `vendor/mediapipe/<version>-<digest>/` (a URL ending in "/"). */
export function trackerFiles(directory: string): TrackerFiles {
  return {
    bundle: new URL("vision_bundle.mjs", directory).href,
    wasm: new URL("wasm", directory).href,
    handModel: new URL("models/hand_landmarker.task", directory).href,
    poseModel: new URL("models/pose_landmarker_lite.task", directory).href,
  };
}

// ---------------------------------------------------------------------------
// The browser environment.

export interface BrowserCaptureOptions {
  readonly delegate?: Delegate;
  /** Run the pose model for the shoulders. Default true. */
  readonly pose?: boolean;
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function workerTracker(worker: Worker): TrackerClient {
  let nextId = 0;
  const pending = new Map<number, { resolve: (result: TrackerResult) => void; reject: (error: Error) => void }>();
  let failed: Error | null = null;
  const fail = (error: Error): void => {
    failed = error;
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };
  worker.addEventListener("message", (event: MessageEvent<TrackerReply>) => {
    const reply = event.data;
    if (reply.type === "result") {
      pending.get(reply.id)?.resolve({ hands: reply.hands, pose: reply.pose });
      pending.delete(reply.id);
    } else if (reply.type === "error") {
      fail(new Error(reply.message));
    }
  });
  worker.addEventListener("error", () => fail(new Error("tracker worker failed")));
  return {
    detect(image, timestampMs, pose) {
      if (failed !== null) {
        closeImage(image);
        return Promise.reject(failed);
      }
      const id = nextId++;
      const answer = new Promise<TrackerResult>((resolve, reject) => pending.set(id, { resolve, reject }));
      const request: TrackerRequest = { type: "frame", id, image, timestampMs, pose };
      worker.postMessage(request, [image as Transferable]);
      return answer;
    },
    close() {
      worker.postMessage({ type: "close" } satisfies TrackerRequest);
      // Give the worker a moment to free the models, then end it either way.
      setTimeout(() => worker.terminate(), 1000);
      fail(new Error("tracker closed"));
    },
  };
}

async function startWorkerTracker(options: BrowserCaptureOptions, signal?: AbortSignal): Promise<TrackerClient> {
  const manifestUrl = new URL("../vendor/mediapipe/manifest.json", import.meta.url).href;
  const manifest = await prepareTrackerFiles(manifestUrl, {
    caches: typeof caches === "undefined" ? undefined : caches,
    fetch: (url, init) => fetch(url, init),
    sha256: async (bytes) => hex(await crypto.subtle.digest("SHA-256", bytes)),
    persist: async () => (await navigator.storage?.persist?.()) ?? false,
  }, signal === undefined ? {} : { signal });
  if (signal?.aborted === true) throw signal.reason;
  const worker = new Worker(new URL("./tracker-worker.js", import.meta.url), { type: "module" });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => done(new DOMException("tracker start timed out", "TimeoutError")), TRACKER_START_TIMEOUT_MS);
    const onAbort = (): void => done(signal?.reason ?? new DOMException("cancelled", "AbortError"));
    const done = (error: unknown): void => {
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      if (error === null) resolve();
      else {
        // A cancelled or failed start leaves no worker behind.
        worker.terminate();
        reject(error);
      }
    };
    const onMessage = (event: MessageEvent<TrackerReply>): void => {
      if (event.data.type === "ready") done(null);
      else if (event.data.type === "error") done(new TrackerStartError("tracker_unavailable", event.data.message));
    };
    const onError = (): void => done(new TrackerStartError("tracker_unavailable", "tracker worker failed to load"));
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.postMessage({
      type: "init",
      delegate: options.delegate ?? "CPU",
      pose: options.pose ?? true,
      files: trackerFiles(new URL(`${manifest.directory}/`, manifestUrl).href),
    } satisfies TrackerRequest);
  });
  return workerTracker(worker);
}

async function videoFrames(stream: CameraStream, host: HTMLElement): Promise<FrameSource> {
  // The video is only a frame source and is never shown: no preview, no picture on screen.
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.hidden = true;
  video.srcObject = stream as MediaStream;
  host.append(video);
  await video.play();
  let closed = false;
  const nextVideoFrame = (): Promise<void> => new Promise((resolve) => {
    if (typeof video.requestVideoFrameCallback === "function") video.requestVideoFrameCallback(() => resolve());
    else requestAnimationFrame(() => resolve());
  });
  return {
    async next() {
      while (!closed) {
        await nextVideoFrame();
        if (closed) break;
        if (video.videoWidth === 0 || video.videoHeight === 0) continue;
        const image = await createImageBitmap(video);
        return { image, timestampMs: performance.now(), width: image.width, height: image.height };
      }
      return null;
    },
    close() {
      closed = true;
      video.pause();
      video.srcObject = null;
      video.remove();
    },
  };
}

/** The real browser: camera through `getUserMedia`, tracker in `tracker-worker.js`. `host` receives the hidden video element. */
export function browserEnvironment(host: HTMLElement, options: BrowserCaptureOptions = {}): CaptureEnvironment {
  return {
    startTracker: (signal) => startWorkerTracker(options, signal),
    getUserMedia: async (constraints) => {
      if (typeof navigator === "undefined" || navigator.mediaDevices?.getUserMedia === undefined) {
        throw Object.assign(new Error("no getUserMedia"), { name: "NotSupportedError" });
      }
      return navigator.mediaDevices.getUserMedia(constraints);
    },
    openFrames: (stream) => videoFrames(stream, host),
    isVisible: () => typeof document === "undefined" || document.visibilityState === "visible",
  };
}

// ---------------------------------------------------------------------------
// The bridge for the caregiver area (card NG-19) and for recognising on the
// board (card NG-20, src/recognise/recognise.ts). Both are part of the
// board's module graph and must not import this module: a failure here (it is
// loaded by index.html as a module of its own) must never stop the board. So
// this module, when the page loads it, leaves what they need under one global
// name, and they look for it when the camera is to start ("Kamera starten" in
// the area, "Gebärde" on the board).

/** The global name of the bridge. `src/caregiver.ts` and `src/recognise/recognise.ts` have the same string; tests compare them. */
export const CAPTURE_BRIDGE_KEY = "amysEchoCapture";

export interface CaptureBridge {
  /** `startCapture` with the browser's camera and tracker; `host` receives the hidden video element. */
  start(host: HTMLElement, options: CaptureOptions): Promise<CaptureStart>;
  readonly text: typeof CAPTURE_TEXT;
  readonly nextShoulders: typeof nextShoulders;
}

export function captureBridge(options: BrowserCaptureOptions = {}): CaptureBridge {
  return {
    start: (host, captureOptions) => startCapture(browserEnvironment(host, options), captureOptions),
    text: CAPTURE_TEXT,
    nextShoulders,
  };
}

// ---------------------------------------------------------------------------
// The capture entry: `index.html#kamera-testen` (card NG-3). Teaching is in
// the caregiver area through the bridge above (card NG-19); recognising on
// the child's board uses the same bridge (card NG-20, src/recognise/recognise.ts).

export const CAPTURE_ROUTE = "#kamera-testen";

function element<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className: string, text = ""): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

/**
 * Shows the capture test in `region` while the address ends in
 * `CAPTURE_ROUTE`: a start button, a live line with 0, 1 or 2 hands, a stop
 * button and a way back to the board. The board is not touched.
 */
export function mountCaptureEntry(doc: Document, region: HTMLElement, options: BrowserCaptureOptions = {}): void {
  /** Ends the current attempt at whatever step it is: tracker loading, permission request, or running. */
  let cancel: (() => void) | null = null;
  let generation = 0;
  const stop = (): void => {
    const current = cancel;
    cancel = null;
    current?.();
  };
  const render = (): void => {
    stop();
    const mine = ++generation;
    if (doc.defaultView?.location.hash !== CAPTURE_ROUTE) {
      region.replaceChildren();
      region.hidden = true;
      delete region.dataset["captureStep"];
      delete region.dataset["captureProblem"];
      return;
    }
    const heading = element(doc, "h2", "capture-title", CAPTURE_TEXT.title);
    const intro = element(doc, "p", "capture-intro", CAPTURE_TEXT.intro);
    const status = element(doc, "p", "capture-status", CAPTURE_TEXT.stopped);
    status.setAttribute("role", "status");
    const seen = element(doc, "p", "capture-seen");
    seen.dataset["hands"] = "";
    const start = element(doc, "button", "capture-start", CAPTURE_TEXT.start);
    start.type = "button";
    const stopButton = element(doc, "button", "capture-stop", CAPTURE_TEXT.stop);
    stopButton.type = "button";
    stopButton.hidden = true;
    const back = element(doc, "button", "capture-back", CAPTURE_TEXT.back);
    back.type = "button";
    const show = (text: string, problem: CaptureProblem | null): void => {
      if (mine !== generation) return;
      status.textContent = text;
      if (problem === null) delete region.dataset["captureProblem"];
      else region.dataset["captureProblem"] = problem;
    };
    /** Back to the start state, with `text`. Also the retry: "Kamera starten" works again. */
    const idle = (text: string, problem: CaptureProblem | null): void => {
      if (mine !== generation) return;
      region.dataset["captureStep"] = "stopped";
      start.hidden = false;
      start.disabled = false;
      stopButton.hidden = true;
      seen.textContent = "";
      seen.dataset["hands"] = "";
      show(text, problem);
    };
    start.addEventListener("click", () => {
      if (cancel !== null) return;
      const controller = new AbortController();
      let session: CaptureSession | null = null;
      // The pose model runs on every POSE_EVERY-th frame only: the shoulder line holds the last pose
      // result and turns to "not seen" only after SHOULDERS_LOST_AFTER pose results in a row without them.
      let shoulders: ShoulderState = { seen: false, posesWithout: 0 };
      const ownCancel = (): void => {
        controller.abort();
        session?.stop();
      };
      cancel = ownCancel;
      const finished = (): void => {
        if (cancel === ownCancel) cancel = null;
      };
      start.disabled = true;
      seen.textContent = "";
      void startCapture(browserEnvironment(region, options), {
        signal: controller.signal,
        onStep: (step) => {
          if (mine !== generation || controller.signal.aborted || step === "stopped") return;
          region.dataset["captureStep"] = step;
          show(CAPTURE_TEXT[step], null);
        },
        onFrame: (frame) => {
          if (mine !== generation || controller.signal.aborted) return;
          const summary = frameSummary(frame);
          shoulders = nextShoulders(shoulders, summary.shoulders, frame.poseRan);
          seen.dataset["hands"] = String(summary.hands);
          seen.dataset["shoulders"] = shoulders.seen ? "1" : "0";
          seen.textContent = `${CAPTURE_TEXT.hands[summary.hands]} ${CAPTURE_TEXT.shoulders[shoulders.seen ? 1 : 0]}`;
        },
      }).then((started) => {
        if (!started.ok) {
          finished();
          if ("problem" in started) idle(CAPTURE_TEXT.problems[started.problem], started.problem);
          else idle(CAPTURE_TEXT.stopped, null);
          return;
        }
        session = started.session;
        if (controller.signal.aborted) session.stop();
        else {
          start.hidden = true;
          stopButton.hidden = false;
        }
        void started.session.ended.then((end) => {
          finished();
          idle(end.kind === "problem" ? CAPTURE_TEXT.problems[end.problem] : CAPTURE_TEXT.stopped, end.kind === "problem" ? end.problem : null);
        });
      });
    });
    stopButton.addEventListener("click", stop);
    back.addEventListener("click", () => {
      stop();
      const view = doc.defaultView;
      if (view !== null) view.history.replaceState(null, "", `${view.location.pathname}${view.location.search}`);
      render();
    });
    region.replaceChildren(heading, intro, start, stopButton, status, seen, back);
    region.hidden = false;
  };
  const view = doc.defaultView;
  view?.addEventListener("hashchange", render);
  // The camera never runs in the background and never starts there: hiding
  // the page ends the attempt at any step, also while the tracker loads or
  // the permission is asked.
  doc.addEventListener("visibilitychange", () => {
    if (doc.visibilityState !== "visible") stop();
  });
  view?.addEventListener("pagehide", stop);
  render();
}

// Wires the entry when loaded by index.html; importing this module elsewhere (a Node test, the browser test) does nothing more.
if (typeof document !== "undefined") {
  try {
    Object.defineProperty(globalThis, CAPTURE_BRIDGE_KEY, { value: captureBridge(), configurable: true });
  } catch (error) {
    console.warn("Camera for teaching unavailable:", error);
  }
  const region = document.querySelector<HTMLElement>("#capture-region");
  if (region !== null && region.dataset["mounted"] !== "true") {
    region.dataset["mounted"] = "true";
    try {
      mountCaptureEntry(document, region);
    } catch (error) {
      console.warn("Camera test unavailable:", error);
    }
  }
}
