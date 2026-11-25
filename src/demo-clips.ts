/**
 * Demo clips ("Vormachen", card NG-56): a caregiver's own short video of a
 * gesture, one per concept of a profile, for the child to watch and imitate.
 *
 * Layout, inside one profile (next to the board data of board-data.ts):
 *
 *   data "demo.<conceptId>"   { version: 1, dataUrl }
 *
 * `dataUrl` is a base64 WebM or MP4 video data URL of at most
 * `MAX_DEMO_DATA_URL_LENGTH` characters, as the browser's recorder made it on
 * the device (no sound is recorded). Being plain JSON, a clip travels in the
 * profile export like a picture, so a backup restores it on another device,
 * and it goes with the profile when the profile is deleted.
 *
 * Product rule (docs/s0a-product-contract-v0.1.md, section 6): a clip shows an
 * adult, never the child; it is made only by an explicit caregiver action that
 * says what is kept; it is never uploaded and never part of the repository.
 *
 * Writes are strict (nothing invalid is stored, a newer version's clip is not
 * overwritten); reads are tolerant and report a damaged clip instead of throwing.
 */
import { isBoardConceptId } from "./board-data.js";
import type { ProfileStore } from "./profiles/store.js";

export const DEMO_CLIP_VERSION = 1;
/** Longest recording, in milliseconds: a gesture, not a story. */
export const DEMO_MAX_MS = 5000;
/** Longest stored clip, in characters of its data URL (2 MiB, about 1.5 MB of video; five seconds at the recorder's rate need far less). */
export const MAX_DEMO_DATA_URL_LENGTH = 2 * 1024 * 1024;
const DEMO_NAME_PREFIX = "demo.";
/** A video data URL as a recorder makes it: the type, maybe its codecs, then base64. */
const DEMO_DATA_URL_PATTERN = /^data:video\/(?:webm|mp4)(?:; ?codecs="?[a-z0-9.,+ -]{1,60}"?)?;base64,[A-Za-z0-9+/]+={0,2}$/i;

export type StoredDemoClip =
  | { readonly state: "ok"; readonly dataUrl: string }
  | { readonly state: "missing" }
  | { readonly state: "damaged"; readonly damage: "unsupported-version" | "unreadable" };

export type DemoClipErrorKind = "invalid-concept-id" | "invalid-clip" | "unsupported-entry";

/** A clip was refused; nothing was written. */
export class DemoClipError extends Error {
  readonly kind: DemoClipErrorKind;

  constructor(kind: DemoClipErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export function isDemoDataUrl(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_DEMO_DATA_URL_LENGTH && DEMO_DATA_URL_PATTERN.test(value);
}

/** The data name of a concept's clip. */
export function demoName(conceptId: string): string {
  return `${DEMO_NAME_PREFIX}${conceptId}`;
}

/** Strict reader for one stored clip: exactly `version` and `dataUrl`. */
export function readDemoEntry(value: unknown): StoredDemoClip {
  if (value === undefined) return { state: "missing" };
  const unreadable: StoredDemoClip = { state: "damaged", damage: "unreadable" };
  if (typeof value !== "object" || value === null || Array.isArray(value)) return unreadable;
  const record = value as Record<string, unknown>;
  const version = record["version"];
  if (version !== DEMO_CLIP_VERSION) {
    return typeof version === "number" && version > DEMO_CLIP_VERSION ? { state: "damaged", damage: "unsupported-version" } : unreadable;
  }
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== "dataUrl" || keys[1] !== "version") return unreadable;
  return isDemoDataUrl(record["dataUrl"]) ? { state: "ok", dataUrl: record["dataUrl"] } : unreadable;
}

export async function readDemoClip(store: ProfileStore, profileId: string, conceptId: string): Promise<StoredDemoClip> {
  if (!isBoardConceptId(conceptId)) return { state: "missing" };
  return readDemoEntry(await store.data(profileId).get(demoName(conceptId)));
}

/**
 * The concept ids of a profile that have a stored clip entry, sorted, read
 * from the data names only (a clip itself is not read). An entry may still
 * turn out damaged when it is read.
 */
export async function listDemoClipIds(store: ProfileStore, profileId: string): Promise<string[]> {
  const names = await store.data(profileId).names();
  return names
    .filter((name) => name.startsWith(DEMO_NAME_PREFIX))
    .map((name) => name.slice(DEMO_NAME_PREFIX.length))
    .filter((id) => isBoardConceptId(id))
    .sort();
}

/**
 * Stores the clip of one concept, replacing an earlier one. Refused: an id
 * that is not a concept id, a value that is not a video data URL within the
 * size cap, and replacing a clip a newer app version stored. A profile that
 * would outgrow one export rejects with the store's `ProfileSizeError`.
 */
export async function setDemoClip(store: ProfileStore, profileId: string, conceptId: string, dataUrl: unknown): Promise<void> {
  if (!isBoardConceptId(conceptId)) throw new DemoClipError("invalid-concept-id", "not a concept id");
  if (!isDemoDataUrl(dataUrl)) throw new DemoClipError("invalid-clip", `a clip is a base64 WebM or MP4 data URL of at most ${MAX_DEMO_DATA_URL_LENGTH} characters`);
  const stored = await readDemoClip(store, profileId, conceptId);
  if (stored.state === "damaged" && stored.damage === "unsupported-version") {
    throw new DemoClipError("unsupported-entry", `the clip of "${conceptId}" was stored by a newer version`);
  }
  await store.data(profileId).set(demoName(conceptId), { version: DEMO_CLIP_VERSION, dataUrl });
}

/** Deletes the clip of one concept, whatever it holds (a caregiver asked for it); deleting a missing clip is no error. */
export async function removeDemoClip(store: ProfileStore, profileId: string, conceptId: string): Promise<void> {
  if (!isBoardConceptId(conceptId)) return;
  const data = store.data(profileId);
  if ((await data.get(demoName(conceptId))) === undefined) return;
  await data.delete(demoName(conceptId));
}

// --- Recording in the browser ---

/** Why a recording did not become a clip: "unsupported" (no camera or recorder here), "too-large" (over the size cap), "unreadable" (nothing usable came out). */
export class DemoRecordingRefusal extends Error {
  readonly reason: "unsupported" | "too-large" | "unreadable";

