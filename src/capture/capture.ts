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
import type { Delegate, TrackerReply, TrackerRequest } from "./tracker-worker.js";

/** Pose (for the shoulders) runs on every this many frames; the matcher takes the median shoulders of a capture. */
export const POSE_EVERY = 5;
/** A recording keeps at most this many frames, the newest; about a minute at 10 frames per second. */
export const MAX_RECORDED_FRAMES = 600;
/** How long the tracker may take to load and start. */
export const TRACKER_START_TIMEOUT_MS = 60_000;
/** Cache names of the tracker files start with this; the board's service worker never deletes them. */
export const TRACKER_CACHE_PREFIX = "amysecho-tracker-";

export type CaptureProblem = "denied" | "no_camera" | "busy" | "unsupported" | "tracker_unavailable" | "tracker_failed";
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
    tracker_unavailable: "Die Handerkennung konnte nicht geladen werden. Beim ersten Mal braucht sie Internet (etwa 25 MB). Die Tafel funktioniert auch ohne.",
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
  startTracker(): Promise<TrackerClient>;
  getUserMedia(constraints: MediaStreamConstraints): Promise<CameraStream>;
  openFrames(stream: CameraStream): Promise<FrameSource>;
}

export interface CaptureOptions {
  /** Keep the landmark frames of this capture in memory, for `stop()` to return. Default false. */
  readonly record?: boolean;
  readonly maxRecordedFrames?: number;
  readonly onStep?: (step: CaptureStep) => void;
  /** Every tracked frame, as it arrives. */
  readonly onFrame?: (frame: TrackerFrame) => void;
}

export type CaptureEnd = { readonly kind: "stopped" } | { readonly kind: "problem"; readonly problem: CaptureProblem };

export interface CaptureSession {
  /** Ends the capture: camera off, tracker closed. Returns the recorded frames (empty without `record`) and forgets them. Safe to call twice. */
  stop(): TrackerFrame[];
  /** Settles when the capture ends, by `stop()` or by a problem. */
  readonly ended: Promise<CaptureEnd>;
}

export type CaptureStart =
  | { readonly ok: true; readonly session: CaptureSession }
  | { readonly ok: false; readonly problem: CaptureProblem };

export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
};

/**
 * Starts a capture: first the tracker (so that a tracker that cannot load
 * never costs a camera prompt), then the camera, then the frame loop.
 */
export async function startCapture(environment: CaptureEnvironment, options: CaptureOptions = {}): Promise<CaptureStart> {
  options.onStep?.("preparing");
  let tracker: TrackerClient;
  try {
    tracker = await environment.startTracker();
  } catch {
    return { ok: false, problem: "tracker_unavailable" };
  }
  options.onStep?.("asking");
  let stream: CameraStream;
  try {
    stream = await environment.getUserMedia(CAMERA_CONSTRAINTS);
  } catch (error) {
    tracker.close();
    return { ok: false, problem: cameraProblem(error) };
  }
  let source: FrameSource;
  try {
    source = await environment.openFrames(stream);
  } catch {
    for (const track of stream.getTracks()) track.stop();
    tracker.close();
    return { ok: false, problem: "busy" };
  }

  const limit = Math.max(1, options.maxRecordedFrames ?? MAX_RECORDED_FRAMES);
  let recorded: TrackerFrame[] = [];
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
      try {
        result = await tracker.detect(frame.image, timestampMs, index % POSE_EVERY === 0);
      } catch {
        if (running) shutDown({ kind: "problem", problem: "tracker_failed" });
        return;
      }
      index += 1;
      if (!running) return;
      const tracked: TrackerFrame = { timestampMs, imageWidth: frame.width, imageHeight: frame.height, hands: result.hands, pose: result.pose };
      if (options.record === true) {
        recorded.push(tracked);
        if (recorded.length > limit) recorded.splice(0, recorded.length - limit);
      }
      options.onFrame?.(tracked);
    }
  })();

  return { ok: true, session: { stop: () => shutDown({ kind: "stopped" }), ended } };
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
  /** Name of the cache that holds exactly these files; starts with `TRACKER_CACHE_PREFIX`. */
  readonly cache: string;
  readonly files: readonly { readonly path: string; readonly sha256: string; readonly bytes: number }[];
}

