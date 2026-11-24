/**
 * Cutting a continuous stream of landmark frames into gestures (card NG-53).
 *
 * The matcher compares one finished attempt with the examples: today an
 * attempt is what lies between "Gebärde" and "Stopp". For a view that
 * recognises the whole time (card NG-54), the stream has to be cut into
 * attempts first. Two ways are measured in `evaluate.ts` (`simulateStream`):
 *
 * - "away": a gesture ends when no hand is in view for longer than the feature
 *   builder bridges a lost hand (`MAX_BRIDGED_GAP_MS`), by `SEGMENT_GAP_MS`.
 *   A child lowers the hands out of the picture between gestures. A hand lost
 *   by the tracker for a moment never cuts a gesture.
 * - "rest": also where the hands rest in view for `REST_SPLIT_MS` after a
 *   movement: the cut is in the middle of the rest, so each part keeps some
 *   rest, as an attempt does.
 *
 * Nothing is trimmed inside a segment (docs/recognition.md, "Nothing is
 * trimmed"): a segment is passed to `buildFeatureSequence` whole, as an
 * attempt is.
 */
import { MAX_BRIDGED_GAP_MS, REST_SPEED, SPEED_SPAN_MS, type LandmarkFrame, type Point } from "./features.js";

export type SegmentMode = "away" | "rest";

/** No hand in view for longer than this ends a gesture; longer than any gap the feature builder bridges. */
export const SEGMENT_GAP_MS = MAX_BRIDGED_GAP_MS + 200;
/** In "rest" mode: hands that rest in view this long after a movement end a gesture, cut in the middle of the rest. */
export const REST_SPLIT_MS = 1000;
/** A segment longer than this is no gesture (somebody stays in view, moving); it is dropped, not compared. */
export const SEGMENT_MAX_MS = 10_000;

export interface StreamSegments {
  /** Finished segments, in order: each is passed to `buildFeatureSequence` as one attempt. */
  readonly segments: readonly (readonly LandmarkFrame[])[];
  /** Segments dropped for being longer than `SEGMENT_MAX_MS`. */
  readonly tooLong: number;
  /** The frames of a gesture that may still go on at the end of the stream, or null. */
  readonly open: readonly LandmarkFrame[] | null;
}

const SIDES = ["left", "right"] as const;
/** The wrist and the base of each finger: where the hand is, whatever its fingers do (as in features.ts). */
const PALM = [0, 1, 5, 9, 13, 17];

function centre(hand: readonly Point[]): Point {
  let x = 0;
  let y = 0;
  for (const index of PALM) {
    x += hand[index]![0];
    y += hand[index]![1];
  }
  return [x / PALM.length, y / PALM.length];
}

function hasHand(frame: LandmarkFrame): boolean {
  return frame.left !== null || frame.right !== null;
}

/** Shoulder width, or three hand lengths without shoulders, as the feature builder's reference length. */
function scaleOf(frame: LandmarkFrame): number {
  if (frame.shoulders !== null) {
    const [l, r] = frame.shoulders;
    const width = Math.hypot(l[0] - r[0], l[1] - r[1]);
    if (width > 0) return width;
  }
  for (const side of SIDES) {
    const hand = frame[side];
    if (hand !== null) return Math.hypot(hand[0]![0] - hand[9]![0], hand[0]![1] - hand[9]![1]) * 3;
  }
  return 0;
}

/**
 * Whether a hand moves at each frame: the palm centre travels at least
 * `REST_SPEED` reference lengths per second, measured against the latest frame
 * of the same hand at least `SPEED_SPAN_MS` earlier (and not more than
 * `MAX_BRIDGED_GAP_MS` before that). null where no hand can be measured yet
 * (just come into view, or back after a long loss): neither a movement nor a
 * rest. A frame is moving when any hand moves, and resting when every hand
 * that can be measured rests.
 */
