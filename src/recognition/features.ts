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
 * the time a hand is in view (first to last frame with a hand), whether it
 * moves or not. Never of a part cut out by movement: a hand seen only in the
 * rest before or after the movement would then be left out. Presence decides:
 * a hand that is clearly in view is never left out because the other hand
 * moves more.
 */
export const HAND_PRESENCE_SHARE = 0.5;
/**
 * Only a hand visible for less than this share of the time a hand is in view,
 * and without a movement of its own, is left out silently. It is a share, not
 * a time: in a capture of 1.5 s a hand seen for 300 ms is at the limit. Between
 * the two shares nobody can say whether the hand belongs, and leaving it out
 * could turn a two-hand gesture into the one-hand gesture with the same path:
 * no sequence is built ("hands_unclear").
 */
export const HAND_BRIEF_SHARE = 0.2;
/**
 * A hand that belongs to the gesture may be lost for up to this long and is
 * filled in between the frames around the gap. A longer gap is not guessed
 * over: the attempt fails with "hand_lost".
 */
export const MAX_BRIDGED_GAP_MS = 500;
/**
 * A hand is at rest while it moves slower than this, in shoulder widths per
 * second (without shoulders: three hand lengths). The speed is how far the
 * centre of the palm (wrist and finger bases) travels over `SPEED_SPAN_MS`. A
 * hand that only changes its shape does not move. Tracking jitter of a still
 * hand can exceed this speed for a moment; `MIN_TRAVEL` keeps that from
 * counting as a movement.
 */
export const REST_SPEED = 0.25;
export const SPEED_SPAN_MS = 200;
/**
 * A movement shorter than this is not a gesture, and a hand that looks fast
 * for less than this is not moving: tracking jitter of a resting hand does
 * that now and then.
 */
export const MIN_GESTURE_MS = 300;
/** A hand that is seen to be slow for up to this long in the middle of a movement is still in that movement. Time in which it is not seen does not count. */
export const MOVEMENT_GAP_MS = 200;
/**
 * A movement counts only when the hand gets at least this far from where the
 * movement started, in shoulder widths (without shoulders: three hand
 * lengths), measured on positions averaged over `SPEED_SPAN_MS`: five times
 * the tracking jitter of a resting hand that the evaluation allows for (0.02
 * shoulder widths from frame to frame), so jitter is no movement of its own.
 */
export const MIN_TRAVEL = 0.1;

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
  /** The hands in view for at least `HAND_PRESENCE_SHARE` of the gesture. Sequences of different kinds are not comparable; the slot of a hand that is not part of the gesture is all zero. */
  readonly hands: HandKind;
  readonly steps: readonly (readonly number[])[];
}
/** The name `dtw.ts` imports. The payload is schema version 2. */
export type FeatureSequenceV1 = FeatureSequence;

/**
 * Why no sequence was built. Each names what was seen, not what to do about it.
 * - "no_hands": frames, but no hand in any of them.
 * - "too_short": a hand of the gesture is in fewer than three of its frames, or
 *   the gesture's frames all carry one timestamp.
 * - "hands_unclear": which hands make the gesture cannot be told. A hand was in
 *   view for between `HAND_BRIEF_SHARE` and `HAND_PRESENCE_SHARE` of the time
 *   a hand is in view; or one hand belongs and the other, though seen less,
 *   moved on its own; or one hand belongs, shows no movement of its own, and
 *   the other was in view; or no hand is in view for half of the time.
 * - "hand_lost": a hand of the gesture was not seen for longer than `MAX_BRIDGED_GAP_MS`.
 */
export type FeatureFailure = "no_frames" | "bad_timestamps" | "bad_landmarks" | "no_hands" | "too_short" | "hands_unclear" | "hand_lost";

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

/** The wrist and the base of each finger, in MediaPipe order: they stay in place when the fingers bend. */
const PALM = [0, 1, 5, 9, 13, 17];

/** The mean of the palm points: where the hand is, whatever its fingers do; tracking jitter of single joints partly cancels out in it. */
function centre(hand: readonly Point[]): Point {
  const palm = PALM.map((index) => hand[index]!);
  return [mean(palm.map((point) => point[0])), mean(palm.map((point) => point[1]))];
}

interface Motion {
  /** Reference lengths per second at each frame; NaN where the hand is not visible. */
  readonly speeds: readonly number[];
  /** Where the hand is at each frame, averaged over `SPEED_SPAN_MS`, in reference lengths; null where it is not visible. */
  readonly places: readonly (Point | null)[];
}