export function parseTrackerManifest(value: unknown): TrackerManifest {
  const manifest = value as Partial<TrackerManifest> | null;
  if (manifest === null || typeof manifest !== "object" || typeof manifest.cache !== "string"
    || !manifest.cache.startsWith(TRACKER_CACHE_PREFIX) || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("tracker manifest is malformed");
  }
  for (const file of manifest.files) {
    if (typeof file?.path !== "string" || !/^[a-z0-9_./-]+$/i.test(file.path) || file.path.includes("..")
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

/**
 * Makes sure the tracker cache holds every file of the manifest, each checked
 * against its sha256 before it is put in, and then the manifest itself, which
 * marks the cache complete. Older tracker caches are removed afterwards.
 * Returns "cached", or "no-cache" where the browser has no Cache API (the
 * tracker then loads from the network). Throws when a file cannot be fetched
 * or does not match; the board is not affected either way.
 */
export async function prepareTrackerFiles(manifestUrl: string, environment: TrackerFileEnvironment): Promise<"cached" | "no-cache"> {
  if (environment.caches === undefined) return "no-cache";
  let manifestResponse: Response;
  try {
    manifestResponse = await environment.fetch(manifestUrl, { cache: "no-cache" });
    if (!manifestResponse.ok) throw new Error(`HTTP ${manifestResponse.status}`);
  } catch (error) {
    // Offline and not controlled by the service worker: a complete cache from earlier still works.
    for (const name of await environment.caches.keys()) {
      if (!name.startsWith(TRACKER_CACHE_PREFIX)) continue;
      const cached = await (await environment.caches.open(name)).match(manifestUrl);
      if (cached !== undefined) return "cached";
    }
    throw error;
  }
  const manifestBytes = await manifestResponse.arrayBuffer();
  const manifest = parseTrackerManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));
  const cache = await environment.caches.open(manifest.cache);
  if (await cache.match(manifestUrl) === undefined) {
    // The tracker files are large; ask the browser not to evict them under storage pressure.
    await environment.persist?.().catch(() => false);
    for (const file of manifest.files) {
      const url = new URL(file.path, manifestUrl).href;
      if (await cache.match(url) !== undefined) continue;
      const response = await environment.fetch(url, { cache: "no-cache" });
      if (!response.ok) throw new Error(`tracker file ${file.path}: HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== file.bytes || await environment.sha256(bytes) !== file.sha256) {
        throw new Error(`tracker file ${file.path} does not match its checksum`);
      }
      const type = response.headers.get("content-type");
      await cache.put(url, new Response(bytes, type === null ? {} : { headers: { "content-type": type } }));
    }
    await cache.put(manifestUrl, new Response(manifestBytes, { headers: { "content-type": "application/json" } }));
  }
  for (const name of await environment.caches.keys()) {
    if (name.startsWith(TRACKER_CACHE_PREFIX) && name !== manifest.cache) await environment.caches.delete(name);
  }
  return "cached";
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

async function startWorkerTracker(options: BrowserCaptureOptions): Promise<TrackerClient> {
  const manifestUrl = new URL("../vendor/mediapipe/manifest.json", import.meta.url).href;
  await prepareTrackerFiles(manifestUrl, {
    caches: typeof caches === "undefined" ? undefined : caches,
    fetch: (url, init) => fetch(url, init),
    sha256: async (bytes) => hex(await crypto.subtle.digest("SHA-256", bytes)),
    persist: async () => (await navigator.storage?.persist?.()) ?? false,
  });
  const worker = new Worker(new URL("./tracker-worker.js", import.meta.url), { type: "module" });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("tracker start timed out")), TRACKER_START_TIMEOUT_MS);
    const done = (error: Error | null): void => {
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      if (error === null) resolve();
      else {
        worker.terminate();
        reject(error);
      }
    };
    const onMessage = (event: MessageEvent<TrackerReply>): void => {
      if (event.data.type === "ready") done(null);
      else if (event.data.type === "error") done(new Error(event.data.message));
    };
    const onError = (): void => done(new Error("tracker worker failed to load"));
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage({ type: "init", delegate: options.delegate ?? "CPU", pose: options.pose ?? true } satisfies TrackerRequest);
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
    startTracker: () => startWorkerTracker(options),
    getUserMedia: async (constraints) => {
      if (typeof navigator === "undefined" || navigator.mediaDevices?.getUserMedia === undefined) {
        throw Object.assign(new Error("no getUserMedia"), { name: "NotSupportedError" });
      }
      return navigator.mediaDevices.getUserMedia(constraints);
    },
    openFrames: (stream) => videoFrames(stream, host),
  };
}

// ---------------------------------------------------------------------------
// The capture entry: `index.html#kamera-testen` (card NG-3). Teaching and
// recognising come with cards NG-19 and NG-20 in the caregiver area.

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
  let session: CaptureSession | null = null;
  let attempt = 0;
  const stop = (): void => {
    attempt += 1;
    session?.stop();
    session = null;
  };
  const render = (): void => {
    stop();
    if (doc.defaultView?.location.hash !== CAPTURE_ROUTE) {
      region.replaceChildren();
      region.hidden = true;
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
      status.textContent = text;
      if (problem === null) delete region.dataset["captureProblem"];
      else region.dataset["captureProblem"] = problem;
    };
    start.addEventListener("click", () => {
      if (session !== null) return;
      const mine = ++attempt;
      start.disabled = true;
      seen.textContent = "";
      void startCapture(browserEnvironment(region, options), {
        onStep: (step) => {
          if (mine !== attempt) return;
          region.dataset["captureStep"] = step;
          if (step !== "stopped") show(CAPTURE_TEXT[step], null);
        },
        onFrame: (frame) => {
          if (mine !== attempt) return;
          const summary = frameSummary(frame);
          seen.dataset["hands"] = String(summary.hands);
          seen.textContent = `${CAPTURE_TEXT.hands[summary.hands]} ${CAPTURE_TEXT.shoulders[summary.shoulders ? 1 : 0]}`;
        },
      }).then((started) => {
        if (mine !== attempt) {
          if (started.ok) started.session.stop();
          return;
        }
        if (!started.ok) {
          start.disabled = false;
          show(CAPTURE_TEXT.problems[started.problem], started.problem);
          return;
        }
        session = started.session;
        start.hidden = true;
        stopButton.hidden = false;
        void started.session.ended.then((end) => {
          if (mine !== attempt && end.kind === "stopped") return;
          session = null;
          start.hidden = false;
          start.disabled = false;
          stopButton.hidden = true;
          seen.textContent = "";
          seen.dataset["hands"] = "";
          show(end.kind === "problem" ? CAPTURE_TEXT.problems[end.problem] : CAPTURE_TEXT.stopped, end.kind === "problem" ? end.problem : null);
        });
      });
    });
    stopButton.addEventListener("click", () => {
      session?.stop();
    });
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
  // The camera never runs in the background: hiding the page ends the capture.
  doc.addEventListener("visibilitychange", () => {
    if (doc.visibilityState === "hidden") session?.stop();
  });
  view?.addEventListener("pagehide", () => session?.stop());
  render();
}

// Wires the entry when loaded by index.html; importing this module elsewhere (a Node test, the browser test) does nothing more.
if (typeof document !== "undefined") {
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
