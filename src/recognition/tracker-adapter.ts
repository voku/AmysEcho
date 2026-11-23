/**
 * MediaPipe Tasks Vision output to the matcher's `LandmarkFrame` (card NG-3,
 * decision record docs/tracker-decision.md, input contract docs/recognition.md).
 *
 * What this guarantees for the matcher:
 * - **Equal scale on both axes.** Normalised coordinates (0 to 1 of image
 *   width and of image height) are multiplied by the size of the image the
 *   tracker saw, so the result is in pixels.
 * - **`left` is the child's own left hand**, wherever it is in the picture.
 *   Frames go to the tracker unflipped, exactly as the camera delivers them;
 *   on such frames MediaPipe's label "Left" was the subject's own left hand
 *   (spike of card NG-16). `inputMirrored` is for a source that delivers
 *   flipped frames: the label is swapped and x flipped back.
 * - **One label per physical hand.** Each hand is followed through the
 *   capture by its wrist and gets the score-weighted majority of its
 *   per-frame labels, so a label that flickers on single frames, or hands
 *   that cross, do not move a hand into the other slot.
 * - A missing hand is `null`; shoulders (pose landmarks 11 and 12) are `null`
 *   unless both are usable.
 *
 * Nothing here imports MediaPipe or touches the DOM: the input types are
 * structural, so synthetic tracker output can be replayed in Node tests.
 * Nothing here stores anything.
 */
import { HAND_POINTS, MAX_BRIDGED_GAP_MS, type LandmarkFrame, type Point } from "./features.js";

/** A MediaPipe NormalizedLandmark: x and y are 0..1 of image width and height. */
export interface TrackerPoint {
  readonly x: number;
  readonly y: number;
  readonly visibility?: number;
}

export interface TrackerHand {
  /** 21 points in MediaPipe hand order. */
  readonly landmarks: readonly TrackerPoint[];
  /** `handedness[i][0].categoryName` of a HandLandmarkerResult: "Left" or "Right". */
  readonly label: string;
  /** `handedness[i][0].score`. */
  readonly score: number;
}

/** What the capture loop keeps per camera frame, in memory only. */
export interface TrackerFrame {
  /** Milliseconds on any clock; must not decrease. */
  readonly timestampMs: number;
  /** Size of the image that was given to the tracker. */
  readonly imageWidth: number;
  readonly imageHeight: number;
  /** Up to two hands (numHands: 2). */
  readonly hands: readonly TrackerHand[];
  /** The 33 pose landmarks of the first person, or null when pose did not run on this frame or found nobody. */
  readonly pose: readonly TrackerPoint[] | null;
}

export interface AdapterOptions {
  /**
   * False (default): frames came straight from the camera. True: they were
   * flipped horizontally before tracking; the label is swapped and x flipped
   * back, so both give the same output.
   */
  readonly inputMirrored?: boolean;
  /**
   * Both shoulders need at least this pose visibility (default 0.5). The pose
   * model also reports high visibility for shoulders it only guesses, so this
   * is a weak guard, not a reliable filter (card NG-16 review).
   */
  readonly minShoulderVisibility?: number;
  /**
   * "auto" (default): shoulders whenever pose saw them. "never": always
   * `null`, so every capture is anchored to the hands. A profile must use one
   * of the two for all its examples and attempts.
   */
  readonly shoulders?: "auto" | "never";
}

export interface CaptureAdapterOptions extends AdapterOptions {
  /**
   * A followed hand seen in fewer frames than this is removed. Default 1:
   * nothing is removed. A hand seen only in single frames may be a false
   * detection, but it may also be a real second hand that the tracker keeps
   * losing; removing it can turn the matcher's `hands_unclear` (safe: no
   * answer) into a one-hand match or `too_far`. Kept, the matcher's own visit
   * rules decide, as they were designed and evaluated to (docs/capture.md,
   * "Ghost hands").
   */
  readonly minTrackFrames?: number;
}

export const POSE_LEFT_SHOULDER = 11;
export const POSE_RIGHT_SHOULDER = 12;
/** Default for `minTrackFrames`: keep every sighting. */
export const MIN_TRACK_FRAMES = 1;
/** A followed hand not seen for longer than this ends; the matcher does not bridge longer gaps either. */
export const MAX_TRACK_GAP_MS = MAX_BRIDGED_GAP_MS;
/**
 * How far a wrist may move between two sightings and still be the same hand:
 * `MIN_JUMP_HAND_SIZES` at any frame rate, more after a longer gap at
 * `MAX_HAND_SPEED` hand sizes per second.
 */
