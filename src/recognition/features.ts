/**
 * Versioned, camera-independent description of one gesture attempt.
 *
 * Input is a list of landmark frames (hand joints and, when available, the two
 * shoulders) in any consistent 2D unit. Output is a fixed-length sequence that
 * no longer depends on where the child stood, how large they appeared, or how
 * fast they moved. Nothing here touches the DOM, the camera or the network.
 */

export const FEATURE_SCHEMA_VERSION = 2;
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
/**
 * A hand belongs to the gesture when it is visible for at least this share of
 * the gesture's duration. A hand below it is left out entirely: a second hand
 * that passes through does not turn a one-hand gesture into a two-hand one.
 */
export const HAND_PRESENCE_SHARE = 0.5;
/**
 * And, when anything moves at all, it has to move itself for at least this
 * share of the gesture's duration. A hand that only rests in view while the
 * other one makes the gesture is left out. (So is a hand that is held still on
 * purpose as part of a two-hand gesture; see docs/recognition.md.)
 */
export const HAND_MOVING_SHARE = 0.2;
/**
 * A hand that belongs to the gesture may be lost for up to this long and is
 * filled in between the frames around the gap. A longer gap is not guessed
 * over: the attempt fails with "hand_lost".
 */
export const MAX_BRIDGED_GAP_MS = 500;
/**
 * A hand is at rest while it moves slower than this, in shoulder widths per
 * second (without shoulders: three hand lengths). The speed is how far the
 * centre of the hand's 21 points travels over `SPEED_SPAN_MS`, so tracking
 * jitter of a still hand stays well below it. A hand that only changes its
 * shape does not count as moving.
 */
export const REST_SPEED = 0.25;
export const SPEED_SPAN_MS = 200;
/** Kept before the first and after the last moving frame, so the start and end posture are part of the gesture. */
export const SEGMENT_PAD_MS = 100;
/**
 * A movement shorter than this is not a gesture, and a hand that looks fast
 * for less than this is not moving: tracking jitter of a resting hand does
 * that now and then.
 */
export const MIN_GESTURE_MS = 300;
/** A hand that is seen to be slow for up to this long in the middle of a movement is still in that movement. Time in which it is not seen does not count. */
export const MOVEMENT_GAP_MS = 200;

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

/** Which hands make the gesture. "left" is the child's own left hand (docs/recognition.md, input contract). */
export type HandKind = "left" | "right" | "both";

export interface FeatureSequence {
  readonly schemaVersion: 2;
  readonly anchor: Anchor;
  /** Decided by `HAND_PRESENCE_SHARE`. Sequences of different kinds are not comparable; the slot of a hand that is not part of the gesture is all zero. */
  readonly hands: HandKind;
  readonly steps: readonly (readonly number[])[];
}
/** The name `dtw.ts` imports. The payload is schema version 2. */
export type FeatureSequenceV1 = FeatureSequence;

export type FeatureFailure = "no_frames" | "bad_timestamps" | "bad_landmarks" | "too_short" | "hand_lost";

export type FeatureResult =
  | { readonly ok: true; readonly sequence: FeatureSequence }
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

type Side = "left" | "right";
const SIDES: readonly Side[] = ["left", "right"];

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

