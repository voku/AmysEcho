import { buildFeatureSequence, type FeatureSequence } from "./features.js";
import { calibrateMaxDistance, DEFAULT_MIN_MARGIN, matchGesture, type GestureExample } from "./matcher.js";
import {
  createGesture, createLookAlike, createRandom, createSession, fidgeting, renderGesture, renderScript, scriptedHand, trembling,
  type Disturbance, type HandScript, type ScriptedCapture, type SyntheticGesture, type SyntheticHands, type Tracking,
} from "./synthetic.js";

/** One labelled attempt. `conceptId: null` means "not a gesture this profile knows". */
export interface LabelledAttempt {
  readonly conceptId: string | null;
  /** Which recording session the attempt belongs to (for example one day). */
  readonly sessionId: string;
  /** Null when no feature sequence could be built from the capture: the device then answers nothing, which counts as "unknown". */
  readonly sequence: FeatureSequence | null;
}

export interface EvaluationReport {
  readonly examples: number;
  readonly knownAttempts: number;
  readonly unknownAttempts: number;
  /** Known gesture, accepted as the right concept. */
  readonly top1: number;
  /** Known gesture, right concept among the three closest (what a correction list would show). */
  readonly top3: number;
  /** Known gesture, accepted as a wrong concept: the device would say the wrong thing. */
  readonly wrongAccept: number;
  /** Known gesture, answered with "unknown". */
  readonly falseReject: number;
  /** Not a known gesture, correctly answered with "unknown". */
  readonly unknownRecall: number;
  /** Not a known gesture, but accepted as some concept. */
  readonly falseAccept: number;
}

function share(count: number, total: number): number {
  return total === 0 ? Number.NaN : count / total;
}

/**
 * Scores the matcher the way it is used: examples come from some recording
 * sessions, attempts from other sessions. Attempts in an example session are
 * only ever used as examples (unknown movements there are ignored), so no
 * attempt is scored against examples from its own session.
 */
export function evaluateBySession(
  attempts: readonly LabelledAttempt[],
  exampleSessions: readonly string[],
  minMargin: number = DEFAULT_MIN_MARGIN,
): EvaluationReport {
  const examples: GestureExample[] = [];
  const tests: LabelledAttempt[] = [];
  for (const attempt of attempts) {
    if (!exampleSessions.includes(attempt.sessionId)) {
      tests.push(attempt);
    } else if (attempt.conceptId !== null && attempt.sequence !== null) {
      examples.push({ conceptId: attempt.conceptId, sequence: attempt.sequence });
    }
  }
  if (examples.length === 0 || tests.length === 0) {
    throw new RangeError("evaluation needs example sessions and separate test sessions");
  }
  return score(examples, calibrateMaxDistance(examples), tests, minMargin);
}

/** Scores attempts against examples whose limits are already calibrated. */
function score(
  examples: readonly GestureExample[],
  maxDistance: ReadonlyMap<string, number>,
  tests: readonly LabelledAttempt[],
  minMargin: number,
): EvaluationReport {
  let top1 = 0;
  let top3 = 0;
  let wrongAccept = 0;
  let falseReject = 0;
  let unknownRejected = 0;
  let known = 0;
  for (const test of tests) {
    const sequence = test.sequence;
    const result = sequence === null ? null : matchGesture(sequence, examples, { maxDistance, minMargin });
    if (test.conceptId === null) {
      if (result === null || result.kind === "unknown") unknownRejected += 1;
      continue;
    }
    known += 1;
    if (result === null || result.kind === "unknown") falseReject += 1;
    else if (result.conceptId === test.conceptId) top1 += 1;
    else wrongAccept += 1;
    // The ranked list of the answer is the correction list: the three closest concepts.
    if (result !== null && result.ranked.slice(0, 3).some((entry) => entry.conceptId === test.conceptId)) top3 += 1;
  }
  const unknown = tests.length - known;
  return {
    examples: examples.length,
    knownAttempts: known,
    unknownAttempts: unknown,
    top1: share(top1, known),
    top3: share(top3, known),
    wrongAccept: share(wrongAccept, known),
    falseReject: share(falseReject, known),
    unknownRecall: share(unknownRejected, unknown),
    falseAccept: share(unknown - unknownRejected, unknown),
  };
}

