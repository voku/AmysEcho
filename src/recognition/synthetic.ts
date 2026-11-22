/**
 * Seeded synthetic gestures for tests and the public evaluation gate.
 *
 * These are made-up hand movements, not recordings of anyone. They prove that
 * the pipeline is deterministic and survives the distortions modelled below.
 * They say nothing about how well a real child's gestures are recognised.
 */
import { HAND_POINTS, type LandmarkFrame, type Point } from "./features.js";

/** Small deterministic random source (mulberry32). */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}

interface HandPath {
  /** Wrist position in shoulder widths, relative to the point between the shoulders. */
  readonly start: Point;
  readonly via: Point;
  readonly end: Point;
  /** Finger curl per finger, 0 = straight and 1 = closed, at the start and at the end. */
  readonly curlStart: readonly number[];
  readonly curlEnd: readonly number[];
  readonly rotation: number;
}

export interface SyntheticGesture {
  readonly left: HandPath | null;
  readonly right: HandPath | null;
  /** Length of the movement in frames of about 37 ms. */
  readonly frames: number;
}

/** Which hands a generated gesture uses. */
export type SyntheticHands = "left" | "right" | "both";

function randomPath(random: () => number, side: 1 | -1): HandPath {
  const position = (): Point => [side * (0.1 + random() * 0.9), -0.9 + random() * 1.9];
  const curls = (): number[] => Array.from({ length: 5 }, () => (random() < 0.5 ? random() * 0.2 : 0.7 + random() * 0.3));
  return { start: position(), via: position(), end: position(), curlStart: curls(), curlEnd: curls(), rotation: (random() - 0.5) * 1.6 };
}

/** Without `hands`: the right hand, and in two of five gestures the left one as well. */
export function createGesture(seed: number, hands?: SyntheticHands): SyntheticGesture {
  const random = createRandom(seed);
  const right = randomPath(random, 1);
  const withLeft = random() < 0.4;
  const left = randomPath(random, -1);
  const frames = 24 + Math.floor(random() * 30);
  if (hands === undefined) return { right, left: withLeft ? left : null, frames };
  return { right: hands === "left" ? null : right, left: hands === "right" ? null : left, frames };
}

/**
 * A gesture that is easy to confuse with the given one: it ends half a
 * shoulder width away, or two fingers are held differently. Used as a hard
 * "this is not a known gesture" case.
 */
export function createLookAlike(gesture: SyntheticGesture, seed: number, kind: "ends-elsewhere" | "other-fingers"): SyntheticGesture {
  const random = createRandom(seed);
  // The hand that is changed: the right one where the gesture has it.
  const side = gesture.right !== null ? "right" : "left";
  const hand = gesture[side]!;
  if (kind === "ends-elsewhere") {
    const angle = random() * 2 * Math.PI;
    const end: Point = [hand.end[0] + Math.cos(angle) * 0.5, hand.end[1] + Math.sin(angle) * 0.5];
    return { ...gesture, [side]: { ...hand, end } };
  }
  const first = Math.floor(random() * 5);
  const second = (first + 1 + Math.floor(random() * 4)) % 5;
  const flip = (curls: readonly number[]): number[] =>
    curls.map((curl, finger) => (finger === first || finger === second ? 1 - curl : curl));
  return { ...gesture, [side]: { ...hand, curlStart: flip(hand.curlStart), curlEnd: flip(hand.curlEnd) } };
}

function handShape(curls: readonly number[], rotation: number): Point[] {
  const points: Point[] = [[0, 0]];
  for (let finger = 0; finger < 5; finger += 1) {
    let angle = rotation - Math.PI / 2 + (finger - 2) * 0.35;
    let x = Math.cos(angle) * 0.35;
    let y = Math.sin(angle) * 0.35;
    points.push([x, y]);
    for (let joint = 1; joint < 4; joint += 1) {
      angle += curls[finger]! * 1.3;
      x += Math.cos(angle) * 0.25;
      y += Math.sin(angle) * 0.25;
      points.push([x, y]);
    }
  }
  return points;
}