/** The reference of the frames given, from the shoulders or else from the hands of `sides`. */
function findReference(frames: readonly LandmarkFrame[], sides: readonly Side[]): Reference | null {
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
  const hands = frames.flatMap((frame) => sides.map((side) => frame[side])).filter((hand) => hand !== null);
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

/** The mean of a hand's points: tracking jitter of single joints mostly cancels out in it. */
function centre(hand: readonly Point[]): Point {
  return [mean(hand.map((point) => point[0])), mean(hand.map((point) => point[1]))];
}

/**
 * How fast one hand moves at each frame, in reference lengths per second; NaN
 * where the hand is not visible. It is the distance between where the hand
 * was on average in the half of that time before the frame and in the half
 * after it, by the timestamps, so the frame rate does not matter and one
 * jumping frame counts for little. At a low frame rate the two halves are the
 * neighbouring frames.
 */
function handSpeeds(frames: readonly LandmarkFrame[], side: Side, scale: number): number[] {
  const speeds = new Array<number>(frames.length).fill(Number.NaN);
  const seen = frames.flatMap((frame, index) => (frame[side] === null ? [] : [index]));
  const centres = new Map(seen.map((index) => [index, centre(frames[index]![side]!)]));
  const average = (from: number, to: number): { point: Point; time: number } => {
    const part = seen.slice(from, to + 1);
    return {
      point: [mean(part.map((index) => centres.get(index)![0])), mean(part.map((index) => centres.get(index)![1]))],
      time: mean(part.map((index) => frames[index]!.tMs)),
    };
  };
  seen.forEach((index, at) => {
    const time = frames[index]!.tMs;
    let from = at;
    while (from > 0 && time - frames[seen[from - 1]!]!.tMs <= SPEED_SPAN_MS / 2) from -= 1;
    let to = at;
    while (to < seen.length - 1 && frames[seen[to + 1]!]!.tMs - time <= SPEED_SPAN_MS / 2) to += 1;
    // Frames farther apart than half that time: the neighbours, unless the hand was lost for long in between.
    if (from === at && at > 0 && time - frames[seen[at - 1]!]!.tMs <= MAX_BRIDGED_GAP_MS) from = at - 1;
    if (to === at && at < seen.length - 1 && frames[seen[at + 1]!]!.tMs - time <= MAX_BRIDGED_GAP_MS) to = at + 1;
    const before = average(from, at);
    const after = average(at, to);
    const seconds = (after.time - before.time) / 1000;
    speeds[index] = seconds > 0 ? distance(before.point, after.point) / scale / seconds : 0;
  });
  return speeds;
}

/**
 * In which frames one hand is in a movement: frames at or above `REST_SPEED`
 * form one movement while the hand is not seen to be slow for more than
 * `MOVEMENT_GAP_MS` between them (and not lost for more than
 * `MAX_BRIDGED_GAP_MS`), and a movement counts when it lasts at least
 * `MIN_GESTURE_MS`.
 */
function movement(frames: readonly LandmarkFrame[], speeds: readonly number[]): boolean[] {
  const moving = new Array<boolean>(frames.length).fill(false);
  const fast = speeds.flatMap((speed, index) => (speed >= REST_SPEED ? [index] : []));
  /** True when the movement goes on from one fast frame to the next. */
  const continues = (from: number, to: number): boolean => {
    let slow = 0;
    let unseen = 0;
    for (let index = from + 1; index <= to; index += 1) {
      const step = frames[index]!.tMs - frames[index - 1]!.tMs;
      // The time up to a frame belongs to what that frame shows; up to the next fast frame it is slow if the frame before was.
      const shown = index === to ? speeds[index - 1]! : speeds[index]!;
      if (Number.isNaN(shown)) unseen += step;
      else if (index !== to || index - 1 !== from) slow += step;
    }
    return slow <= MOVEMENT_GAP_MS && unseen <= MAX_BRIDGED_GAP_MS;
  };
  let from = 0;
  for (let at = 0; at < fast.length; at += 1) {
    if (at < fast.length - 1 && continues(fast[at]!, fast[at + 1]!)) continue;
    if (frames[fast[at]!]!.tMs - frames[fast[from]!]!.tMs >= MIN_GESTURE_MS) moving.fill(true, fast[from]!, fast[at]! + 1);
    from = at + 1;
  }
  return moving;
}

/** The time each frame stands for: half the way to its neighbours, inside the span. */
function frameWeights(frames: readonly LandmarkFrame[], first: number, last: number): number[] {
  const weights: number[] = [];
  for (let index = first; index <= last; index += 1) {
    const before = index > first ? (frames[index]!.tMs - frames[index - 1]!.tMs) / 2 : 0;
    const after = index < last ? (frames[index + 1]!.tMs - frames[index]!.tMs) / 2 : 0;
    weights.push(before + after);
  }
  // A single frame, or frames with one timestamp: count frames instead.
  return weights.every((weight) => weight === 0) ? weights.map(() => 1) : weights;
}

/**
 * The gesture inside a capture, as first and last frame index: from the first
 * to the last frame in which one of `sides` moves, with `SEGMENT_PAD_MS` on
 * each side as long as a hand is visible there. Hands that rest in view before
 * and after are left out. If no hand ever moves (a posture that is only held),
 * it is the whole time a hand is visible.
 */
function segment(frames: readonly LandmarkFrame[], sides: readonly Side[], moves: Readonly<Record<Side, boolean[]>>): [number, number] | null {
  const visible = frames.map((frame) => sides.some((side) => frame[side] !== null));
  const moving = frames.map((_, index) => sides.some((side) => moves[side][index]!));
  if (!moving.includes(true)) {
    return visible.includes(true) ? [visible.indexOf(true), visible.lastIndexOf(true)] : null;
  }
  let first = moving.indexOf(true);
  let last = moving.lastIndexOf(true);
  const start = frames[first]!.tMs;
  const end = frames[last]!.tMs;
  while (first > 0 && visible[first - 1] && start - frames[first - 1]!.tMs <= SEGMENT_PAD_MS) first -= 1;
  while (last < frames.length - 1 && visible[last + 1] && frames[last + 1]!.tMs - end <= SEGMENT_PAD_MS) last += 1;
  return [first, last];
}

/**
 * The hands that belong to the span: visible for at least `HAND_PRESENCE_SHARE`
 * of its duration and, unless no hand moves in it at all, moving for at least
 * `HAND_MOVING_SHARE` of it.
 */
function presentHands(
  frames: readonly LandmarkFrame[], sides: readonly Side[], [first, last]: readonly [number, number], moves: Readonly<Record<Side, boolean[]>>,
): Side[] {
  const weights = frameWeights(frames, first, last);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const share = (counts: (index: number) => boolean): number =>
    weights.reduce((sum, weight, offset) => sum + (counts(first + offset) ? weight : 0), 0) / total;
  const moving = (side: Side): number => share((index) => moves[side][index]!);
  const anyMoves = sides.some((side) => moving(side) > 0);
  return sides.filter((side) => share((index) => frames[index]![side] !== null) >= HAND_PRESENCE_SHARE
    && (!anyMoves || moving(side) >= HAND_MOVING_SHARE));
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

/**
 * Fills the frames in which a hand of the gesture is missing: between the
 * frames around a gap in proportion to the time, and before its first or after
 * its last sighting with the nearest one. False when a gap between two
 * sightings is longer than `MAX_BRIDGED_GAP_MS`.
 */
function bridgeGaps(rows: number[][], times: readonly number[], offset: number): boolean {
  const present = (row: number[]): boolean => row[offset + HAND_SHAPE_VALUES + 2] === 1;
  const copy = (target: number, from: number, to: number, weight: number): void => {
    for (let value = offset; value < offset + HAND_VALUES; value += 1) {
      rows[target]![value] = rows[from]![value]! * (1 - weight) + rows[to]![value]! * weight;
    }
  };
  const seen = rows.flatMap((row, index) => (present(row) ? [index] : []));
  if (seen.length === 0) return false;
  for (let index = 0; index < seen[0]!; index += 1) copy(index, seen[0]!, seen[0]!, 0);
  for (let index = seen[seen.length - 1]! + 1; index < rows.length; index += 1) copy(index, seen[seen.length - 1]!, seen[seen.length - 1]!, 0);
  for (let at = 1; at < seen.length; at += 1) {
    const from = seen[at - 1]!;
    const to = seen[at]!;
    if (to - from < 2) continue;
    const gap = times[to]! - times[from]!;
    if (gap > MAX_BRIDGED_GAP_MS) return false;
    for (let missing = from + 1; missing < to; missing += 1) {
      copy(missing, from, to, gap > 0 ? (times[missing]! - times[from]!) / gap : 0.5);
    }
  }
  return true;
}

/** `steps` rows at even distances in time, so neither the speed of the gesture nor an unsteady frame rate matters. */
function resample(rows: readonly number[][], times: readonly number[], steps: number): number[][] {
  const start = times[0]!;
  const duration = times[times.length - 1]! - start;
  const result: number[][] = [];
  let low = 0;
  for (let step = 0; step < steps; step += 1) {
    const time = start + (duration * step) / (steps - 1);
    while (low < rows.length - 2 && times[low + 1]! <= time) low += 1;
    const high = Math.min(low + 1, rows.length - 1);
    const between = times[high]! - times[low]!;
    const weight = between > 0 ? Math.min(Math.max((time - times[low]!) / between, 0), 1) : 0;
    result.push(rows[low]!.map((value, index) => value * (1 - weight) + rows[high]![index]! * weight));
  }
  return result;
}

/**
 * Turns raw landmark frames into a comparable sequence.
 *
 * 1. The gesture is cut out of the capture by movement (`segment`), so a
 *    capture may start early and end late and hands may rest in view.
 * 2. A hand belongs to it when it is visible for `HAND_PRESENCE_SHARE` of that
 *    time. Other hands are dropped, and the gesture is cut out once more from
 *    the movement of the hands that belong to it.
 * 3. Gaps of those hands up to `MAX_BRIDGED_GAP_MS` are filled; a longer one
 *    fails with "hand_lost".
 * 4. Positions are made relative to the body, and the result is resampled to
 *    `SEQUENCE_STEPS` steps evenly in time.
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

  // The speed needs a length to be measured in: that of the whole capture is good enough for cutting.
  const coarse = findReference(frames, SIDES);
  if (coarse === null) {
    return { ok: false, reason: "too_short" };
  }
  if (!(coarse.scale > 0) || !Number.isFinite(coarse.scale)) {
    return { ok: false, reason: "bad_landmarks" };
  }
  const moves: Record<Side, boolean[]> = {
    left: movement(frames, handSpeeds(frames, "left", coarse.scale)),
    right: movement(frames, handSpeeds(frames, "right", coarse.scale)),
  };
  const rough = segment(frames, SIDES, moves);
  if (rough === null) {
    return { ok: false, reason: "too_short" };
  }
  const candidates = presentHands(frames, SIDES, rough, moves);
  const span = candidates.length === 0 ? null : segment(frames, candidates, moves);
  // Cut again without the hand that only passed through; a hand that falls below the share then is dropped as well.
  const sides = span === null ? [] : presentHands(frames, candidates, span, moves);
  if (span === null || sides.length === 0) {
    return { ok: false, reason: "too_short" };
  }
  const gesture = frames.slice(span[0], span[1] + 1);
  const times = gesture.map((frame) => frame.tMs);
  const active = gesture.filter((frame) => sides.some((side) => frame[side] !== null)).length;
  if (active < MIN_ACTIVE_FRAMES) {
    return { ok: false, reason: "too_short" };
  }
  const reference = findReference(gesture, sides);
  if (reference === null) {
    return { ok: false, reason: "bad_landmarks" };
  }

  const rows = gesture.map((frame) => {
    const row = new Array<number>(STEP_VALUES).fill(0);
    if (sides.includes("left")) writeHand(row, 0, frame.left, reference);
    if (sides.includes("right")) writeHand(row, HAND_VALUES, frame.right, reference);
    return row;
  });
  for (const side of sides) {
    if (!bridgeGaps(rows, times, side === "left" ? 0 : HAND_VALUES)) {
      return { ok: false, reason: "hand_lost" };
    }
  }
  // Landmarks that are finite but degenerate (for example both shoulders on one point) end up here.
  if (!rows.every((row) => row.every(Number.isFinite))) {
    return { ok: false, reason: "bad_landmarks" };
  }
  return {
    ok: true,
    sequence: {
      schemaVersion: FEATURE_SCHEMA_VERSION,
      anchor: reference.anchor,
      hands: sides.length === 2 ? "both" : sides[0]!,
      steps: resample(rows, times, SEQUENCE_STEPS),
    },
  };
}

/**
 * Checks a sequence that was stored or imported earlier. Incompatible data is
 * rejected; it is never repaired or migrated silently.
 */
export function parseFeatureSequence(value: unknown): FeatureSequence {
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
  if (candidate.hands !== "left" && candidate.hands !== "right" && candidate.hands !== "both") {
    throw new FeatureSchemaError("unknown hand kind");
  }
  const steps = candidate.steps;
  const wellFormed = Array.isArray(steps)
    && steps.length === SEQUENCE_STEPS
    // Array.from turns holes of a sparse array into undefined, which then fails the checks.
    && Array.from(steps).every((step) => Array.isArray(step) && step.length === STEP_VALUES && Array.from(step).every(Number.isFinite));
  if (!wellFormed) {
    throw new FeatureSchemaError("feature sequence has the wrong shape");
  }
  return { schemaVersion: FEATURE_SCHEMA_VERSION, anchor: candidate.anchor, hands: candidate.hands, steps: steps as number[][] };
}