  constructor(reason: "unsupported" | "too-large" | "unreadable") {
    super(`clip refused: ${reason}`);
    this.reason = reason;
  }
}

/** A camera opened for one clip: its picture to show, and one recording. */
export interface DemoCamera {
  /** The camera's stream, for a live picture (`video.srcObject`). */
  readonly stream: MediaStream;
  /** Starts the recording. */
  start(): void;
  /** Ends the recording and gives what was recorded. */
  stop(): Promise<Blob>;
  /** Stops the camera; a running recording is dropped. Safe to call more than once. */
  close(): void;
}

/** The recorder formats tried, best first; the first one the browser supports is used. */
const DEMO_TYPES = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"] as const;
/** Bits per second asked of the recorder: a small clip, still clear enough to see hands. */
export const DEMO_BITS_PER_SECOND = 600_000;

/**
 * Opens the front camera without sound (`facing`: which camera) and prepares
 * a `MediaRecorder` on it. Rejects with the `getUserMedia` error when the
 * camera cannot be opened, and with `DemoRecordingRefusal("unsupported")`
 * when this browser has no camera access or no recorder.
 */
export async function openDemoCamera(facing: "user" | "environment" = "user"): Promise<DemoCamera> {
  const devices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  if (devices === undefined || typeof devices.getUserMedia !== "function" || typeof MediaRecorder === "undefined") {
    throw new DemoRecordingRefusal("unsupported");
  }
  const stream = await devices.getUserMedia({ audio: false, video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } } });
  const stopTracks = (): void => {
    for (const track of stream.getTracks()) track.stop();
  };
  const mimeType = DEMO_TYPES.find((type) => typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(type));
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { ...(mimeType === undefined ? {} : { mimeType }), videoBitsPerSecond: DEMO_BITS_PER_SECOND });
  } catch {
    stopTracks();
    throw new DemoRecordingRefusal("unsupported");
  }
  const chunks: Blob[] = [];
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  let closed = false;
  return {
    stream,
    start() {
      if (closed || recorder.state !== "inactive") return;
      chunks.length = 0;
      recorder.start();
    },
    stop() {
      return new Promise<Blob>((resolve, reject) => {
        if (recorder.state === "inactive") {
          reject(new DemoRecordingRefusal("unreadable"));
          return;
        }
        recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" })), { once: true });
        recorder.stop();
      });
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        // The camera is stopped below either way.
      }
      stopTracks();
    },
  };
}

/** Reads a recorded clip as the data URL that is stored; refuses what is too large or not a video. */
export async function clipFromBlob(blob: Blob): Promise<string> {
  // Base64 makes four characters of three bytes: refused before it is read.
  if (Math.ceil(blob.size / 3) * 4 > MAX_DEMO_DATA_URL_LENGTH) throw new DemoRecordingRefusal("too-large");
  if (blob.size === 0) throw new DemoRecordingRefusal("unreadable");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(typeof reader.result === "string" ? reader.result : ""));
    reader.addEventListener("error", () => reject(new DemoRecordingRefusal("unreadable")));
    reader.readAsDataURL(blob);
  });
  if (dataUrl.length > MAX_DEMO_DATA_URL_LENGTH) throw new DemoRecordingRefusal("too-large");
  if (!isDemoDataUrl(dataUrl)) throw new DemoRecordingRefusal("unreadable");
  return dataUrl;
}
