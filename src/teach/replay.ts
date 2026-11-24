/**
 * A stored gesture example as a moving stick-figure hand (card NG-4).
 *
 * Nothing of the recording is kept but the matcher's features (docs/
 * recognition.md, "Stored examples"): per step and hand, the 20 joints
 * relative to the wrist in hand lengths, and the wrist relative to the
 * shoulders (or, without shoulders, to the centre of the hand movement) in
 * shoulder widths. That is enough to draw the shape and the path of each
 * hand again. What is lost: the size of the hand (drawn at a third of a
 * shoulder width, the scale the features assume), the face, the body and
 * anything else in the picture. So the replay shows what the app compares,
 * not what the camera saw.
 *
 * Pure geometry here; the caregiver area draws it on a canvas.
 */
import { HAND_POINTS, SEQUENCE_STEPS, STEP_VALUES } from "../recognition/features.js";
import type { FeatureSequence, Point } from "../recognition/features.js";

/** The same bones as the camera preview (`HAND_CONNECTIONS` of capture.ts; a test keeps the two equal). */
export const REPLAY_CONNECTIONS: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
/** The colours of the camera preview (`PREVIEW_COLOURS` of capture.ts; a test keeps them equal). */
export const REPLAY_COLOURS = { left: "#ff8c1a", right: "#1ad1ff", shoulders: "#ffe14d" } as const;
/** Wrist to middle-finger base, in the units of the wrist position: the features put a hand at about a third of a shoulder width. */
export const REPLAY_HAND_SIZE = 1 / 3;

const HAND_VALUES = STEP_VALUES / 2;
const SHAPE_VALUES = (HAND_POINTS - 1) * 2;
/** The weight features.ts puts on the joint shape (`SHAPE_WEIGHT`); a round-trip test keeps the two equal. */
const SHAPE_WEIGHT = 1 / Math.sqrt(HAND_POINTS - 1);

export interface ReplayHand {
  readonly side: "left" | "right";
  /** 21 points in MediaPipe order, wrist first, in shoulder widths around the anchor; mirrored like the front-camera preview. */
  readonly points: readonly Point[];
}

/** One step of the replay: the hands seen in it (none, one or two). */
export interface ReplayStep {
  readonly hands: readonly ReplayHand[];
}

/**
 * The hands of each step of a stored sequence. A hand whose presence flag is
 * not set in a step (not in view then) is left out of that step. Left and
 * right are flipped as in the mirrored front-camera preview, so the
 * caregiver sees the gesture as they saw it while recording.
 */
export function replaySteps(sequence: Pick<FeatureSequence, "steps">): ReplayStep[] {
  return sequence.steps.map((step) => ({
    hands: (["left", "right"] as const).flatMap((side, at) => {
      const offset = at * HAND_VALUES;
      if (step[offset + SHAPE_VALUES + 2] !== 1) return [];
      const wrist: Point = [-(step[offset + SHAPE_VALUES] ?? 0), step[offset + SHAPE_VALUES + 1] ?? 0];
      const points: Point[] = [wrist];
      for (let joint = 1; joint < HAND_POINTS; joint += 1) {
        const x = ((step[offset + (joint - 1) * 2] ?? 0) / SHAPE_WEIGHT) * REPLAY_HAND_SIZE;
        const y = ((step[offset + (joint - 1) * 2 + 1] ?? 0) / SHAPE_WEIGHT) * REPLAY_HAND_SIZE;
        points.push([wrist[0] - x, wrist[1] + y]);
      }
      return [{ side, points }];
    }),
  }));
}

export interface ReplayBox {
  /** Pixel position of a replay point in a box of the given size. */
  readonly place: (point: Point) => Point;
}

/**
 * Fits every point of every step into a `width` × `height` box with a margin,
 * keeping proportions, so the whole movement stays in view and does not jump
 * around from step to step. Without any point, the box is centred on 0.
 */
export function replayBox(steps: readonly ReplayStep[], width: number, height: number, margin = 12): ReplayBox {
  const all = steps.flatMap((step) => step.hands.flatMap((hand) => hand.points));
  const xs = all.map((point) => point[0]);
  const ys = all.map((point) => point[1]);
  const minX = all.length === 0 ? -1 : Math.min(...xs);
  const maxX = all.length === 0 ? 1 : Math.max(...xs);
  const minY = all.length === 0 ? -1 : Math.min(...ys);
  const maxY = all.length === 0 ? 1 : Math.max(...ys);
  // A still hand has a tiny extent; never zoom in further than one hand length across the box.
  const spanX = Math.max(maxX - minX, REPLAY_HAND_SIZE);
  const spanY = Math.max(maxY - minY, REPLAY_HAND_SIZE);
  const scale = Math.min((width - 2 * margin) / spanX, (height - 2 * margin) / spanY);
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  return { place: ([x, y]) => [width / 2 + (x - centreX) * scale, height / 2 + (y - centreY) * scale] };
}

/** How long one step is shown: the recording's length spread over its steps, kept between 40 and 250 ms. */
export function replayStepMs(durationMs: number, steps = SEQUENCE_STEPS): number {
  const per = durationMs / Math.max(1, steps);
  return Number.isFinite(per) ? Math.min(250, Math.max(40, Math.round(per))) : 100;
}