export const MIN_JUMP_HAND_SIZES = 1.5;
export const MAX_HAND_SPEED = 20;

type Side = "left" | "right";

function toPixels(point: TrackerPoint, frame: TrackerFrame, mirrored: boolean): Point {
  const x = mirrored ? 1 - point.x : point.x;
  return [x * frame.imageWidth, point.y * frame.imageHeight];
}

function finite(point: TrackerPoint | undefined): point is TrackerPoint {
  return point !== undefined && Number.isFinite(point.x) && Number.isFinite(point.y);
}

/** 21 finite points with the wrist apart from the middle-finger base, as `features.ts` requires. */
function usableHand(hand: TrackerHand): boolean {
  if (hand.landmarks.length !== HAND_POINTS || !hand.landmarks.every(finite)) return false;
  const wrist = hand.landmarks[0]!;
  const middle = hand.landmarks[9]!;
  return wrist.x !== middle.x || wrist.y !== middle.y;
}

function usableFrame(frame: TrackerFrame): boolean {
  return Number.isFinite(frame.timestampMs) && frame.imageWidth > 0 && frame.imageHeight > 0;
}

/** The child's side a label names, or null for a label that is neither. */
export function sideOfLabel(label: string, mirrored = false): Side | null {
  if (label !== "Left" && label !== "Right") return null;
  return (label === "Left") !== mirrored ? "left" : "right";
}

function other(side: Side): Side {
  return side === "left" ? "right" : "left";
}

/**
 * The two shoulders of a frame, child's left first, or null: pose did not
 * run, found nobody, a shoulder is outside the picture, or not visible enough.
 */