/** Which hands the gestures of a simulated profile use. "default": as `createGesture` picks them (right, sometimes both). */
export type ProfileHands = SyntheticHands | "mixed" | "default";

export interface SimulationOptions {
  readonly hands: ProfileHands;
  readonly gestures: number;
  readonly sloppiness: number;
  readonly unknownKind: "unrelated" | "other-fingers" | "ends-elsewhere";
  /** Applied to the attempts of the later sessions. */
  readonly attempts?: Disturbance;
  /** Applied to the examples of the teaching sessions; default: a short rest before and after, as when a caregiver records. */
  readonly examples?: Disturbance;
  /** Attempts per gesture in each later session; default 5. */
  readonly attemptsPerGesture?: number;
  /** Unknown movements per gesture in each later session; default 4. */
  readonly unknownsPerGesture?: number;
}

const TEACHING = ["teach-1", "teach-2"];
const USING = ["use-1", "use-2"];
const MIXED: readonly SyntheticHands[] = ["right", "both", "left"];

/**
 * One synthetic child profile: a few examples of each gesture from two
 * teaching sessions, attempts and unknown movements from two later sessions
 * with another camera placement. Made-up movements; see `synthetic.ts`.
 */
export function simulateProfile(options: SimulationOptions): EvaluationReport {
  return simulateProfileUnder(options, [options.attempts ?? {}])[0]!;
}

/**
 * The same profile, its examples recorded and calibrated once, with the
 * attempts of the later sessions made under each of `disturbances` in turn.
 * Each report is the one `simulateProfile` gives with that disturbance.
 */
export function simulateProfileUnder(options: Omit<SimulationOptions, "attempts">, disturbances: readonly Disturbance[]): EvaluationReport[] {
  let seed = 1;
  const kind = (index: number): SyntheticHands | undefined =>
    (options.hands === "default" ? undefined : options.hands === "mixed" ? MIXED[index % MIXED.length] : options.hands);
  const record = (gesture: SyntheticGesture, placement: ReturnType<typeof createSession>, disturbance: Disturbance): FeatureSequence | null => {
    const result = buildFeatureSequence(renderGesture(gesture, { seed: seed += 1, session: placement, sloppiness: options.sloppiness, disturbance }));
    return result.ok ? result.sequence : null;
  };
  const examples: GestureExample[] = [];
  TEACHING.forEach((_, index) => {
    const placement = createSession(100 + index);
    for (let g = 0; g < options.gestures; g += 1) {
      for (let repeat = 0; repeat < 3; repeat += 1) {
        const sequence = record(createGesture(g + 1, kind(g)), placement, options.examples ?? { restBeforeMs: 300, restAfterMs: 300 });
        if (sequence !== null) examples.push({ conceptId: `concept-${g}`, sequence });
      }
    }
  });
  if (examples.length === 0) {
    throw new RangeError("evaluation needs example sessions and separate test sessions");
  }
  const maxDistance = calibrateMaxDistance(examples);
  const afterTeaching = seed;
  return disturbances.map((disturbance) => {
    seed = afterTeaching;
    const tests: LabelledAttempt[] = [];
    USING.forEach((sessionId, index) => {
      const placement = createSession(100 + TEACHING.length + index);
      for (let g = 0; g < options.gestures; g += 1) {
        for (let repeat = 0; repeat < (options.attemptsPerGesture ?? 5); repeat += 1) {
          tests.push({ conceptId: `concept-${g}`, sessionId, sequence: record(createGesture(g + 1, kind(g)), placement, disturbance) });
        }
        for (let other = 0; other < (options.unknownsPerGesture ?? 4); other += 1) {
          const unknown = options.unknownKind === "unrelated"
            ? createGesture(5000 + (seed += 1), kind(g))
            : createLookAlike(createGesture(g + 1, kind(g)), seed += 1, options.unknownKind);
          tests.push({ conceptId: null, sessionId, sequence: record(unknown, placement, disturbance) });
        }
      }
    });
    return score(examples, maxDistance, tests, DEFAULT_MIN_MARGIN);
  });
}