/**
 * How one hand moves. The speed at a frame is the distance between where the
 * hand was on average in the half of `SPEED_SPAN_MS` before the frame and in
 * the half after it, by the timestamps, so the frame rate does not matter and
 * one jumping frame counts for little. At a low frame rate the two halves are
 * the neighbouring frames.
 */
function handMotion(frames: readonly LandmarkFrame[], side: Side, scale: number): Motion {
  const speeds = new Array<number>(frames.length).fill(Number.NaN);
  const places = new Array<Point | null>(frames.length).fill(null);
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
    const around = average(from, to).point;
    places[index] = [around[0] / scale, around[1] / scale];
    // Frames farther apart than half that time: the neighbours, unless the hand was lost for long in between.
    if (from === at && at > 0 && time - frames[seen[at - 1]!]!.tMs <= MAX_BRIDGED_GAP_MS) from = at - 1;
    if (to === at && at < seen.length - 1 && frames[seen[at + 1]!]!.tMs - time <= MAX_BRIDGED_GAP_MS) to = at + 1;
    const before = average(from, at);
    const after = average(at, to);
    const seconds = (after.time - before.time) / 1000;
    speeds[index] = seconds > 0 ? distance(before.point, after.point) / scale / seconds : 0;
  });
  return { speeds, places };
}

/**
 * In which frames one hand is in a movement: frames at or above `REST_SPEED`
 * form one movement while the hand is not seen to be slow for more than
 * `MOVEMENT_GAP_MS` between them (and not lost for more than
 * `MAX_BRIDGED_GAP_MS`). A movement counts when it lasts at least
 * `MIN_GESTURE_MS` and the hand gets at least `MIN_TRAVEL` away from where it
 * started; anything less may be tracking jitter.
 */
function movement(frames: readonly LandmarkFrame[], { speeds, places }: Motion): boolean[] {
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
  /** How far the hand gets from where it was at `first`, up to `last`. */
  const travel = (first: number, last: number): number => {
    const start = places[first]!;
    let farthest = 0;
    for (let index = first; index <= last; index += 1) {
      const place = places[index];
      if (place != null) farthest = Math.max(farthest, distance(start, place));
    }
    return farthest;
  };
  let from = 0;
  for (let at = 0; at < fast.length; at += 1) {
    if (at < fast.length - 1 && continues(fast[at]!, fast[at + 1]!)) continue;
    const [first, last] = [fast[from]!, fast[at]!];
    if (frames[last]!.tMs - frames[first]!.tMs >= MIN_GESTURE_MS && travel(first, last) >= MIN_TRAVEL) moving.fill(true, first, last + 1);
    from = at + 1;
  }
  return moving;
}

/**
 * True when a hand gets at least half of `MIN_TRAVEL` away from where it was
 * first seen, while it is seen for at least `MIN_GESTURE_MS`, however slowly
 * or unsteadily. Half, because the averaged positions at the ends of a short
 * sighting fall short of where the hand really was, and because a hand that
 * may have moved is never dropped: jitter that reaches it costs an answer, a
 * movement that is missed can cost the wrong one.
 */
function wanders(frames: readonly LandmarkFrame[], { places }: Motion): boolean {
  const seen = places.flatMap((place, index) => (place === null ? [] : [index]));
  if (seen.length === 0 || frames[seen[seen.length - 1]!]!.tMs - frames[seen[0]!]!.tMs < MIN_GESTURE_MS) return false;
  const start = places[seen[0]!]!;
  return seen.some((index) => distance(start, places[index]!) >= MIN_TRAVEL / 2);
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
 * The gesture inside a capture, as first and last frame index: the whole time
 * one of `sides` is in view, rest before and after included, as by the
 * feature builder of schema version 1. (Cutting rest away, by movement and
 * later by a resting pose, was tried in card NG-18; each time reviewers found
 * signs spoken as a wrong concept that version 1 did not speak, and the
 * synthetic evaluation gained nothing from it. See docs/recognition.md.) At
 * least one frame must show one of them.
 */
function segment(frames: readonly LandmarkFrame[], sides: readonly Side[]): [number, number] {
  const visible = frames.map((frame) => sides.some((side) => frame[side] !== null));
  return [visible.indexOf(true), visible.lastIndexOf(true)];
}

/**
 * The hands that are visible for at least `HAND_PRESENCE_SHARE` of the span's
 * duration; movement plays no part. The span is the whole time a hand is in
 * view. Null when a hand is visible for less than
 * that but not for less than `HAND_BRIEF_SHARE`.
 */
function presentHands(frames: readonly LandmarkFrame[], [first, last]: readonly [number, number]): Side[] | null {
  const weights = frameWeights(frames, first, last);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const shares = SIDES.map((side) => weights.reduce((sum, weight, offset) => sum + (frames[first + offset]![side] !== null ? weight : 0), 0) / total);
  if (shares.some((share) => share >= HAND_BRIEF_SHARE && share < HAND_PRESENCE_SHARE)) return null;
  return SIDES.filter((_, index) => shares[index]! >= HAND_PRESENCE_SHARE);
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
 * its last sighting with the nearest one. False when two sightings are
 * farther apart in time than `MAX_BRIDGED_GAP_MS`, with or without frames in
 * between.
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
    const gap = times[to]! - times[from]!;
    // By time, not by frames: a camera that delivers nothing for a while has lost the hand as well.
    if (gap > MAX_BRIDGED_GAP_MS) return false;
    for (let missing = from + 1; missing < to; missing += 1) {
      copy(missing, from, to, gap > 0 ? (times[missing]! - times[from]!) / gap : 0.5);
    }
  }
  return true;
}