export function shouldersOf(frame: TrackerFrame, options: AdapterOptions = {}): [Point, Point] | null {
  if ((options.shoulders ?? "auto") === "never" || frame.pose === null || !usableFrame(frame)) return null;
  const left = frame.pose[POSE_LEFT_SHOULDER];
  const right = frame.pose[POSE_RIGHT_SHOULDER];
  const minimum = options.minShoulderVisibility ?? 0.5;
  for (const point of [left, right]) {
    if (!finite(point) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return null;
    if (!((point.visibility ?? 0) >= minimum)) return null;
  }
  const mirrored = options.inputMirrored ?? false;
  return [toPixels(left!, frame, mirrored), toPixels(right!, frame, mirrored)];
}

/**
 * One frame on its own: each usable hand goes to the side its label names;
 * when both carry the same label, the more confident one keeps it and the
 * other takes the free side. Used for a live view; a capture for the matcher
 * goes through `toLandmarkFrames`.
 */
export function toLandmarkFrame(frame: TrackerFrame, startMs: number, options: AdapterOptions = {}): LandmarkFrame {
  const mirrored = options.inputMirrored ?? false;
  const result: { left: Point[] | null; right: Point[] | null } = { left: null, right: null };
  const hands = usableFrame(frame)
    ? frame.hands.filter((hand) => usableHand(hand) && sideOfLabel(hand.label) !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
    : [];
  for (const hand of hands) {
    const wanted = sideOfLabel(hand.label, mirrored)!;
    const side = result[wanted] === null ? wanted : other(wanted);
    result[side] = hand.landmarks.map((point) => toPixels(point, frame, mirrored));
  }
  return { tMs: frame.timestampMs - startMs, left: result.left, right: result.right, shoulders: shouldersOf(frame, options) };
}

interface Sighting {
  readonly frame: number;
  readonly points: Point[];
}

interface Track {
  wrist: Point;
  size: number;
  lastMs: number;
  votes: { left: number; right: number };
  readonly sightings: Sighting[];
}

function handSize(points: readonly Point[]): number {
  return Math.hypot(points[9]![0] - points[0]![0], points[9]![1] - points[0]![1]);
}

/**
 * The best way to continue the open tracks with this frame's hands: every
 * pairing within reach is tried and the one with the smallest total wrist
 * distance wins, so two hands that pass each other keep their tracks.
 */
function pairHands(open: readonly Track[], hands: readonly { points: Point[] }[], nowMs: number): (Track | null)[] {
  let best: (Track | null)[] = hands.map(() => null);
  let bestPaired = 0;
  let bestCost = 0;
  const reach = (track: Track, points: Point[]): number => {
    const distance = Math.hypot(track.wrist[0] - points[0]![0], track.wrist[1] - points[0]![1]);
    const seconds = Math.max(0, nowMs - track.lastMs) / 1000;
    const allowed = Math.max(track.size, handSize(points)) * Math.max(MIN_JUMP_HAND_SIZES, MAX_HAND_SPEED * seconds);
    return distance <= allowed ? distance : Number.NaN;
  };
  const choose = (index: number, chosen: (Track | null)[], paired: number, cost: number): void => {
    if (index === hands.length) {
      if (paired > bestPaired || (paired === bestPaired && cost < bestCost)) {
        best = [...chosen];
        bestPaired = paired;
        bestCost = cost;
      }
      return;
    }
    choose(index + 1, [...chosen, null], paired, cost);
    for (const track of open) {
      if (chosen.includes(track)) continue;
      const distance = reach(track, hands[index]!.points);
      if (!Number.isNaN(distance)) choose(index + 1, [...chosen, track], paired + 1, cost + distance);
    }
  };
  choose(0, [], 0, 0);
  return best;
}

/**
 * A whole capture to matcher frames: timestamps from the first frame, pixels,
 * one side per followed hand (score-weighted label majority; of two hands seen
 * at the same time the one seen longer chooses first, the other takes the
 * other side); followed hands of fewer than `minTrackFrames` frames removed (none by default).
 */
export function toLandmarkFrames(capture: readonly TrackerFrame[], options: CaptureAdapterOptions = {}): LandmarkFrame[] {
  const mirrored = options.inputMirrored ?? false;
  const startMs = capture[0]?.timestampMs ?? 0;
  const tracks: Track[] = [];
  capture.forEach((frame, index) => {
    if (!usableFrame(frame)) return;
    const hands = frame.hands
      .filter((hand) => usableHand(hand) && sideOfLabel(hand.label) !== null)
      .slice(0, 2)
      .map((hand) => ({ hand, points: hand.landmarks.map((point) => toPixels(point, frame, mirrored)) }));
    const open = tracks.filter((track) => frame.timestampMs - track.lastMs <= MAX_TRACK_GAP_MS);
    const pairing = pairHands(open, hands, frame.timestampMs);
    hands.forEach(({ hand, points }, position) => {
      let track = pairing[position] ?? null;
      if (track === null) {
        track = { wrist: points[0]!, size: handSize(points), lastMs: frame.timestampMs, votes: { left: 0, right: 0 }, sightings: [] };
        tracks.push(track);
      }
      track.wrist = points[0]!;
      track.size = handSize(points);
      track.lastMs = frame.timestampMs;
      track.votes[sideOfLabel(hand.label, mirrored)!] += Number.isFinite(hand.score) && hand.score > 0 ? hand.score : 0;
      track.sightings.push({ frame: index, points });
    });
  });

  const minFrames = Math.max(1, options.minTrackFrames ?? MIN_TRACK_FRAMES);
  const kept = tracks
    .filter((track) => track.sightings.length >= minFrames)
    // Longest first; equal lengths in the order they appeared, so the result does not depend on sort stability.
    .map((track, order) => ({ track, order }))
    .sort((a, b) => b.track.sightings.length - a.track.sightings.length || a.order - b.order)
    .map(({ track }) => track);
  const placed: { track: Track; side: Side; frames: Set<number> }[] = [];
  for (const track of kept) {
    const frames = new Set(track.sightings.map((sighting) => sighting.frame));
    let side: Side = track.votes.left >= track.votes.right ? "left" : "right";
    const overlaps = (entry: { side: Side; frames: Set<number> }, wanted: Side): boolean =>
      entry.side === wanted && [...frames].some((frame) => entry.frames.has(frame));
    if (placed.some((entry) => overlaps(entry, side))) side = other(side);
    placed.push({ track, side, frames });
  }

  const result = capture.map((frame) => ({
    tMs: frame.timestampMs - startMs,
    left: null as Point[] | null,
    right: null as Point[] | null,
    shoulders: shouldersOf(frame, options),
  }));
  for (const { track, side } of placed) {
    for (const sighting of track.sightings) {
      const target = result[sighting.frame]!;
      // A shorter track that overlaps on both sides never overwrites a longer one.
      if (target[side] === null) target[side] = sighting.points;
    }
  }
  return result;
}

/** How many hands and whether both shoulders one frame shows, for a live view. */
export function frameSummary(frame: TrackerFrame, options: AdapterOptions = {}): { readonly hands: 0 | 1 | 2; readonly shoulders: boolean } {
  const single = toLandmarkFrame(frame, frame.timestampMs, options);
  const hands = (single.left === null ? 0 : 1) + (single.right === null ? 0 : 1);
  return { hands: hands as 0 | 1 | 2, shoulders: single.shoulders !== null };
}
