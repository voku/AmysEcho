/**
 * Stored gesture examples (card NG-19, docs/recognition.md "Stored examples",
 * docs/storage.md "Gesture examples").
 *
 * One example is one data entry of a profile, written through the profile
 * store: `gesture.<conceptId>.<random id>`. Its value is a versioned record
 * with the feature sequence the matcher compares, rounded to
 * `EXAMPLE_DECIMALS` decimals, and what is needed to tell whether it can be
 * compared at all (feature schema version, anchor, hands). No picture, no
 * video and no landmark is stored: the features cannot be rebuilt, so a
 * change of the feature schema means recording the examples again.
 *
 * Reading never guesses: a record that is not exactly this version, or whose
 * features are of another schema, is listed as damaged with its kind, and is
 * never dropped silently or migrated.
 */
import { isBoardConceptId } from "../board-data.js";
import type { ProfileStore, ProfileUsage } from "../profiles/store.js";
import { FEATURE_SCHEMA_VERSION, MIN_TRAVEL, SPEED_SPAN_MS, buildFeatureSequence, parseFeatureSequence } from "./features.js";
import type { Anchor, FeatureFailure, FeatureSequence, HandKind, LandmarkFrame, Point } from "./features.js";
import { toLandmarkFrames } from "./tracker-adapter.js";
import type { AdapterOptions, TrackerFrame } from "./tracker-adapter.js";

export const EXAMPLE_RECORD_VERSION = 1;
/**
 * Feature values are stored rounded to this many decimals. A two-hand example
 * is then about 21 kB instead of about 55 kB at full precision; the matcher's
 * decisions on the synthetic evaluation did not change (docs/recognition.md).
 */
export const EXAMPLE_DECIMALS = 4;
const SCALE = 10 ** EXAMPLE_DECIMALS;
/** Data names of examples start with this, then the concept id, a dot, and `EXAMPLE_ID_LENGTH` hex characters. */
export const EXAMPLE_NAME_PREFIX = "gesture.";
export const EXAMPLE_ID_LENGTH = 12;
/** Recommended examples per tile; the matcher calibrates a concept's limit only from two, and its median helps from three. */
export const RECOMMENDED_EXAMPLES = 3;
/**
 * A generous size of one stored example as the store counts it (a two-hand
 * record at four decimals is about 21 kB), for "is there still room".
 */
export const EXAMPLE_BYTES_ESTIMATE = 24 * 1024;
/** From this share of the profile's limits on, a teaching session warns before recording. */
export const USAGE_NEAR_SHARE = 0.9;

const NAME_PATTERN = /^gesture\.([a-z0-9][a-z0-9-]{0,39})\.([0-9a-f]{12})$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const RECORD_KEYS = ["anchor", "capturedAt", "conceptId", "decimals", "durationMs", "featureSchemaVersion", "frames", "hands", "steps", "version"];

/** What is stored per example. `steps` are the matcher's feature values, rounded to `decimals`. */
export interface GestureExampleRecordV1 {
  readonly version: 1;
  readonly conceptId: string;
  /** When the example was recorded, UTC (`Date.toISOString`). */
  readonly capturedAt: string;
  /** `FEATURE_SCHEMA_VERSION` of the features; another version is never compared. */
  readonly featureSchemaVersion: number;
  readonly anchor: Anchor;
  readonly hands: HandKind;
  readonly decimals: number;
  /** Frames of the recording and its length in milliseconds (first to last frame): quality facts, not used by the matcher. */
  readonly frames: number;
  readonly durationMs: number;
  readonly steps: readonly (readonly number[])[];
}

export interface StoredExample {
  /** The data name; pass it to `deleteExample`. */
  readonly name: string;
  readonly record: GestureExampleRecordV1;
  /** The record as the matcher takes it. */
  readonly sequence: FeatureSequence;
}

/**
 * "unsupported-version": a newer app wrote it (record version or feature
 * schema above this app's); probably intact, never deleted here.
 * "incompatible": features of an older schema; they cannot be compared or
 * rebuilt, the gesture has to be recorded again.
 * "unreadable": anything else.
 */
export type ExampleDamage = "unsupported-version" | "incompatible" | "unreadable";

export interface DamagedExample {
  readonly name: string;
  readonly conceptId: string;
  readonly kind: ExampleDamage;
  /** Free text for logs; not for the screen. */
  readonly reason: string;
}

export interface ExampleListing {
  /** Oldest first (by capture time, then name). */
  readonly examples: readonly StoredExample[];
  readonly damaged: readonly DamagedExample[];
}

export class ExampleFormatError extends Error {
  readonly kind: ExampleDamage;

  constructor(kind: ExampleDamage, message: string) {
    super(message);
    this.kind = kind;
  }
}

