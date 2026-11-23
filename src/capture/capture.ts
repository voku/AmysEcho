/**
 * Camera capture (card NG-3, docs/capture.md): a tap starts it, camera frames
 * go to the hand tracker in a worker, landmark numbers come back.
 *
 * - The camera is requested only by `startCapture`, which only a tap on the
 *   capture path calls. Loading this module requests nothing.
 * - No picture is kept: each frame is turned into an `ImageBitmap`, handed to
 *   the worker and closed there after tracking. A caller may ask for a live
 *   preview (`preview`, card NG-42): a second `<video>` on the same stream
 *   (mirrored for the front camera only, card NG-43) with the tracked points
 *   drawn over it; it is emptied when the
 *   camera stops and keeps nothing. What stays, and only in
 *   memory, is landmark numbers, and only when the caller asks for them
 *   (`record`). Nothing is stored and nothing is sent.
 * - The tracker files have their own cache (`TRACKER_CACHE_PREFIX`), filled and
 *   checked here on the first start, never by the board's install.
 * - Front or back camera (card NG-43): chosen in the camera test and in
 *   teaching, remembered on the device (`CAMERA_FACING_KEY`), and used by the
 *   bridge for the child's gesture view too. Frames of either camera go to
 *   the tracker unflipped; nothing on the way to the matcher depends on it.
 */
import { frameSummary, shouldersOf, toLandmarkFrame, type TrackerFrame, type TrackerHand, type TrackerPoint } from "../recognition/tracker-adapter.js";
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
  /** The camera choice (card NG-43): which camera the views ask for, remembered on the device. */
  camera: { label: "Kamera:", user: "vorne", environment: "hinten" },
  /** The chosen camera could not be opened and the other one is used; keyed by the camera that was chosen. */
  cameraFallback: {
    user: "Vordere Kamera nicht verfügbar. Es läuft die hintere.",
    environment: "Hintere Kamera nicht verfügbar. Es läuft die vordere.",
  },
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

/** What a camera track says about itself; `getSettings` is missing in some fakes. */
export interface CameraTrack {
  stop(): void;
  getSettings?(): { readonly facingMode?: string };
}

export interface CameraStream {
  getTracks(): readonly CameraTrack[];
}

/**
 * Which camera to use (card NG-43): "user" is the front camera (the screen
 * side), "environment" the back camera. Either way the camera looks at the
 * child, and the frames go to the tracker as the camera delivers them.
 */
export type CameraFacing = "user" | "environment";

/** The camera a capture got: `facing` as it is treated (mirrored preview for "user"), `fellBack` when it is not the one asked for. */
export interface CameraInUse {
  readonly facing: CameraFacing;
  readonly fellBack: boolean;
}

/** The local-storage key of the camera choice; `src/caregiver.ts` has the same string (a test compares them). */
export const CAMERA_FACING_KEY = "amysecho-camera-facing";