// --- Cases in which the hand that does not sign is in view (card NG-18) ---

const OPEN = [0.05, 0.05, 0.05, 0.05, 0.05];
const FIST = [0.9, 0.9, 0.9, 0.9, 0.9];
const POINT = [0.9, 0.05, 0.9, 0.9, 0.9];
const VEE = [0.9, 0.05, 0.05, 0.9, 0.9];

/** Signs of the right hand: `from`, `to`, finger curls at the start and at the end. X, Y and Z do not travel. */
const SIGNS: Readonly<Record<string, readonly [readonly [number, number], readonly [number, number], readonly number[], readonly number[]]>> = {
  X: [[0.4, 0.1], [0.4, 0.1], FIST, OPEN],
  Y: [[0.4, 0.1], [0.4, 0.1], POINT, POINT],
  Z: [[0.3, -0.4], [0.3, -0.4], VEE, FIST],
  A: [[0.6, 0.6], [0.1, 0], POINT, POINT],
  /** A's path with other hand shapes: look-alikes of A. */
  Av: [[0.6, 0.6], [0.1, 0], VEE, VEE],
  Ao: [[0.6, 0.6], [0.1, 0], OPEN, OPEN],
  B: [[0.2, -0.5], [0.8, -0.3], OPEN, FIST],
  C: [[0.7, 0.2], [0.6, 0.9], VEE, VEE],
  /** Not a sign: the hand lies in view. */
  idle: [[0.5, 0.8], [0.5, 0.8], FIST, FIST],
};
const SIGN_START_MS = 500;

/** A small offset, different for every capture, so no two repetitions are the same. */
type Nudge = () => number;
/** What the other hand does; `startMs` and `endMs` are when the right hand starts and stops moving. */
type OtherHand = (nudge: Nudge, sign: { readonly startMs: number; readonly endMs: number }) => HandScript | null;

interface SignOptions extends Tracking {
  readonly moveMs?: number;
  readonly size?: number;
  readonly tremor?: boolean;
  /** Rest before the right hand moves; default `SIGN_START_MS`. */
  readonly restBeforeMs?: number;
  /** Rest after it; default 700 ms. */
  readonly restAfterMs?: number;
}

function sign(id: string, nudge: Nudge, left: OtherHand, options: SignOptions = {}): ScriptedCapture {
  const [from, to, curls, curlsEnd] = SIGNS[id]!;
  const moveMs = options.moveMs ?? (from[0] === to[0] && from[1] === to[1] ? 800 : 1000);
  const startMs = options.restBeforeMs ?? SIGN_START_MS;
  const size = options.size ?? 1;
  const middle = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2] as const;
  const end = (point: readonly [number, number]): [number, number] =>
    [middle[0] + (point[0] - middle[0]) * size + nudge(), middle[1] + (point[1] - middle[1]) * size + nudge()];
  const right = scriptedHand({ from: end(from), to: end(to), curls, curlsEnd, startMs, moveMs });
  const other = left(nudge, { startMs, endMs: startMs + moveMs });
  return {
    durationMs: startMs + moveMs + (options.restAfterMs ?? 700),
    right: options.tremor ? trembling(right, 4, 0.04) : right,
    left: other !== null && options.tremor ? trembling(other, 4, 0.04) : other,
  };
}

const absent: OtherHand = () => null;
const lap: OtherHand = (nudge) => scriptedHand({ from: [-0.4 + nudge(), 0.9 + nudge()], curls: FIST });
/** The lap hand fidgets once, 0.12 shoulder widths for 0.7 s, starting `afterMs` into the capture. */
const lapFidgets = (afterMs: number): OtherHand => (nudge, timing) => fidgeting(lap(nudge, timing)!, afterMs + nudge() * 3000, 700, 0.12);
/** Somebody else's hand comes into the picture and stays. */
const reachesIn: OtherHand = (nudge) =>
  scriptedHand({ from: [-1.2, 0.9], to: [-0.3 + nudge(), 0.5 + nudge()], curls: OPEN, startMs: 400, moveMs: 700, visibleFromMs: 400 });
