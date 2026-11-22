/**
 * Versioned, camera-independent description of one gesture attempt.
 *
 * Input is a list of landmark frames (hand joints and, when available, the two
 * shoulders) in any consistent 2D unit. Output is a fixed-length sequence that
 * no longer depends on where the child stood, how large they appeared, or how
 * fast they moved. Nothing here touches the DOM, the camera or the network.
 */

export const FEATURE_SCHEMA_VERSION = 1;
/** Landmarks per hand, in MediaPipe hand order (0 = wrist, 9 = middle-finger base). */
export const HAND_POINTS = 21;
export const SEQUENCE_STEPS = 32;
const HAND_SHAPE_VALUES = (HAND_POINTS - 1) * 2;
/** Per hand: joint shape, wrist position (x, y), presence flag. */
const HAND_VALUES = HAND_SHAPE_VALUES + 3;
export const STEP_VALUES = HAND_VALUES * 2;
/**
 * Shape has 40 values and position 2, so unweighted the shape (and its tracking
 * jitter) would drown out where the hand is. With these weights a hand moved by
 * a quarter shoulder width counts about as much as every joint displaced by a
 * quarter hand length. Chosen on synthetic data; revisit with real recordings.
 */
const SHAPE_WEIGHT = 1 / Math.sqrt(HAND_POINTS - 1);
const POSITION_WEIGHT = 1;
const MIN_ACTIVE_FRAMES = 3;
/** Hand tracking drops out for a few frames during fast movement; longer gaps mean the hand really left. */
const MAX_BRIDGED_GAP_FRAMES = 6;

export type Point = readonly [number, number];

export interface LandmarkFrame {
  /** Milliseconds since capture start; must not decrease. */
  readonly tMs: number;
  readonly left: readonly Point[] | null;
  readonly right: readonly Point[] | null;
  /** Left and right shoulder, when a body anchor is available. */
  readonly shoulders: readonly [Point, Point] | null;
}

/**
 * "shoulders": positions are relative to the body, so the same hand shape at the
 * chin and at the chest are different gestures. "hands": no body anchor was
 * seen, positions are relative to the centre of the movement itself.
 */
export type Anchor = "shoulders" | "hands";

export interface FeatureSequenceV1 {
  readonly schemaVersion: 1;
  readonly anchor: Anchor;
  readonly steps: readonly (readonly number[])[];
}

export type FeatureFailure = "no_frames" | "bad_timestamps" | "bad_landmarks" | "too_short";

export type FeatureResult =
  | { readonly ok: true; readonly sequence: FeatureSequenceV1 }
  | { readonly ok: false; readonly reason: FeatureFailure };

export class FeatureSchemaError extends Error {}