function movingFrames(frames: readonly LandmarkFrame[]): (boolean | null)[] {
  const moving = new Array<boolean | null>(frames.length).fill(null);
  for (const side of SIDES) {
    const seen: { tMs: number; at: Point }[] = [];
    frames.forEach((frame, index) => {
      const hand = frame[side];
      if (hand === null) return;
      const here = centre(hand);
      let earlier: { tMs: number; at: Point } | null = null;
      for (let back = seen.length - 1; back >= 0; back -= 1) {
        const candidate = seen[back]!;
        if (frame.tMs - candidate.tMs >= SPEED_SPAN_MS) {
          earlier = frame.tMs - candidate.tMs <= SPEED_SPAN_MS + MAX_BRIDGED_GAP_MS ? candidate : null;
          break;
        }
      }
      seen.push({ tMs: frame.tMs, at: here });
      const scale = scaleOf(frame);
      if (earlier === null || !(scale > 0)) return;
      const seconds = (frame.tMs - earlier.tMs) / 1000;
      const speed = Math.hypot(here[0] - earlier.at[0], here[1] - earlier.at[1]) / scale / seconds;
      if (speed >= REST_SPEED) moving[index] = true;
      else if (moving[index] !== true) moving[index] = false;
    });
  }
  return moving;
}

/**
 * Cuts `frames` (one continuous stream, timestamps not decreasing) into
 * gesture segments. `nowMs`: the time of the stream's end (default: the last
 * frame's); a gesture whose last hand frame is less than `SEGMENT_GAP_MS`
 * before it may still go on and is returned as `open`.
 */
export function segmentStream(frames: readonly LandmarkFrame[], mode: SegmentMode, nowMs?: number): StreamSegments {
  const endMs = nowMs ?? (frames.length === 0 ? 0 : frames[frames.length - 1]!.tMs);
  // First by "away": runs of frames from the first to the last hand frame, split at gaps longer than SEGMENT_GAP_MS.
  const runs: [number, number][] = [];
  let first = -1;
  let last = -1;
  frames.forEach((frame, index) => {
    if (!hasHand(frame)) return;
    if (first >= 0 && frame.tMs - frames[last]!.tMs > SEGMENT_GAP_MS) {
      runs.push([first, last]);
      first = -1;
    }
    if (first < 0) first = index;
    last = index;
  });
  let open: [number, number] | null = null;
  if (first >= 0) {
    if (endMs - frames[last]!.tMs > SEGMENT_GAP_MS) runs.push([first, last]);
    else open = [first, last];
  }
  const moving = mode === "rest" ? movingFrames(frames) : [];
  const segments: LandmarkFrame[][] = [];
  let tooLong = 0;
  const keep = (from: number, to: number): void => {
    const part = frames.slice(from, to + 1);
    if (part[part.length - 1]!.tMs - part[0]!.tMs > SEGMENT_MAX_MS) tooLong += 1;
    else segments.push(part);
  };
  /** "rest" mode: split one run at rests of REST_SPLIT_MS after a movement; returns where the unfinished last part starts. */
  const splitAtRests = (from: number, to: number, finished: boolean): number => {
    let start = from;
    let moved = false;
    let restFrom = -1;
    for (let index = from; index <= to; index += 1) {
      const frame = frames[index]!;
      if (!hasHand(frame) || moving[index] === null) continue;
      if (moving[index] === true) {
        moved = true;
        restFrom = -1;
        continue;
      }
      if (restFrom < 0) restFrom = index;
      if (moved && frame.tMs - frames[restFrom]!.tMs >= REST_SPLIT_MS) {
        // Cut in the middle of the rest: the first frame at or after its midpoint starts the next part.
        const middle = frames[restFrom]!.tMs + (frame.tMs - frames[restFrom]!.tMs) / 2;
        let cut = restFrom;
        while (frames[cut]!.tMs < middle) cut += 1;
        keep(start, cut - 1);
        start = cut;
        moved = false;
        restFrom = -1;
      }
    }
    // A last part that never moved is the rest left after a cut: no gesture.
    if (finished && start <= to && (moved || start === from)) keep(start, to);
    return start;
  };
  for (const [from, to] of runs) {
    if (mode === "rest") splitAtRests(from, to, true);
    else keep(from, to);
  }
  if (open !== null && mode === "rest") open = [splitAtRests(open[0], open[1], false), open[1]];
  return { segments, tooLong, open: open === null ? null : frames.slice(open[0], open[1] + 1) };
}