/** A second hand held still as part of a two-hand sign. */
const held = (curls: readonly number[]): OtherHand => (nudge) => scriptedHand({ from: [-0.1 + nudge(), nudge()], curls });

/**
 * The second hand of a two-hand sign that shares its right-hand path with a
 * one-hand sign: it comes along for `moveMs` and is seen for `seen` (0 to 1)
 * of the right hand's movement, from its start.
 */
const joins = (seen: number, moveMs = 1000): OtherHand => (nudge) => scriptedHand({
  from: [-0.6 + nudge(), 0.5 + nudge()], to: [-0.2 + nudge(), 0.2 + nudge()], curls: OPEN,
  startMs: SIGN_START_MS, moveMs, visibleFromMs: seen < 1 ? SIGN_START_MS : 0, visibleUntilMs: seen < 1 ? SIGN_START_MS + seen * 1000 : undefined,
});

/** How far a nudge goes either way: captures are nudged by up to this much (see `simulateHandCases`). */
const NUDGE = 0.03;

/**
 * The second hand of a two-hand sign that is in view only from `fromMs` to
 * `untilMs`, counted from the start of the right hand's movement (negative:
 * before it), and crosses the picture at 0.9 shoulder widths per second while
 * it is seen. With `jitterMs` the time in view is shifted by up to that much,
 * either way, from capture to capture. The capture starts 500 ms before the
 * right hand moves, so the hand cannot be seen earlier than that.
 */
const crosses = (fromMs: number, untilMs: number, jitterMs = 0): OtherHand => (nudge) => {
  const shift = (nudge() / NUDGE) * jitterMs;
  const from = SIGN_START_MS + fromMs + shift;
  return scriptedHand({
    from: [-0.9 + nudge(), 0.6 + nudge()], to: [-0.1 + nudge(), 0.2 + nudge()], curls: OPEN,
    startMs: from, moveMs: 1000, visibleFromMs: from, visibleUntilMs: SIGN_START_MS + untilMs + shift,
  });
};
/** A second hand held still, seen only until the right hand starts to move. */
const heldUntilStart: OtherHand = (nudge) => scriptedHand({ from: [-0.1 + nudge(), nudge()], curls: OPEN, visibleUntilMs: SIGN_START_MS });

/** A second hand held still, seen only while the right hand rests before and/or after its movement. */
const heldInRests = (before: boolean, after: boolean): OtherHand => (nudge, { startMs, endMs }) => {
  const hand = held(OPEN)(nudge, { startMs, endMs })!;
  return (tMs) => ((before && tMs < startMs) || (after && tMs > endMs) ? hand(tMs) : null);
};

/** A second hand held still, but seen by the tracker in each frame only with chance `chance`, in scattered frames. */
const heldScattered = (chance: number): OtherHand => (nudge, timing) => {
  const hand = held(OPEN)(nudge, timing)!;
  const random = createRandom(Math.floor((nudge() / NUDGE + 1) * 1e6));
  return (tMs) => (random() < chance ? hand(tMs) : null);
};

/** One-hand sign "one" and two-hand sign "two" with the same right-hand path; the attempts are all "two". */
const sharedPath = (name: string, taught: OtherHand, attempted: OtherHand, attemptsPerKind?: number): HandCase => ({
  name: `one-hand and two-hand sign with the same path; attempts of the two-hand sign: ${name}`,
  examples: [["one", "A", clean(absent)], ["two", "A", clean(taught)]],
  attempts: [["two", "A", attempted]],
  attemptsPerKind,
});

interface HandCase {
  readonly name: string;
  /** How the examples are recorded; the attempts carry their own options. */
  readonly taught?: SignOptions;
  /** Per taught sign: its concept, the sign made, what the other hand does in each example (usually three), and how each is recorded (default `taught`). */
  readonly examples: readonly (readonly [string, string, readonly OtherHand[], (readonly SignOptions[])?])[];
  /** Per kind of attempt: the concept it should be answered with (null: none, the child is not signing), the sign made, the other hand. */
  readonly attempts: readonly (readonly [string | null, string, OtherHand, SignOptions?])[];
  /** Default `ATTEMPTS_PER_KIND`. */
  readonly attemptsPerKind?: number | undefined;
}

