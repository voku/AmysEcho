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
  readonly right: HandPath;
  readonly frames: number;
}

function randomPath(random: () => number, side: 1 | -1): HandPath {
  const position = (): Point => [side * (0.1 + random() * 0.9), -0.9 + random() * 1.9];
  const curls = (): number[] => Array.from({ length: 5 }, () => (random() < 0.5 ? random() * 0.2 : 0.7 + random() * 0.3));
  return { start: position(), via: position(), end: position(), curlStart: curls(), curlEnd: curls(), rotation: (random() - 0.5) * 1.6 };
}

export function createGesture(seed: number): SyntheticGesture {
  const random = createRandom(seed);
  return {
    right: randomPath(random, 1),
    left: random() < 0.4 ? randomPath(random, -1) : null,
    frames: 24 + Math.floor(random() * 30),
  };
}

/**
 * A gesture that is easy to confuse with the given one: it ends half a
 * shoulder width away, or two fingers are held differently. Used as a hard
 * "this is not a known gesture" case.
 */
export function createLookAlike(gesture: SyntheticGesture, seed: number, kind: "ends-elsewhere" | "other-fingers"): SyntheticGesture {
  const random = createRandom(seed);
  const right = gesture.right;
  if (kind === "ends-elsewhere") {
    const angle = random() * 2 * Math.PI;
    const end: Point = [right.end[0] + Math.cos(angle) * 0.5, right.end[1] + Math.sin(angle) * 0.5];
    return { ...gesture, right: { ...right, end } };
  }
  const first = Math.floor(random() * 5);
  const second = (first + 1 + Math.floor(random() * 4)) % 5;
  const flip = (curls: readonly number[]): number[] =>
    curls.map((curl, finger) => (finger === first || finger === second ? 1 - curl : curl));
  return { ...gesture, right: { ...right, curlStart: flip(right.curlStart), curlEnd: flip(right.curlEnd) } };
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

/** How one attempt differs from the ideal gesture. All amounts are in shoulder widths unless noted. */
export interface Variation {
  readonly seed: number;
  /** Camera placement for a whole recording session: shift, zoom and tilt. */
  readonly session: { readonly shift: Point; readonly zoom: number; readonly tilt: number };
  /** 0 = perfect repetition, 1 = a sloppy but recognisable one. */
  readonly sloppiness: number;
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

/**
 * Renders one attempt as landmark frames in "pixels", with idle frames before
 * and after the movement and with the tracking faults a phone camera produces.
 */
export function renderGesture(gesture: SyntheticGesture, variation: Variation): LandmarkFrame[] {
  const random = createRandom(variation.seed);
  const s = variation.sloppiness;
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

  const renderHand = (path: HandPath, progress: number): Point[] => {
    const u = 1 - progress;
    const wrist: Point = [
      u * u * path.start[0] + 2 * u * progress * path.via[0] + progress * progress * path.end[0] + placement[0],
      u * u * path.start[1] + 2 * u * progress * path.via[1] + progress * progress * path.end[1] + placement[1],
    ];
    const curls = path.curlStart.map((from, finger) => from + (path.curlEnd[finger]! - from) * progress + gaussian(random) * 0.05 * s);
    return handShape(curls, path.rotation + gaussian(random) * 0.05 * s).map(([x, y]) => toCamera([
      wrist[0] + x * HAND_SIZE + gaussian(random) * 0.01 * s,
      wrist[1] + y * HAND_SIZE + gaussian(random) * 0.01 * s,
    ]));
  };

  const frames: LandmarkFrame[] = [];
  let tMs = 0;
  const push = (left: Point[] | null, right: Point[] | null): void => {
    frames.push({ tMs, left, right, shoulders: shoulders() });
    tMs += 33 + Math.floor(random() * 8);
  };
  for (let i = 0; i < idleBefore; i += 1) push(null, null);
  for (let i = 0; i < frameCount; i += 1) {
    const progress = Math.pow(i / (frameCount - 1), warp);
    // The first and last frame always show the hand; in between a hand may briefly be lost.
    const lost = (): boolean => i > 0 && i < frameCount - 1 && random() < 0.08 * s;
    const right = lost() ? null : renderHand(gesture.right, progress);
    const left = gesture.left === null || lost() ? null : renderHand(gesture.left, progress);
    push(left, right);
  }
  for (let i = 0; i < idleAfter; i += 1) push(null, null);
  return frames;
}

if (HAND_POINTS !== 21) {
  throw new Error("synthetic hand model assumes 21 landmarks");
}