/** What the camera choice needs of `localStorage`. */
export interface FacingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The browser's `localStorage`, or null where it is missing or refused (private mode, blocked storage). */
export function browserFacingStorage(): FacingStorage | null {
  try {
    return (globalThis as { localStorage?: FacingStorage }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** The camera chosen on this device; the front camera when nothing (or nothing readable) is stored. */
export function loadCameraFacing(storage: FacingStorage | null): CameraFacing {
  try {
    return storage?.getItem(CAMERA_FACING_KEY) === "environment" ? "environment" : "user";
  } catch {
    return "user";
  }
}

/** Remembers the choice on this device. A storage that refuses it is ignored: the choice then holds until the page is left. */
export function saveCameraFacing(storage: FacingStorage | null, facing: CameraFacing): void {
  try {
    storage?.setItem(CAMERA_FACING_KEY, facing);
  } catch {
    // Nothing: a convenience, not data.
  }
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
  /**
   * Shows the camera while it runs (card NG-42): `show` once the camera is
   * open, `draw` with every tracked frame, `close` when the capture ends, by
   * whatever way. A failure in it never stops the capture.
   */
  readonly preview?: PreviewSink;
  /** The camera to ask for (card NG-43). Default "user", the front camera. */
  readonly facing?: CameraFacing;
}

/** What `startCapture` needs from a live preview; `createCapturePreview` is the browser's. */
export interface PreviewSink {
  /** `facing`: the camera in use; the picture is mirrored for the front camera only. */
  show(stream: CameraStream, facing?: CameraFacing): void;
  draw(frame: TrackerFrame): void;
  close(): void;
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
  | { readonly ok: true; readonly session: CaptureSession; readonly camera: CameraInUse }
  | { readonly ok: false; readonly problem: CaptureProblem }
  /** Cancelled by `signal`, or the page was hidden before the camera was requested or opened. */
  | { readonly ok: false; readonly cancelled: true };

export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
};

/**
 * What is asked for each camera. The back camera is asked for with an `exact`
 * facing, so that a device without one refuses instead of quietly giving the
 * front camera. The front camera is asked for as before, as a preference:
 * desktop webcams and Chromium's fake camera report no facing at all, and an
 * `exact` "user" would refuse them.
 */
export function cameraConstraints(facing: CameraFacing): MediaStreamConstraints {
  if (facing === "user") return CAMERA_CONSTRAINTS;
  return { audio: false, video: { facingMode: { exact: "environment" }, width: { ideal: 640 }, height: { ideal: 480 } } };
}

const otherCamera = (facing: CameraFacing): CameraFacing => (facing === "user" ? "environment" : "user");

/**
 * Whether a refused request for `facing` is worth trying the other camera:
 * the chosen camera is missing (only an `exact` request can say so; a
 * preference for the front camera that finds nothing means no camera at all)
 * or it could not be opened. A refused permission is never tried again.
 */
function tryOtherCamera(facing: CameraFacing, problem: CaptureProblem): boolean {
  return problem === "busy" || (problem === "no_camera" && facing === "environment");
}

/**
 * The camera a stream came from: the facing its track reports, else the one
 * the successful request named. (A camera that reports none, such as a
 * desktop webcam, is taken as the one asked for.)
 */
function facingOf(stream: CameraStream, asked: CameraFacing): CameraFacing {
  for (const track of stream.getTracks()) {
    let reported: string | undefined;
    try {
      reported = track.getSettings?.().facingMode;
    } catch {
      reported = undefined;
    }
    if (reported === "user" || reported === "environment") return reported;
  }
  return asked;
}

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
  const chosen = options.facing ?? "user";
  let stream: CameraStream;
  let asked = chosen;
  try {
    stream = await environment.getUserMedia(cameraConstraints(chosen));
  } catch (error) {
    const first = cameraProblem(error);
    if (signal?.aborted === true) {
      tracker.close();
      return cancelled;
    }
    if (!tryOtherCamera(chosen, first)) {
      tracker.close();
      return { ok: false, problem: first };
    }
    if (givenUp()) {
      tracker.close();
      return cancelled;
    }
    // The chosen camera is missing or would not open: the other one (card NG-43).
    asked = otherCamera(chosen);
    try {
      stream = await environment.getUserMedia(cameraConstraints(asked));
    } catch (again) {
      tracker.close();
      // Read again: the signal may have been raised while the second request was open.
      if ((signal as AbortSignal | undefined)?.aborted === true) return cancelled;
      const second = cameraProblem(again);
      // "No camera" for the chosen one says nothing about the other: then the other's answer counts.
      return { ok: false, problem: second === "denied" || first === "no_camera" ? second : first };
    }
  }
  const used = facingOf(stream, asked);
  const inUse: CameraInUse = { facing: used, fellBack: used !== chosen };
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

  /** The preview only shows; whatever goes wrong in it, the capture goes on. */
  const preview = (call: (sink: PreviewSink) => void): void => {
    if (options.preview === undefined) return;
    try {
      call(options.preview);
    } catch {
      // Nothing: the live line still says what is seen.
    }
  };
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
    preview((sink) => sink.close());
    const frames = recorded;
    recorded = [];
    options.onStep?.("stopped");
    finish(end);
    return frames;
  };

  signal?.addEventListener("abort", () => shutDown({ kind: "stopped" }), { once: true });
  preview((sink) => sink.show(stream, inUse.facing));
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
      if (running) preview((sink) => sink.draw(tracked));
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
  return { ok: true, session, camera: inUse };
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
// The live preview (card NG-42): the camera's picture with the tracked hand
// points and the shoulders drawn over it, so that the caregiver sees whether a
// sign is in the picture. The front camera's picture is mirrored like a
// mirror; the back camera's is not, as in a photo app (card NG-43). Only the
// displayed video is mirrored (CSS); the tracker keeps getting the unflipped
// frames of the hidden source video, from either camera. Nothing of the
// picture is kept, copied or sent.

/** The bones of a MediaPipe hand: pairs of its 21 point indices. */
export const HAND_CONNECTIONS: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

/** Colours of the child's own left and right hand and of the shoulders; far apart, and visible on a dark or light picture. */
export const PREVIEW_COLOURS = { left: "#ff8c1a", right: "#1ad1ff", shoulders: "#ffe14d" } as const;

/**
 * Where a tracker point (x and y normalised to the unflipped camera picture)
 * is on the preview: the picture of `imageWidth` × `imageHeight` is fitted
 * whole into a box of `boxWidth` × `boxHeight` (CSS `object-fit: contain`,
 * centred) and, when `mirrored` (the front camera), flipped left to right, so
 * x becomes 1 − x.
 */
export function previewPoint(x: number, y: number, imageWidth: number, imageHeight: number, boxWidth: number, boxHeight: number, mirrored = true): [number, number] {
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return [(boxWidth - width) / 2 + (mirrored ? 1 - x : x) * width, (boxHeight - height) / 2 + y * height];
}

/** The preview is mirrored for the front camera only (card NG-43); a camera of unknown facing counts as the front one, as before. */
export function previewMirrored(facing: CameraFacing | undefined): boolean {
  return facing !== "environment";
}

export type PreviewPoint = readonly [number, number];

/** What the preview draws for one frame, in box pixels. No hands: nothing at all (the canvas is cleared). */
export interface PreviewShapes {
  /** The child's own hands; "L" and "R" in the drawing. */
  readonly hands: readonly { readonly side: "left" | "right"; readonly points: readonly PreviewPoint[] }[];
  readonly shoulders: readonly [PreviewPoint, PreviewPoint] | null;
}

/**
 * The shapes of one tracked frame on a box of `boxWidth` × `boxHeight`.
 * Hands are sided as on the live line (`toLandmarkFrame`: the child's own
 * left and right, with either camera). `shoulders` are those to draw,
 * normalised to the picture (the last ones pose saw; pose runs on every
 * POSE_EVERY-th frame only). `mirrored` as the video (front camera: true).
 */
export function previewShapes(frame: TrackerFrame, shoulders: readonly [TrackerPoint, TrackerPoint] | null, boxWidth: number, boxHeight: number, mirrored = true): PreviewShapes {
  if (!(frame.imageWidth > 0 && frame.imageHeight > 0 && boxWidth > 0 && boxHeight > 0)) return { hands: [], shoulders: null };
  const sided = toLandmarkFrame(frame, frame.timestampMs);
  const place = (x: number, y: number): PreviewPoint => previewPoint(x, y, frame.imageWidth, frame.imageHeight, boxWidth, boxHeight, mirrored);
  const hands: { side: "left" | "right"; points: PreviewPoint[] }[] = [];
  for (const side of ["left", "right"] as const) {
    const points = sided[side];
    // toLandmarkFrame gives pixels of the tracker's picture; back to 0..1 for the box.
    if (points !== null) hands.push({ side, points: points.map(([x, y]) => place(x / frame.imageWidth, y / frame.imageHeight)) });
  }
  if (hands.length === 0) return { hands: [], shoulders: null };
  return { hands, shoulders: shoulders === null ? null : [place(shoulders[0].x, shoulders[0].y), place(shoulders[1].x, shoulders[1].y)] };
}

/** The shoulders of a frame for the preview, normalised, or null; a frame without a pose result keeps `held`. */
function previewShoulders(frame: TrackerFrame, held: readonly [TrackerPoint, TrackerPoint] | null): readonly [TrackerPoint, TrackerPoint] | null {
  if (frame.poseRan === false) return held;
  const sided = shouldersOf(frame);
  if (sided === null) return null;
  const [left, right] = sided;
  return [{ x: left[0] / frame.imageWidth, y: left[1] / frame.imageHeight }, { x: right[0] / frame.imageWidth, y: right[1] / frame.imageHeight }];
}

/** The 2D drawing calls the preview uses; a test passes a recorder. */
type PreviewContext = Pick<CanvasRenderingContext2D,
  "clearRect" | "beginPath" | "moveTo" | "lineTo" | "stroke" | "arc" | "fill" | "fillText" | "strokeText"
  | "strokeStyle" | "fillStyle" | "lineWidth" | "lineJoin" | "lineCap" | "font" | "textAlign" | "textBaseline">;

/** Clears the canvas and draws `shapes` on it: bones and joints of each hand in its colour with "L"/"R", and the shoulder line. */
export function drawPreviewShapes(context: PreviewContext, shapes: PreviewShapes, width: number, height: number): void {
  context.clearRect(0, 0, width, height);
  if (shapes.hands.length === 0) return;
  const unit = Math.max(1.5, Math.min(width, height) / 150);
  context.lineJoin = "round";
  context.lineCap = "round";
  const dot = (point: PreviewPoint, radius: number): void => {
    context.beginPath();
    context.arc(point[0], point[1], radius, 0, Math.PI * 2);
    context.fill();
  };
  if (shapes.shoulders !== null) {
    const [left, right] = shapes.shoulders;
    context.strokeStyle = PREVIEW_COLOURS.shoulders;
    context.fillStyle = PREVIEW_COLOURS.shoulders;
    context.lineWidth = unit * 1.5;
    context.beginPath();
    context.moveTo(left[0], left[1]);
    context.lineTo(right[0], right[1]);
    context.stroke();
    dot(left, unit * 3);
    dot(right, unit * 3);
  }
  for (const hand of shapes.hands) {
    const colour = PREVIEW_COLOURS[hand.side];
    context.strokeStyle = colour;
    context.fillStyle = colour;
    context.lineWidth = unit * 1.5;
    context.beginPath();
    for (const [from, to] of HAND_CONNECTIONS) {
      const a = hand.points[from];
      const b = hand.points[to];
      if (a === undefined || b === undefined) continue;
      context.moveTo(a[0], a[1]);
      context.lineTo(b[0], b[1]);
    }
    context.stroke();
    for (const point of hand.points) dot(point, unit * 1.8);
    const wrist = hand.points[0];
    if (wrist !== undefined) {
      context.font = `700 ${Math.round(unit * 9)}px system-ui, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "top";
      context.lineWidth = unit * 2;
      context.strokeStyle = "#000000";
      const label = hand.side === "left" ? "L" : "R";
      context.strokeText(label, wrist[0], wrist[1] + unit * 3);
      context.fillText(label, wrist[0], wrist[1] + unit * 3);
    }
  }
}

/** A live preview in the page: `element` is a box of fixed size (set by the page's CSS) that holds the video and the canvas while the camera runs. */
export interface CapturePreview extends PreviewSink {
  readonly element: HTMLElement;
}

/**
 * The browser's preview. `show` puts a muted `<video>` on the camera's stream
 * and a canvas over it into `element`, and marks the box `data-mirrored`
 * "true" for the front camera, "false" for the back one (the stylesheet
 * mirrors the video of a mirrored box only); `draw` draws the points of a
 * frame to match; `close` stops the video and empties `element`. The box
 * keeps its size either way, so nothing around it moves when the camera
 * starts or stops.
 */
export function createCapturePreview(doc: Document): CapturePreview {
  const element = doc.createElement("div");
  element.className = "capture-preview";
  element.dataset["camera"] = "off";
  // The picture is for seeing the framing; the live line says the same in words.
  element.setAttribute("aria-hidden", "true");
  let video: HTMLVideoElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let shoulders: readonly [TrackerPoint, TrackerPoint] | null = null;
  let mirrored = true;
  const close = (): void => {
    if (video !== null) {
      video.pause();
      video.srcObject = null;
    }
    video = null;
    canvas = null;
    shoulders = null;
    element.replaceChildren();
    element.dataset["camera"] = "off";
    delete element.dataset["mirrored"];
  };
  return {
    element,
    show(stream, facing) {
      close();
      mirrored = previewMirrored(facing);
      element.dataset["mirrored"] = String(mirrored);
      video = doc.createElement("video");
      video.className = "capture-preview-video";
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.srcObject = stream as MediaStream;
      canvas = doc.createElement("canvas");
      canvas.className = "capture-preview-points";
      element.replaceChildren(video, canvas);
      element.dataset["camera"] = "on";
      void video.play().catch(() => undefined);
    },
    draw(frame) {
      if (canvas === null) return;
      shoulders = previewShoulders(frame, shoulders);
      // The canvas covers the box; its pixels follow the box's size on screen.
      const ratio = doc.defaultView?.devicePixelRatio ?? 1;
      const width = Math.round(canvas.clientWidth * ratio);
      const height = Math.round(canvas.clientHeight * ratio);
      if (!(width > 0 && height > 0)) return;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const context = canvas.getContext("2d");
      if (context === null) return;
      drawPreviewShapes(context, previewShapes(frame, shoulders, width, height, mirrored), width, height);
    },
    close,
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
  // The video is only a frame source and is never shown; a preview (card NG-42) has its own, mirrored video.
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
  /**
   * `startCapture` with the browser's camera and tracker; `host` receives the
   * hidden video element. Without `options.facing` the camera chosen on this
   * device is used (`loadCameraFacing`, card NG-43): the child's gesture view
   * passes none and so follows the choice made in the camera test or teaching.
   */
  start(host: HTMLElement, options: CaptureOptions): Promise<CaptureStart>;
  readonly text: typeof CAPTURE_TEXT;
  readonly nextShoulders: typeof nextShoulders;
  /** A live preview for `start`'s `preview` (card NG-42); absent in an older bridge or a test's. */
  readonly createPreview?: (doc: Document) => CapturePreview;
}

/** What the bridge uses of the browser; a test passes fakes. */
export interface CaptureBridgeParts {
  readonly environment?: (host: HTMLElement) => CaptureEnvironment;
  /** Where the camera choice is remembered; default `browserFacingStorage`. */
  readonly storage?: () => FacingStorage | null;
}

export function captureBridge(options: BrowserCaptureOptions = {}, parts: CaptureBridgeParts = {}): CaptureBridge {
  const environment = parts.environment ?? ((host: HTMLElement) => browserEnvironment(host, options));
  const storage = parts.storage ?? browserFacingStorage;
  return {
    start: (host, captureOptions) => startCapture(environment(host), { ...captureOptions, facing: captureOptions.facing ?? loadCameraFacing(storage()) }),
    text: CAPTURE_TEXT,
    nextShoulders,
    createPreview: createCapturePreview,
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
 * `CAPTURE_ROUTE`: the camera choice "Kamera: vorne / hinten" (card NG-43,
 * remembered in `storage` and shared with teaching and the child's gesture
 * view), a start button, the camera picture with the tracked points while the
 * camera runs (card NG-42; mirrored for the front camera only), a live line
 * with 0, 1 or 2 hands, a stop button and a way back to the board. The board
 * is not touched. `environment` replaces the browser's camera and tracker;
 * for tests.
 */
export function mountCaptureEntry(
  doc: Document, region: HTMLElement, options: BrowserCaptureOptions = {},
  storage: () => FacingStorage | null = browserFacingStorage,
  environment: (host: HTMLElement) => CaptureEnvironment = (host) => browserEnvironment(host, options),
): void {
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
    /** Holds the preview of the current attempt; empty (and not shown) while the camera is off. */
    const previewHolder = element(doc, "div", "capture-preview-holder");
    const start = element(doc, "button", "capture-start", CAPTURE_TEXT.start);
    start.type = "button";
    const stopButton = element(doc, "button", "capture-stop", CAPTURE_TEXT.stop);
    stopButton.type = "button";
    stopButton.hidden = true;
    const back = element(doc, "button", "capture-back", CAPTURE_TEXT.back);
    back.type = "button";
    // The camera choice (card NG-43). It can be changed while the camera is off; "Kamera stoppen" first otherwise.
    let chosen = loadCameraFacing(storage());
    const choice = element(doc, "div", "camera-choice");
    choice.setAttribute("role", "group");
    choice.setAttribute("aria-label", "Kamera");
    const choiceButtons = (["user", "environment"] as const).map((facing) => {
      const option = element(doc, "button", "camera-choice-button", CAPTURE_TEXT.camera[facing]);
      option.type = "button";
      option.dataset["facing"] = facing;
      option.addEventListener("click", () => {
        if (option.disabled || cancel !== null) return;
        chosen = facing;
        saveCameraFacing(storage(), facing);
        showChoice();
      });
      return option;
    });
    const showChoice = (): void => {
      for (const option of choiceButtons) option.setAttribute("aria-pressed", String(option.dataset["facing"] === chosen));
      region.dataset["cameraChoice"] = chosen;
    };
    choice.append(element(doc, "span", "camera-choice-label", CAPTURE_TEXT.camera.label), ...choiceButtons);
    showChoice();
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
      for (const option of choiceButtons) option.disabled = false;
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
      // The camera's picture with the tracked points (card NG-42); emptied and taken out on every end of this attempt.
      const preview = createCapturePreview(doc);
      const dropPreview = (): void => {
        preview.close();
        preview.element.remove();
      };
      const ownCancel = (): void => {
        controller.abort();
        session?.stop();
        dropPreview();
      };
      cancel = ownCancel;
      const finished = (): void => {
        if (cancel === ownCancel) cancel = null;
      };
      start.disabled = true;
      for (const option of choiceButtons) option.disabled = true;
      seen.textContent = "";
      previewHolder.replaceChildren(preview.element);
      const facing = chosen;
      void startCapture(environment(region), {
        signal: controller.signal,
        preview,
        facing,
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
          dropPreview();
          if ("problem" in started) idle(CAPTURE_TEXT.problems[started.problem], started.problem);
          else idle(CAPTURE_TEXT.stopped, null);
          return;
        }
        session = started.session;
        if (controller.signal.aborted) session.stop();
        else {
          start.hidden = true;
          stopButton.hidden = false;
          // The other camera is used: said in the status line while it runs.
          if (started.camera?.fellBack === true) show(CAPTURE_TEXT.cameraFallback[facing], null);
        }
        void started.session.ended.then((end) => {
          finished();
          dropPreview();
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
    region.replaceChildren(heading, intro, choice, start, stopButton, status, seen, previewHolder, back);
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