const clean = (other: OtherHand): [OtherHand, OtherHand, OtherHand] => [other, other, other];

/**
 * A two-hand sign "two" whose second hand is held still, and a one-hand sign
 * "one" with the same right-hand path, recorded with `taught`; the attempts
 * of "two" show the held hand only while the right hand rests.
 */
const inRests = (name: string, taught: SignOptions, attempted: SignOptions, before: boolean, after: boolean, attemptsPerKind?: number): HandCase => ({
  name: `one-hand and two-hand sign with the same path, the second hand held still; attempts of the two-hand sign: ${name}`,
  taught,
  examples: [["one", "A", clean(absent)], ["two", "A", clean(held(OPEN))]],
  attempts: [["two", "A", heldInRests(before, after), attempted]],
  attemptsPerKind,
});

const restCases = (): HandCase[] => [
  inRests("2 s rest before, held hand seen only then", { restBeforeMs: 2000 }, { restBeforeMs: 2000 }, true, false),
  inRests("2 s rest after, held hand seen only then", { restAfterMs: 2000 }, { restAfterMs: 2000 }, false, true),
  inRests("1.5 s rest before and after, held hand seen only then", { restBeforeMs: 1500, restAfterMs: 1500 }, { restBeforeMs: 1500, restAfterMs: 1500 }, true, true),
  inRests("taught with 0.3 s rest before, attempts with 2 s, held hand seen only then", { restBeforeMs: 300 }, { restBeforeMs: 2000 }, true, false),
  inRests("2 s rest before, held hand seen only then, at 7 frames per second", { restBeforeMs: 2000, frameMs: 143 }, { restBeforeMs: 2000, frameMs: 143 }, true, false),
  inRests("2 s rest before, held hand seen only then, at 12 frames per second", { restBeforeMs: 2000, frameMs: 83 }, { restBeforeMs: 2000, frameMs: 83 }, true, false),
];

/** Tracker jitter of a hand (shoulder widths, standard deviation per frame) and time between frames, as a real tracker may show them. */
const TRACKERS: readonly Required<Pick<Tracking, "noise" | "frameMs">>[] = [0.01, 0.015, 0.02].flatMap((noise) => [100, 67, 33].map((frameMs) => ({ noise, frameMs })));
const TRACKED_ATTEMPTS = 30;

const SCATTER_RATES: readonly (readonly [string, Tracking])[] = [["15 frames per second", { frameMs: 67 }], ["30 frames per second", { frameMs: 33 }], ["7 to 15 frames per second, unsteady", { frameMs: 100, frameJitter: 0.45 }]];

/** A two-hand sign with a held hand and its one-hand twin; in the attempts of the two-hand sign the tracker sees the held hand only in scattered frames. */
const scattered = (chance: number, rate: string, tracking: Tracking): HandCase => ({
  name: `one-hand and two-hand sign with the same path, the second hand held still; attempts of the two-hand sign: held hand seen in each frame with chance ${chance}, ${rate}`,
  taught: tracking,
  examples: [["one", "A", clean(absent)], ["two", "A", clean(held(OPEN))]],
  attempts: [["two", "A", heldScattered(chance), tracking]],
});

/**
 * One concept taught with the shoulders in view in three tidy examples and
 * without them in two loose ones (one small, one large); the attempts are
 * look-alikes without shoulders. The matcher of schema version 1 calibrated a
 * concept over all its examples, whatever their anchor.
 */