/** True for a concept id that examples can be stored under: the rule of board data (`isBoardConceptId`). */
export function isExampleConceptId(value: unknown): value is string {
  return isBoardConceptId(value);
}

export function exampleName(conceptId: string, id: string): string {
  if (!isExampleConceptId(conceptId)) throw new ExampleFormatError("unreadable", "not a concept id examples can be stored under");
  const name = `${EXAMPLE_NAME_PREFIX}${conceptId}.${id}`;
  if (!NAME_PATTERN.test(name)) throw new ExampleFormatError("unreadable", "not an example id");
  return name;
}

/** The concept id of an example's data name, or null when the name is not one. */
export function exampleConceptOf(name: string): string | null {
  return NAME_PATTERN.exec(name)?.[1] ?? null;
}

function newExampleId(): string {
  const bytes = new Uint8Array(EXAMPLE_ID_LENGTH / 2);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** One feature value as stored: `EXAMPLE_DECIMALS` decimals, never negative zero. */
export function roundFeature(value: number): number {
  const rounded = Math.round(value * SCALE) / SCALE;
  return rounded === 0 ? 0 : rounded;
}

/** Plain arrays of rounded numbers, also from typed arrays (a `Float32Array` is not JSON for the store). */
function roundedSteps(steps: ArrayLike<ArrayLike<number>>): number[][] {
  return Array.from(steps, (step) => Array.from(step, (value) => roundFeature(Number(value))));
}

export interface CaptureFacts {
  readonly capturedAt: Date;
  readonly frames: number;
  readonly durationMs: number;
}

/** The record for a sequence the matcher built. Checks the sequence and rounds it; throws `ExampleFormatError` for anything else. */
export function createExampleRecord(conceptId: string, sequence: FeatureSequence, facts: CaptureFacts): GestureExampleRecordV1 {
  if (!isExampleConceptId(conceptId)) throw new ExampleFormatError("unreadable", "not a concept id examples can be stored under");
  const time = facts.capturedAt.getTime();
  if (!Number.isFinite(time)) throw new ExampleFormatError("unreadable", "capture time is not a date");
  if (!Number.isSafeInteger(facts.frames) || facts.frames < 0) throw new ExampleFormatError("unreadable", "frames must be a count");
  const durationMs = Math.round(facts.durationMs);
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) throw new ExampleFormatError("unreadable", "duration must be milliseconds");
  const checked = parseFeatureSequence({ ...sequence, steps: roundedSteps(sequence.steps as ArrayLike<ArrayLike<number>>) });
  return {
    version: EXAMPLE_RECORD_VERSION,
    conceptId,
    capturedAt: new Date(time).toISOString(),
    featureSchemaVersion: checked.schemaVersion,
    anchor: checked.anchor,
    hands: checked.hands,
    decimals: EXAMPLE_DECIMALS,
    frames: facts.frames,
    durationMs,
    steps: checked.steps,
  };
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * A stored record, checked strictly: exactly the fields of version 1, values
 * in stored form. `conceptId`, when given, must match (the data name says
 * which concept the entry belongs to). Throws `ExampleFormatError` with the
 * kind of damage; never repairs.
 */
export function parseExampleRecord(value: unknown, conceptId?: string): { readonly record: GestureExampleRecordV1; readonly sequence: FeatureSequence } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ExampleFormatError("unreadable", "record is not an object");
  const candidate = value as Record<string, unknown>;
  const version = candidate["version"];
  if (typeof version === "number" && version > EXAMPLE_RECORD_VERSION) throw new ExampleFormatError("unsupported-version", `record version ${version}`);
  if (version !== EXAMPLE_RECORD_VERSION) throw new ExampleFormatError("unreadable", "unknown record version");
  const features = candidate["featureSchemaVersion"];
  if (typeof features === "number" && Number.isSafeInteger(features) && features > FEATURE_SCHEMA_VERSION) {
    throw new ExampleFormatError("unsupported-version", `feature schema ${features}`);
  }
  if (typeof features === "number" && Number.isSafeInteger(features) && features >= 1 && features < FEATURE_SCHEMA_VERSION) {
    throw new ExampleFormatError("incompatible", `feature schema ${features}; this app compares schema ${FEATURE_SCHEMA_VERSION}`);
  }
  if (features !== FEATURE_SCHEMA_VERSION) throw new ExampleFormatError("unreadable", "unknown feature schema");
  const keys = Object.keys(candidate).sort();
  if (keys.length !== RECORD_KEYS.length || keys.some((key, at) => key !== RECORD_KEYS[at])) throw new ExampleFormatError("unreadable", "unexpected fields");
  if (!isExampleConceptId(candidate["conceptId"]) || (conceptId !== undefined && candidate["conceptId"] !== conceptId)) {
    throw new ExampleFormatError("unreadable", "concept id does not match");
  }
  const capturedAt = candidate["capturedAt"];
  if (typeof capturedAt !== "string" || !TIMESTAMP_PATTERN.test(capturedAt)) throw new ExampleFormatError("unreadable", "capture time is malformed");
  const time = Date.parse(capturedAt);
  // Dates such as 31 February: the parsed date written back must be the stored text.
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, capturedAt.length - 1) !== capturedAt.slice(0, -1)) {
    throw new ExampleFormatError("unreadable", "capture time is not a real date");
  }
  if (candidate["decimals"] !== EXAMPLE_DECIMALS) throw new ExampleFormatError("unreadable", "unknown precision");
  if (!isCount(candidate["frames"]) || !isCount(candidate["durationMs"])) throw new ExampleFormatError("unreadable", "quality fields are malformed");
  let sequence: FeatureSequence;
  try {
    sequence = parseFeatureSequence({ schemaVersion: features, anchor: candidate["anchor"], hands: candidate["hands"], steps: candidate["steps"] });
  } catch (error) {
    throw new ExampleFormatError("unreadable", String((error as Error).message));
  }
  if (!sequence.steps.every((step) => step.every((number) => roundFeature(number) === number && !Object.is(number, -0)))) {
    throw new ExampleFormatError("unreadable", "values are not in stored form");
  }
  const record: GestureExampleRecordV1 = {
    version: EXAMPLE_RECORD_VERSION,
    conceptId: candidate["conceptId"],
    capturedAt,
    featureSchemaVersion: FEATURE_SCHEMA_VERSION,
    anchor: sequence.anchor,
    hands: sequence.hands,
    decimals: EXAMPLE_DECIMALS,
    frames: candidate["frames"],
    durationMs: candidate["durationMs"],
    steps: sequence.steps,
  };
  return { record, sequence };
}