function isPoint(value: unknown): value is Point {
  return Array.isArray(value) && value.length === 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** A usable hand has 21 finite points and a non-zero size (wrist to middle-finger base). */
function isHand(value: unknown): value is readonly Point[] {
  return Array.isArray(value)
    && value.length === HAND_POINTS
    && Array.from(value).every(isPoint)
    && distance(value[0] as Point, value[9] as Point) > 0;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

interface Reference {
  readonly anchor: Anchor;
  readonly origin: Point;
  readonly scale: number;
  /** Tilt of the shoulder line in radians; removed so a tilted phone does not change the gesture. */
  readonly tilt: number;
}

function untilt(x: number, y: number, tilt: number): Point {
  return [x * Math.cos(tilt) + y * Math.sin(tilt), -x * Math.sin(tilt) + y * Math.cos(tilt)];
}

function shoulderTilt(shoulders: readonly (readonly [Point, Point])[]): number {
  const angle = Math.atan2(
    median(shoulders.map(([l, r]) => r[1] - l[1])),
    median(shoulders.map(([l, r]) => r[0] - l[0])),
  );
  // Which shoulder is called "left" must not matter: fold the line's direction into (-90°, 90°].
  if (angle > Math.PI / 2) return angle - Math.PI;
  if (angle <= -Math.PI / 2) return angle + Math.PI;
  return angle;
}

function findReference(frames: readonly LandmarkFrame[]): Reference | null {
  const withShoulders = frames.flatMap((frame) => (frame.shoulders === null ? [] : [frame.shoulders]));
  if (withShoulders.length > 0) {
    // The median ignores single-frame tracking jumps.
    const scale = median(withShoulders.map(([l, r]) => distance(l, r)));
    if (scale > 0) {
      return {
        anchor: "shoulders",
        origin: [
          median(withShoulders.map(([l, r]) => (l[0] + r[0]) / 2)),
          median(withShoulders.map(([l, r]) => (l[1] + r[1]) / 2)),
        ],
        scale,
        tilt: shoulderTilt(withShoulders),
      };
    }
  }
  // No body anchor: use the mean of all wrist positions and the typical hand size.
  // (Not the median: with two hands the positions form two groups, and one lost
  // frame would flip the median from one group to the other.)
  const hands = frames.flatMap((frame) => [frame.left, frame.right]).filter((hand) => hand !== null);
  if (hands.length === 0) {
    return null;
  }
  return {
    anchor: "hands",
    origin: [mean(hands.map((hand) => hand[0]![0])), mean(hands.map((hand) => hand[0]![1]))],
    // A hand is roughly a third of a shoulder width; keep both anchors on a similar scale.
    scale: median(hands.map((hand) => distance(hand[0]!, hand[9]!))) * 3,
    tilt: 0,
  };
}

function writeHand(target: number[], offset: number, hand: readonly Point[] | null, reference: Reference): void {
  if (hand === null) {
    return;
  }
  const wrist = hand[0]!;
  const size = distance(wrist, hand[9]!);
  for (let joint = 1; joint < HAND_POINTS; joint += 1) {
    const point = hand[joint]!;
    const [x, y] = untilt(point[0] - wrist[0], point[1] - wrist[1], reference.tilt);
    target[offset + (joint - 1) * 2] = (x / size) * SHAPE_WEIGHT;
    target[offset + (joint - 1) * 2 + 1] = (y / size) * SHAPE_WEIGHT;
  }
  const [x, y] = untilt(wrist[0] - reference.origin[0], wrist[1] - reference.origin[1], reference.tilt);
  target[offset + HAND_SHAPE_VALUES] = (x / reference.scale) * POSITION_WEIGHT;
  target[offset + HAND_SHAPE_VALUES + 1] = (y / reference.scale) * POSITION_WEIGHT;
  target[offset + HAND_SHAPE_VALUES + 2] = 1;
}

/** Fills short tracking dropouts of one hand by interpolating between the frames around the gap. */
function bridgeGaps(rows: number[][], offset: number): void {
  const present = (row: number[]): boolean => row[offset + HAND_SHAPE_VALUES + 2] === 1;
  let lastSeen = -1;
  for (let index = 0; index < rows.length; index += 1) {
    if (!present(rows[index]!)) {
      continue;
    }
    const gap = index - lastSeen - 1;
    if (lastSeen >= 0 && gap > 0 && gap <= MAX_BRIDGED_GAP_FRAMES) {
      for (let missing = lastSeen + 1; missing < index; missing += 1) {
        const weight = (missing - lastSeen) / (gap + 1);
        for (let value = offset; value < offset + HAND_VALUES; value += 1) {
          rows[missing]![value] = rows[lastSeen]![value]! * (1 - weight) + rows[index]![value]! * weight;
        }
      }
    }
    lastSeen = index;
  }
}

function resample(rows: readonly number[][], steps: number): number[][] {
  const result: number[][] = [];
  for (let step = 0; step < steps; step += 1) {
    const position = (step * (rows.length - 1)) / (steps - 1);
    const low = Math.floor(position);
    const high = Math.min(low + 1, rows.length - 1);
    const weight = position - low;
    result.push(rows[low]!.map((value, index) => value * (1 - weight) + rows[high]![index]! * weight));
  }
  return result;
}

/**
 * Turns raw landmark frames into a comparable sequence. Frames before the first
 * and after the last visible hand are dropped, so a capture may start early and
 * end late.
 */
export function buildFeatureSequence(frames: readonly LandmarkFrame[]): FeatureResult {
  if (frames.length === 0) {
    return { ok: false, reason: "no_frames" };
  }
  let previous = Number.NEGATIVE_INFINITY;
  for (const frame of frames) {
    if (!Number.isFinite(frame.tMs) || frame.tMs < previous) {
      return { ok: false, reason: "bad_timestamps" };
    }
    previous = frame.tMs;
    const handsValid = [frame.left, frame.right].every((hand) => hand === null || isHand(hand));
    const shouldersValid = frame.shoulders === null
      || (Array.isArray(frame.shoulders) && frame.shoulders.length === 2 && frame.shoulders.every(isPoint));
    if (!handsValid || !shouldersValid) {
      return { ok: false, reason: "bad_landmarks" };
    }
  }

  const active = frames.map((frame) => frame.left !== null || frame.right !== null);
  const first = active.indexOf(true);
  const last = active.lastIndexOf(true);
  if (first === -1 || active.filter(Boolean).length < MIN_ACTIVE_FRAMES) {
    return { ok: false, reason: "too_short" };
  }
  const gesture = frames.slice(first, last + 1);
  const reference = findReference(gesture);
  if (reference === null) {
    return { ok: false, reason: "bad_landmarks" };
  }

  const rows = gesture.map((frame) => {
    const row = new Array<number>(STEP_VALUES).fill(0);
    writeHand(row, 0, frame.left, reference);
    writeHand(row, HAND_VALUES, frame.right, reference);
    return row;
  });
  bridgeGaps(rows, 0);
  bridgeGaps(rows, HAND_VALUES);
  return {
    ok: true,
    sequence: { schemaVersion: FEATURE_SCHEMA_VERSION, anchor: reference.anchor, steps: resample(rows, SEQUENCE_STEPS) },
  };
}

/**
 * Checks a sequence that was stored or imported earlier. Incompatible data is
 * rejected; it is never repaired or migrated silently.
 */
export function parseFeatureSequence(value: unknown): FeatureSequenceV1 {
  if (typeof value !== "object" || value === null) {
    throw new FeatureSchemaError("feature sequence is not an object");
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== FEATURE_SCHEMA_VERSION) {
    throw new FeatureSchemaError(`unsupported feature schema version: ${String(candidate.schemaVersion)}`);
  }
  if (candidate.anchor !== "shoulders" && candidate.anchor !== "hands") {
    throw new FeatureSchemaError("unknown anchor");
  }
  const steps = candidate.steps;
  const wellFormed = Array.isArray(steps)
    && steps.length === SEQUENCE_STEPS
    // Array.from turns holes of a sparse array into undefined, which then fails the checks.
    && Array.from(steps).every((step) => Array.isArray(step) && step.length === STEP_VALUES && Array.from(step).every(Number.isFinite));
  if (!wellFormed) {
    throw new FeatureSchemaError("feature sequence has the wrong shape");
  }
  return { schemaVersion: FEATURE_SCHEMA_VERSION, anchor: candidate.anchor, steps: steps as number[][] };
}