const anchorsMixed: HandCase = {
  name: "a sign taught in three tidy examples with shoulders and two loose ones without; attempts: look-alikes without shoulders",
  examples: [
    ["A", "A", clean(absent)],
    ["A", "A", [absent, absent], [{ shoulders: false, size: 0.4 }, { shoulders: false, size: 1.6 }]],
    ["C", "C", clean(absent)],
    ["C", "C", [absent, absent], [{ shoulders: false }, { shoulders: false }]],
  ],
  attempts: [[null, "Av", absent, { shoulders: false }], [null, "Ao", absent, { shoulders: false }]],
};

/** Jitter beyond what the rows above allow for, and frames in which the tracker puts the hand somewhere else. */
const STRONG_JITTER: readonly Tracking[] = [0.025, 0.03].flatMap((noise) => [143, 100, 67].map((frameMs) => ({ noise, frameMs })));
const JUMPS: readonly Tracking[] = [1, 3].flatMap((jumps) => [0.2, 0.4].map((jumpSize) => ({ noise: 0.02, frameMs: 67, jumps, jumpSize })));

/** Signs without travel, lap hand in view and still; recorded with `taught`, attempted with `tracking`. */
const shapesWithLap = (tracking: Tracking, label: string, taught: Tracking = tracking): HandCase => ({
  name: `signs without travel, lap hand in view and still${label}`, taught, attemptsPerKind: TRACKED_ATTEMPTS,
  examples: [["X", "X", clean(lap)], ["Y", "Y", clean(lap)], ["Z", "Z", clean(lap)]],
  attempts: (["X", "Y", "Z"] as const).map((id) => [id, id, lap, tracking] as const),
});

/** The cases most exposed to jitter, recorded and attempted with `tracking`. */
const trackerCases = (tracking: Required<Pick<Tracking, "noise" | "frameMs">>): HandCase[] => {
  const label = `; jitter ${tracking.noise} shoulder widths, ${Math.round(1000 / tracking.frameMs)} frames per second`;
  const shapes = (other: OtherHand): HandCase["attempts"] => (["X", "Y", "Z"] as const).map((id) => [id, id, other, tracking] as const);
  return [
    {
      name: `signs without travel, no other hand${label}`, taught: tracking, attemptsPerKind: TRACKED_ATTEMPTS,
      examples: [["X", "X", clean(absent)], ["Y", "Y", clean(absent)], ["Z", "Z", clean(absent)]], attempts: shapes(absent),
    },
    {
      name: `signs without travel, lap hand in view and still${label}`, taught: tracking, attemptsPerKind: TRACKED_ATTEMPTS,
      examples: [["X", "X", clean(lap)], ["Y", "Y", clean(lap)], ["Z", "Z", clean(lap)]], attempts: shapes(lap),
    },
    {
      name: `signs without travel; somebody's hand reaches in during one example of X and during the attempts${label}`, taught: tracking, attemptsPerKind: TRACKED_ATTEMPTS,
      examples: [["X", "X", [reachesIn, absent, absent]], ["Y", "Y", clean(absent)], ["Z", "Z", clean(absent)]],
      attempts: [["Y", "Y", reachesIn, tracking], ["Z", "Z", reachesIn, tracking]],
    },
    inRests(`2 s rest before, held hand seen only then${label}`, { restBeforeMs: 2000, ...tracking }, { restBeforeMs: 2000, ...tracking }, true, false, TRACKED_ATTEMPTS),
    inRests(`2 s rest after, held hand seen only then${label}`, { restAfterMs: 2000, ...tracking }, { restAfterMs: 2000, ...tracking }, false, true, TRACKED_ATTEMPTS),
    inRests(`1.5 s rest before and after, held hand seen only then${label}`, { restBeforeMs: 1500, restAfterMs: 1500, ...tracking }, { restBeforeMs: 1500, restAfterMs: 1500, ...tracking }, true, true, TRACKED_ATTEMPTS),
  ];
};