/**
 * Stores a new example under a new data name, one write through the store.
 * Store refusals pass through unchanged (`ProfileSizeError`,
 * `UnknownProfileError`, storage errors): the caller reports them and does
 * not retry by itself.
 */
export async function saveExample(store: ProfileStore, profileId: string, conceptId: string, sequence: FeatureSequence, facts: CaptureFacts): Promise<StoredExample> {
  const record = createExampleRecord(conceptId, sequence, facts);
  const data = store.data(profileId);
  const taken = new Set(await data.names());
  let name = exampleName(conceptId, newExampleId());
  // 48 random bits: a collision is not expected, and a second one would point at a broken random source.
  if (taken.has(name)) name = exampleName(conceptId, newExampleId());
  if (taken.has(name)) throw new Error("random example id collided twice");
  await data.set(name, record);
  return { name, ...parseExampleRecord(record, conceptId) };
}

/** Readable and damaged examples of the profile, of one concept when `conceptId` is given. Reads every such entry. */
export async function listExamples(store: ProfileStore, profileId: string, conceptId?: string): Promise<ExampleListing> {
  const data = store.data(profileId);
  const examples: StoredExample[] = [];
  const damaged: DamagedExample[] = [];
  for (const name of (await data.names()).sort()) {
    const owner = exampleConceptOf(name);
    if (owner === null || (conceptId !== undefined && owner !== conceptId)) continue;
    const value = await data.get(name);
    if (value === undefined) continue;
    try {
      examples.push({ name, ...parseExampleRecord(value, owner) });
    } catch (error) {
      if (!(error instanceof ExampleFormatError)) throw error;
      damaged.push({ name, conceptId: owner, kind: error.kind, reason: error.message });
    }
  }
  examples.sort((a, b) => a.record.capturedAt.localeCompare(b.record.capturedAt) || a.name.localeCompare(b.name));
  return { examples, damaged };
}

/** How many example entries each concept has, from the data names alone (no value is read, so damaged ones count too). */
export async function countExamples(store: ProfileStore, profileId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const name of await store.data(profileId).names()) {
    const owner = exampleConceptOf(name);
    if (owner !== null) counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  return counts;
}

/**
 * Deletes one example. Refuses a name that is not an example's, and an entry
 * a newer app wrote (`ExampleFormatError` "unsupported-version"): it is
 * probably intact.
 */
export async function deleteExample(store: ProfileStore, profileId: string, name: string): Promise<void> {
  const owner = exampleConceptOf(name);
  if (owner === null) throw new ExampleFormatError("unreadable", "not an example's data name");
  const data = store.data(profileId);
  const value = await data.get(name);
  if (value === undefined) return;
  try {
    parseExampleRecord(value, owner);
  } catch (error) {
    if (error instanceof ExampleFormatError && error.kind === "unsupported-version") throw error;
  }
  await data.delete(name);
}

