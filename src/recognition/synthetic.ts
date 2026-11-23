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

/**
 * What one hand does over a scripted capture: where its wrist is (in shoulder
 * widths from the point between the shoulders) and how its fingers are curled
 * at a time, or null while it is out of view.
 */
export type HandScript = (tMs: number) => { readonly wrist: Point; readonly curls: readonly number[] } | null;

export interface ScriptedCapture {
  readonly durationMs: number;
  readonly left: HandScript | null;
  readonly right: HandScript | null;
}

const between = (from: number, to: number, share: number): number => from + (to - from) * share;

/**
 * A hand that rests at `from`, goes to `to` between `startMs` and `startMs +
 * moveMs` while its fingers change from `curls` to `curlsEnd`, and rests there.
 * With `from` equal to `to` only the shape changes; without `curlsEnd` as well
 * it is a hand held still. It is in view from `visibleFromMs` to `visibleUntilMs`.
 */
export function scriptedHand(options: {
  readonly from: Point; readonly to?: Point; readonly curls: readonly number[]; readonly curlsEnd?: readonly number[];
  readonly startMs?: number; readonly moveMs?: number; readonly visibleFromMs?: number; readonly visibleUntilMs?: number;
}): HandScript {
  const to = options.to ?? options.from;
  const curlsEnd = options.curlsEnd ?? options.curls;
  return (tMs) => {
    if (tMs < (options.visibleFromMs ?? 0) || tMs > (options.visibleUntilMs ?? Number.POSITIVE_INFINITY)) return null;
    const share = Math.min(Math.max((tMs - (options.startMs ?? 0)) / (options.moveMs ?? 1), 0), 1);
    return {
      wrist: [between(options.from[0], to[0], share), between(options.from[1], to[1], share)],
      curls: options.curls.map((curl, finger) => between(curl, curlsEnd[finger]!, share)),
    };
  };
}

/** The same hand, fidgeting once: out by `size` and back, and as far to the other side and back, within `lengthMs`. */
export function fidgeting(hand: HandScript, startMs: number, lengthMs: number, size: number): HandScript {
  return (tMs) => {
    const at = hand(tMs);
    if (at === null) return null;
    const swing = Math.sin(Math.min(Math.max((tMs - startMs) / lengthMs, 0), 1) * 2 * Math.PI);
    return { ...at, wrist: [at.wrist[0] + size * swing, at.wrist[1] + (size / 2) * swing] };
  };
}

/** The same hand with a tremor of `size` shoulder widths at `hertz`. */
export function trembling(hand: HandScript, hertz: number, size: number): HandScript {
  return (tMs) => {
    const at = hand(tMs);
    if (at === null) return null;
    const turn = (tMs / 1000) * 2 * Math.PI * hertz;
    return { ...at, wrist: [at.wrist[0] + Math.sin(turn) * size, at.wrist[1] + Math.cos(turn * 0.9) * size] };
  };
}

/** How a tracker shows a scripted capture. */
export interface Tracking {
  /** How far a hand's landmarks wander together from frame to frame, in shoulder widths (standard deviation); default 0.004. */
  readonly noise?: number;
  /** Mean time between frames; default 37 (about 27 frames per second). Each interval varies by a tenth either way. */
  readonly frameMs?: number;
  /** In this many frames, picked at random, the whole right hand is shown `jumpSize` shoulder widths off, in a random direction: a tracker's wrong frame. */
  readonly jumps?: number;
  readonly jumpSize?: number;
}

/** Renders a scripted capture as landmark frames, with shoulders and tracking jitter. */
export function renderScript(capture: ScriptedCapture, variation: Pick<Variation, "seed" | "session"> & Tracking): LandmarkFrame[] {
  const random = createRandom(variation.seed);
  const { shift, zoom, tilt } = variation.session;
  const toCamera = ([x, y]: Point): Point => [
    (x * Math.cos(tilt) - y * Math.sin(tilt)) * zoom + shift[0],
    (x * Math.sin(tilt) + y * Math.cos(tilt)) * zoom + shift[1],
  ];
  const render = (script: HandScript | null, tMs: number): Point[] | null => {
    const at = script === null ? null : script(tMs);
    if (at === null) return null;
    const noise = variation.noise ?? REST_JITTER;
    const wander: Point = [gaussian(random) * noise, gaussian(random) * noise];
    return handShape(at.curls, 0).map(([x, y]) => toCamera([
      at.wrist[0] + wander[0] + x * HAND_SIZE + gaussian(random) * 0.003,
      at.wrist[1] + wander[1] + y * HAND_SIZE + gaussian(random) * 0.003,
    ]));
  };
  const frames: LandmarkFrame[] = [];
  for (let tMs = 0; tMs <= capture.durationMs; tMs += (variation.frameMs ?? FRAME_MS) * (0.9 + random() * 0.2)) {
    frames.push({
      tMs: Math.round(tMs),
      left: render(capture.left, tMs),
      right: render(capture.right, tMs),
      shoulders: [toCamera([-0.5 + gaussian(random) * 0.01, gaussian(random) * 0.01]), toCamera([0.5 + gaussian(random) * 0.01, gaussian(random) * 0.01])],
    });
  }
  for (let jump = 0; jump < (variation.jumps ?? 0); jump += 1) {
    const shown = frames.flatMap((frame, index) => (frame.right === null ? [] : [index]));
    if (shown.length === 0) break;
    const index = shown[Math.floor(random() * shown.length)]!;
    const angle = random() * 2 * Math.PI;
    const [dx, dy] = [Math.cos(angle) * (variation.jumpSize ?? 0) * zoom, Math.sin(angle) * (variation.jumpSize ?? 0) * zoom];
    frames[index] = { ...frames[index]!, right: frames[index]!.right!.map(([x, y]) => [x + dx, y + dy] as Point) };
  }
  return frames;
}

if (HAND_POINTS !== 21) {
  throw new Error("synthetic hand model assumes 21 landmarks");
}