const HAND_CASES: readonly HandCase[] = [
  {
    name: "signs without travel, lap hand in view and still; attempts: lap hand fidgets",
    examples: [["X", "X", clean(lap)], ["Y", "Y", clean(lap)], ["Z", "Z", clean(lap)]],
    attempts: [["Y", "Y", lapFidgets(600)], ["Z", "Z", lapFidgets(600)]],
  },
  {
    name: "the same, and the lap hand fidgeted in one of three examples of X",
    examples: [["X", "X", [lapFidgets(600), lap, lap]], ["Y", "Y", clean(lap)], ["Z", "Z", clean(lap)]],
    attempts: [["Y", "Y", lapFidgets(600)], ["Z", "Z", lapFidgets(600)]],
  },
  {
    name: "signs without travel; somebody's hand reaches in during one example of X and during the attempts",
    examples: [["X", "X", [reachesIn, absent, absent]], ["Y", "Y", clean(absent)], ["Z", "Z", clean(absent)]],
    attempts: [["Y", "Y", reachesIn], ["Z", "Z", reachesIn]],
  },
  {
    name: "the child does not sign: its hand lies in view, the lap hand fidgets (one example of X had the fidget)",
    examples: [["X", "X", [lapFidgets(600), lap, lap]], ["Y", "Y", clean(lap)], ["A", "A", clean(lap)]],
    attempts: [[null, "idle", lapFidgets(600)]],
  },
  {
    name: "signs with travel, lap hand in view and still; attempts: lap hand fidgets after the sign",
    examples: [["A", "A", clean(lap)], ["B", "B", clean(lap)], ["C", "C", clean(lap)]],
    attempts: [["A", "A", lapFidgets(1800)], ["B", "B", lapFidgets(1800)], ["C", "C", lapFidgets(1800)]],
  },
  {
    name: "a two-hand sign with one hand held still, and a one-hand sign with the same path",
    examples: [["two", "A", clean(held(OPEN))], ["one", "A", clean(absent)]],
    attempts: [["two", "A", held(OPEN)], ["one", "A", absent]],
  },
  {
    name: "two two-hand signs that differ only in the shape of the hand held still",
    examples: [["open", "A", clean(held(OPEN))], ["fist", "A", clean(held(FIST))]],
    attempts: [["open", "A", held(OPEN)], ["fist", "A", held(FIST)]],
  },
  {
    name: "signs with travel, lap hand in view; attempts: both hands tremble (4 Hz, 0.04 shoulder widths)",
    examples: [["A", "A", clean(lap)], ["B", "B", clean(lap)], ["C", "C", clean(lap)]],
    attempts: [["A", "A", lap, { tremor: true }], ["B", "B", lap, { tremor: true }], ["C", "C", lap, { tremor: true }]],
  },
  {
    name: "signs with travel, lap hand in view; attempts: small and slow (40% of the size in 2 s)",
    examples: [["A", "A", clean(lap)], ["B", "B", clean(lap)], ["C", "C", clean(lap)]],
    attempts: [["A", "A", lap, { size: 0.4, moveMs: 2000 }], ["B", "B", lap, { size: 0.4, moveMs: 2000 }], ["C", "C", lap, { size: 0.4, moveMs: 2000 }]],
  },
  {
    name: "signs with travel, no other hand; attempts: small and slow (40% of the size in 2 s)",
    examples: [["A", "A", clean(absent)], ["B", "B", clean(absent)], ["C", "C", clean(absent)]],
    attempts: [["A", "A", absent, { size: 0.4, moveMs: 2000 }], ["B", "B", absent, { size: 0.4, moveMs: 2000 }], ["C", "C", absent, { size: 0.4, moveMs: 2000 }]],
  },
  {
    name: "signs with travel taught without the other hand; attempts: lap hand in view and still",
    examples: [["A", "A", clean(absent)], ["B", "B", clean(absent)], ["C", "C", clean(absent)]],
    attempts: [["A", "A", lap], ["B", "B", lap], ["C", "C", lap]],
  },
  sharedPath("second hand seen throughout", joins(1), joins(1)),
  ...[0.75, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1].map((seen) => sharedPath(`second hand seen for ${seen * 100}% of the movement`, joins(1), joins(seen))),
  sharedPath("second hand seen for 75% when taught, for 40% in the attempts", joins(0.75), joins(0.4)),
  sharedPath("second hand moves for 0.4 s when taught, for 0.25 s in the attempts", joins(1, 400), joins(1, 250)),
  // The right hand moves from 0 to 1000 ms; the second hand crosses the picture before, after or across one end of it.
  sharedPath("second hand seen from -500 to +200 ms when taught, to 0 ms in the attempts", crosses(-500, 200), crosses(-500, 0)),
  sharedPath("second hand seen from -500 to +200 ms when taught, to +50 ms in the attempts", crosses(-500, 200), crosses(-500, 50)),
  sharedPath("second hand seen from -500 to +600 ms when taught, to +100 ms in the attempts", crosses(-500, 600), crosses(-500, 100)),
  sharedPath("second hand seen from -500 to +150 ms, shifted by up to 150 ms either way, taught and attempted alike", crosses(-500, 150, 150), crosses(-500, 150, 150), 200),
  sharedPath("second hand seen from +300 to +1400 ms when taught, from +900 ms in the attempts", crosses(300, 1400), crosses(900, 1400)),
  sharedPath("second hand seen from +300 to +1400 ms when taught, from +1050 to +1450 ms in the attempts", crosses(300, 1400), crosses(1050, 1450)),
  sharedPath("second hand seen from +1000 to +1400 ms, shifted by up to 150 ms either way, taught and attempted alike", crosses(1000, 1400, 150), crosses(1000, 1400, 150), 200),
  sharedPath("second hand held still and seen throughout when taught, until the right hand starts in the attempts", held(OPEN), heldUntilStart),
  ...restCases(),
  ...TRACKERS.flatMap(trackerCases),
  ...STRONG_JITTER.map((tracking) => shapesWithLap(tracking, `; jitter ${tracking.noise} shoulder widths, ${Math.round(1000 / tracking.frameMs!)} frames per second`)),
  ...JUMPS.map((tracking) => shapesWithLap(tracking, `; attempts: ${tracking.jumps} frame${tracking.jumps === 1 ? "" : "s"} with the hand ${tracking.jumpSize} shoulder widths off (jitter 0.02, 15 frames per second)`, { noise: 0.02, frameMs: 67 })),
  ...[0.1, 0.15, 0.2, 0.25, 0.3].flatMap((chance) => SCATTER_RATES.map(([rate, tracking]) => scattered(chance, rate, tracking))),
  anchorsMixed,
];