/** What a real capture adds to the movement itself. Times in milliseconds. */
export interface Disturbance {
  /** The hands of the gesture rest in view, at the start posture, for this long before the movement. */
  readonly restBeforeMs?: number;
  /** And at the end posture afterwards. A resting hand is never quite still. */
  readonly restAfterMs?: number;
  /** One-hand gestures: the other hand passes through the picture for this long during the movement. */
  readonly strayHandMs?: number;
  /** One hand of the gesture (the left one of a two-hand gesture) is lost for this long in the middle. */
  readonly dropoutMs?: number;
  /** One-hand gestures: the other hand rests in view for the whole capture. */
  readonly otherHandRests?: boolean;
  /** Mean time between frames; default 37 (about 27 frames per second). */
  readonly frameMs?: number;
  /** 0 = steady; 0.5 = each interval between half and one and a half times `frameMs`. */
  readonly frameJitter?: number;
}

/** How one attempt differs from the ideal gesture. All amounts are in shoulder widths unless noted. */
export interface Variation {
  readonly seed: number;
  /** Camera placement for a whole recording session: shift, zoom and tilt. */
  readonly session: { readonly shift: Point; readonly zoom: number; readonly tilt: number };
  /** 0 = perfect repetition, 1 = a sloppy but recognisable one. */
  readonly sloppiness: number;
  readonly disturbance?: Disturbance;
}

export function createSession(seed: number): Variation["session"] {
  const random = createRandom(seed);
  return {
    shift: [(random() - 0.5) * 200, (random() - 0.5) * 200],
    zoom: 120 + random() * 160,
    tilt: (random() - 0.5) * 0.2,
  };
}

const HAND_SIZE = 0.3;
const FRAME_MS = 37;
/** How much the wrist of a resting hand wanders from frame to frame. */
const REST_JITTER = 0.004;

/**
 * Renders one attempt as landmark frames in "pixels": frames without a hand
 * before and after, the hands resting, the movement, and the tracking faults a
 * phone camera produces. The movement lasts `gesture.frames` times 37 ms
 * whatever the frame rate.
 */