/**
 * `steps` rows at even distances in frame order, as by the feature builder of
 * schema version 1. (Spacing them evenly in time was tried in card NG-18: on
 * the synthetic captures it gained nothing at low or unsteady frame rates and
 * let one more look-alike through; see docs/recognition.md.)
 */
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
 * Turns raw landmark frames into a comparable sequence.
 *
 * 1. Its hands are those visible for `HAND_PRESENCE_SHARE` of the time a hand
 *    is in view, moving or not. The other hand is left out only when it was
 *    seen for less than `HAND_BRIEF_SHARE` of it and did not move on its own
 *    (`wanders`), and the hand that stays has a movement of its own if the
 *    other was in view. Otherwise nothing is built ("hands_unclear").
 * 2. The gesture is the whole time those hands are in view (`segment`).
 * 3. Gaps of those hands up to `MAX_BRIDGED_GAP_MS` are filled; a longer one
 *    fails with "hand_lost".
 * 4. Positions are made relative to the body, and the result is resampled to
 *    `SEQUENCE_STEPS` steps evenly in frame order.
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

  const inView = frames.map((frame) => frame.left !== null || frame.right !== null);
  if (!inView.includes(true)) {
    return { ok: false, reason: "no_hands" };
  }
  // Speeds need a length to be measured in: that of the whole capture is good enough for that.
  const coarse = findReference(frames, SIDES);
  if (coarse === null || !(coarse.scale > 0) || !Number.isFinite(coarse.scale)) {
    return { ok: false, reason: "bad_landmarks" };
  }
  const motion: Record<Side, Motion> = { left: handMotion(frames, "left", coarse.scale), right: handMotion(frames, "right", coarse.scale) };
  const moves: Record<Side, boolean[]> = { left: movement(frames, motion.left), right: movement(frames, motion.right) };
  // Which hands belong is decided over the whole time a hand is in view, never over a cut by movement.
  const sides = presentHands(frames, [inView.indexOf(true), inView.lastIndexOf(true)]);
  if (sides === null || sides.length === 0) {
    return { ok: false, reason: "hands_unclear" };
  }
  if (sides.length === 1) {
    const kept = sides[0]!;
    const other: Side = kept === "left" ? "right" : "left";
    // A hand that moved on its own, beyond jitter, may belong to the gesture, however briefly it was seen.
    if (wanders(frames, motion[other])) return { ok: false, reason: "hands_unclear" };
    // A hand that stays without a movement of its own is not a gesture because another hand was in view for a moment.
    if (!moves[kept].includes(true) && frames.some((frame) => frame[other] !== null)) return { ok: false, reason: "hands_unclear" };
  }
  const span = segment(frames, sides);
  const gesture = frames.slice(span[0], span[1] + 1);
  const times = gesture.map((frame) => frame.tMs);
  const active = gesture.filter((frame) => sides.some((side) => frame[side] !== null)).length;
  if (active < MIN_ACTIVE_FRAMES || times[times.length - 1] === times[0]) {
    return { ok: false, reason: "too_short" };
  }
  // Shoulders seen only before or after the movement still anchor it.
  const own = findReference(gesture, sides);
  const reference = own !== null && own.anchor === "hands" && coarse.anchor === "shoulders" ? coarse : own;
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
      steps: resample(rows, SEQUENCE_STEPS),
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