const ATTEMPTS_PER_KIND = 40;

/**
 * Scripted cases around the hand that does not sign: three examples per sign
 * from one session, forty attempts per kind from a later one with another
 * camera placement. Made-up movements; see `synthetic.ts`.
 */
export function simulateHandCases(first = 0, count = HAND_CASES.length): { readonly name: string; readonly report: EvaluationReport }[] {
  return HAND_CASES.slice(first, first + count).map((handCase, offset) => {
    const caseIndex = first + offset;
    const attempts: LabelledAttempt[] = [];
    let seed = 1000 * (caseIndex + 1);
    const add = (conceptId: string | null, sessionId: string, id: string, other: OtherHand, options: SignOptions = {}): void => {
      const random = createRandom(seed += 1);
      const capture = sign(id, () => (random() - 0.5) * 2 * NUDGE, other, options);
      const tracking = { noise: options.noise, frameMs: options.frameMs, frameJitter: options.frameJitter, shoulders: options.shoulders, jumps: options.jumps, jumpSize: options.jumpSize };
      const result = buildFeatureSequence(renderScript(capture, { seed, session: createSession(sessionId === "teach" ? 300 : 301), ...tracking }));
      attempts.push({ conceptId, sessionId, sequence: result.ok ? result.sequence : null });
    };
    for (const [conceptId, id, others, recorded] of handCase.examples) {
      others.forEach((other, index) => add(conceptId, "teach", id, other, recorded?.[index] ?? handCase.taught));
    }
    for (const [conceptId, id, other, options] of handCase.attempts) {
      for (let repeat = 0; repeat < (handCase.attemptsPerKind ?? ATTEMPTS_PER_KIND); repeat += 1) add(conceptId, "use", id, other, options);
    }
    return { name: handCase.name, report: evaluateBySession(attempts, ["teach"]) };
  });
}