export function renderGesture(gesture: SyntheticGesture, variation: Variation): LandmarkFrame[] {
  const random = createRandom(variation.seed);
  const s = variation.sloppiness;
  const disturbance = variation.disturbance ?? {};
  const { shift, zoom, tilt } = variation.session;
  const toCamera = ([x, y]: Point): Point => [
    (x * Math.cos(tilt) - y * Math.sin(tilt)) * zoom + shift[0],
    (x * Math.sin(tilt) + y * Math.cos(tilt)) * zoom + shift[1],
  ];
  const frameCount = Math.max(8, Math.round(gesture.frames * (1 + (random() - 0.5) * 0.6 * s)));
  const idleBefore = Math.floor(random() * 10);
  const idleAfter = Math.floor(random() * 10);
  const warp = 1 + (random() - 0.5) * 0.8 * s;
  const placement: Point = [gaussian(random) * 0.08 * s, gaussian(random) * 0.08 * s];
  const bodySway: Point = [gaussian(random) * 0.03 * s, gaussian(random) * 0.03 * s];
  const shoulders = (): [Point, Point] => [
    toCamera([-0.5 + bodySway[0] + gaussian(random) * 0.01, bodySway[1] + gaussian(random) * 0.01]),
    toCamera([0.5 + bodySway[0] + gaussian(random) * 0.01, bodySway[1] + gaussian(random) * 0.01]),
  ];

  const renderHand = (path: HandPath, progress: number, offset: Point = [0, 0]): Point[] => {
    const u = 1 - progress;
    const wrist: Point = [
      u * u * path.start[0] + 2 * u * progress * path.via[0] + progress * progress * path.end[0] + placement[0] + offset[0],
      u * u * path.start[1] + 2 * u * progress * path.via[1] + progress * progress * path.end[1] + placement[1] + offset[1],
    ];
    const curls = path.curlStart.map((from, finger) => from + (path.curlEnd[finger]! - from) * progress + gaussian(random) * 0.05 * s);
    return handShape(curls, path.rotation + gaussian(random) * 0.05 * s).map(([x, y]) => toCamera([
      wrist[0] + x * HAND_SIZE + gaussian(random) * 0.01 * s,
      wrist[1] + y * HAND_SIZE + gaussian(random) * 0.01 * s,
    ]));
  };
  const resting = (path: HandPath, progress: number): Point[] => renderHand(path, progress, [gaussian(random) * REST_JITTER, gaussian(random) * REST_JITTER]);

  const frameMs = disturbance.frameMs ?? FRAME_MS;
  const frames: LandmarkFrame[] = [];
  let tMs = 0;
  const push = (left: Point[] | null, right: Point[] | null): void => {
    frames.push({ tMs: Math.round(tMs), left, right, shoulders: shoulders() });
    tMs += frameMs * (1 + (random() * 2 - 1) * (disturbance.frameJitter ?? 0.1));
  };
  const duration = frameCount * FRAME_MS;
  const oneHanded = gesture.left === null || gesture.right === null;
  // What the other hand of a one-hand gesture does, if anything.
  const other = oneHanded ? randomPath(random, gesture.right === null ? 1 : -1) : null;
  const strayMs = other !== null ? disturbance.strayHandMs ?? 0 : 0;
  const strayFrom = (duration - strayMs) * (0.2 + random() * 0.6);
  const dropoutMs = disturbance.dropoutMs ?? 0;
  const dropoutFrom = duration * 0.15 + random() * Math.max(0, duration * 0.7 - dropoutMs);
  const dropoutSide = gesture.left !== null ? "left" : "right";
  const otherRests = other !== null && disturbance.otherHandRests === true;

  /** One frame: `progress` of the movement, or a rest at its start (0) or end (1); `elapsed` is the time into the movement, or null outside it. Without `own` only the other hand is shown. */
  const frame = (progress: number, elapsed: number | null, rest: boolean, own = true): void => {
    const hands: Record<"left" | "right", Point[] | null> = { left: null, right: null };
    for (const side of ["left", "right"] as const) {
      const path = gesture[side];
      if (path === null) {
        if (other === null) continue;
        if (otherRests) hands[side] = resting(other, 0);
        else if (elapsed !== null && strayMs > 0 && elapsed >= strayFrom && elapsed <= strayFrom + strayMs) hands[side] = renderHand(other, (elapsed - strayFrom) / strayMs);
        continue;
      }
      if (!own) continue;
      // Inside the movement a hand may briefly be lost; the first and last frame of it always show the hand.
      const edge = elapsed === null || elapsed === 0 || elapsed >= duration;
      const lost = !edge && (random() < 0.08 * s || (side === dropoutSide && dropoutMs > 0 && elapsed >= dropoutFrom && elapsed <= dropoutFrom + dropoutMs));
      hands[side] = lost ? null : rest ? resting(path, progress) : renderHand(path, progress);
    }
    push(hands.left, hands.right);
  };

  for (let i = 0; i < idleBefore; i += 1) {
    if (otherRests) frame(0, null, true, false);
    else push(null, null);
  }
  const restStart = tMs;
  while (tMs - restStart < (disturbance.restBeforeMs ?? 0)) frame(0, null, true);
  const start = tMs;
  frame(0, 0, false);
  while (tMs - start < duration) frame(Math.pow((tMs - start) / duration, warp), tMs - start, false);
  frame(1, duration, false);
  const restEnd = tMs;
  while (tMs - restEnd < (disturbance.restAfterMs ?? 0)) frame(1, null, true);
  for (let i = 0; i < idleAfter; i += 1) {
    if (otherRests) frame(1, null, true, false);
    else push(null, null);
  }
  return frames;
}

if (HAND_POINTS !== 21) {
  throw new Error("synthetic hand model assumes 21 landmarks");
}