/**
 * Deletes every example of one concept that this app may delete (all but
 * those a newer app wrote), one write each, oldest first. Returns how many
 * were deleted. A failure stops it there; the examples deleted before stay
 * deleted, and calling again finishes the job.
 */
export async function deleteExamples(store: ProfileStore, profileId: string, conceptId: string): Promise<number> {
  const listing = await listExamples(store, profileId, conceptId);
  const names = [...listing.examples.map((example) => example.name), ...listing.damaged.filter((entry) => entry.kind !== "unsupported-version").map((entry) => entry.name)];
  const data = store.data(profileId);
  for (const name of names) await data.delete(name);
  return names.length;
}

/** "full": not one more example fits. "near": less than a tenth of the room is left. Read off `store.usage`, which counts the whole profile. */
export type UsageLevel = "ok" | "near" | "full";

export function usageLevel(usage: Pick<ProfileUsage, "names" | "bytes" | "maxNames" | "maxBytes">): UsageLevel {
  if (usage.names + 1 > usage.maxNames || usage.bytes + EXAMPLE_BYTES_ESTIMATE > usage.maxBytes) return "full";
  if (usage.names >= usage.maxNames * USAGE_NEAR_SHARE || usage.bytes >= usage.maxBytes * USAGE_NEAR_SHARE) return "near";
  return "ok";
}

export type RecordingResult =
  | {
    readonly ok: true; readonly sequence: FeatureSequence; readonly frames: number; readonly durationMs: number;
    /** A two-hand sequence in which one hand stayed within `MIN_TRAVEL` the whole time: a hint for the caregiver, not stored. */
    readonly stillHand: boolean;
  }
  | { readonly ok: false; readonly reason: FeatureFailure; readonly frames: number; readonly durationMs: number };

/** A recording of the camera, as the matcher would see it: tracker frames to landmark frames to a feature sequence. */
export function sequenceFromRecording(frames: readonly TrackerFrame[], options: AdapterOptions = {}): RecordingResult {
  const first = frames[0]?.timestampMs ?? 0;
  const last = frames[frames.length - 1]?.timestampMs ?? first;
  const facts = { frames: frames.length, durationMs: Math.max(0, Math.round(last - first)) };
  const landmarks = toLandmarkFrames(frames, options);
  const built = buildFeatureSequence(landmarks);
  if (!built.ok) return { ok: false, reason: built.reason, ...facts };
  const stillHand = built.sequence.hands === "both" && (["left", "right"] as const).some((side) => handTravel(landmarks, side) < MIN_TRAVEL);
  return { ok: true, sequence: built.sequence, stillHand, ...facts };
}

const PALM = [0, 1, 5, 9, 13, 17];
const middle = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[at]! : (sorted[at - 1]! + sorted[at]!) / 2;
};

/**
 * How far one hand got from where it was first seen, in shoulder widths
 * (without shoulders: three hand lengths, as the feature builder scales),
 * on palm centres averaged over `SPEED_SPAN_MS`, so tracking jitter does not
 * count. Infinity when the hand is not seen or nothing can be measured. An
 * approximation of the feature builder's own "movement" for a hint only.
 */
export function handTravel(frames: readonly LandmarkFrame[], side: "left" | "right"): number {
  const seen = frames.flatMap((frame) => {
    const hand = frame[side];
    if (hand === null || hand.length <= 17) return [];
    const palm = PALM.map((index) => hand[index] as Point);
    return [{ tMs: frame.tMs, at: [palm.reduce((sum, point) => sum + point[0], 0) / palm.length, palm.reduce((sum, point) => sum + point[1], 0) / palm.length] as const, hand }];
  });
  if (seen.length === 0) return Number.POSITIVE_INFINITY;
  const shoulders = frames.flatMap((frame) => (frame.shoulders === null ? [] : [Math.hypot(frame.shoulders[0][0] - frame.shoulders[1][0], frame.shoulders[0][1] - frame.shoulders[1][1])]));
  const unit = shoulders.length > 0
    ? middle(shoulders)
    : middle(seen.map(({ hand }) => Math.hypot(hand[0]![0] - hand[9]![0], hand[0]![1] - hand[9]![1]))) * 3;
  if (!(unit > 0)) return Number.POSITIVE_INFINITY;
  const smoothed = seen.map(({ tMs }) => {
    const near = seen.filter((other) => Math.abs(other.tMs - tMs) <= SPEED_SPAN_MS / 2);
    return [near.reduce((sum, other) => sum + other.at[0], 0) / near.length, near.reduce((sum, other) => sum + other.at[1], 0) / near.length] as const;
  });
  const [first] = smoothed;
  return Math.max(...smoothed.map((point) => Math.hypot(point[0] - first![0], point[1] - first![1]))) / unit;
}
