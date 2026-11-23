import { buildFeatureSequence, type FeatureSequence } from "./features.js";
import { calibrateMaxDistance, DEFAULT_MIN_MARGIN, matchGesture, type GestureExample } from "./matcher.js";
import {
  createGesture, createLookAlike, createRandom, createSession, fidgeting, renderGesture, renderScript, scriptedHand, trembling,
  type Disturbance, type HandScript, type ScriptedCapture, type SyntheticGesture, type SyntheticHands,
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
  B: [[0.2, -0.5], [0.8, -0.3], OPEN, FIST],
  C: [[0.7, 0.2], [0.6, 0.9], VEE, VEE],
  /** Not a sign: the hand lies in view. */
  idle: [[0.5, 0.8], [0.5, 0.8], FIST, FIST],
};
const SIGN_START_MS = 500;

/** A small offset, different for every capture, so no two repetitions are the same. */
type Nudge = () => number;
type OtherHand = (nudge: Nudge) => HandScript | null;

interface SignOptions { readonly moveMs?: number; readonly size?: number; readonly tremor?: boolean }

function sign(id: string, nudge: Nudge, left: OtherHand, options: SignOptions = {}): ScriptedCapture {
  const [from, to, curls, curlsEnd] = SIGNS[id]!;
  const moveMs = options.moveMs ?? (from[0] === to[0] && from[1] === to[1] ? 800 : 1000);
  const size = options.size ?? 1;
  const middle = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2] as const;
  const end = (point: readonly [number, number]): [number, number] =>
    [middle[0] + (point[0] - middle[0]) * size + nudge(), middle[1] + (point[1] - middle[1]) * size + nudge()];
  const right = scriptedHand({ from: end(from), to: end(to), curls, curlsEnd, startMs: SIGN_START_MS, moveMs });
  const other = left(nudge);
  return {
    durationMs: SIGN_START_MS + moveMs + 700,
    right: options.tremor ? trembling(right, 4, 0.04) : right,
    left: other !== null && options.tremor ? trembling(other, 4, 0.04) : other,
  };
}

const absent: OtherHand = () => null;
const lap: OtherHand = (nudge) => scriptedHand({ from: [-0.4 + nudge(), 0.9 + nudge()], curls: FIST });
/** The lap hand fidgets once, 0.12 shoulder widths for 0.7 s, starting `afterMs` into the capture. */
const lapFidgets = (afterMs: number): OtherHand => (nudge) => fidgeting(lap(nudge)!, afterMs + nudge() * 3000, 700, 0.12);
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

/** One-hand sign "one" and two-hand sign "two" with the same right-hand path; the attempts are all "two". */
const sharedPath = (name: string, taught: OtherHand, attempted: OtherHand, attemptsPerKind?: number): HandCase => ({
  name: `one-hand and two-hand sign with the same path; attempts of the two-hand sign: ${name}`,
  examples: [["one", "A", clean(absent)], ["two", "A", clean(taught)]],
  attempts: [["two", "A", attempted]],
  attemptsPerKind,
});

interface HandCase {
  readonly name: string;
  /** Per taught sign: its concept, the sign made and what the other hand does in each of the three examples. */
  readonly examples: readonly (readonly [string, string, readonly [OtherHand, OtherHand, OtherHand]])[];
  /** Per kind of attempt: the concept it should be answered with (null: none, the child is not signing), the sign made, the other hand. */
  readonly attempts: readonly (readonly [string | null, string, OtherHand, SignOptions?])[];
  /** Default `ATTEMPTS_PER_KIND`. */
  readonly attemptsPerKind?: number | undefined;
}

const clean = (other: OtherHand): [OtherHand, OtherHand, OtherHand] => [other, other, other];

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
];

const ATTEMPTS_PER_KIND = 40;

/**
 * Scripted cases around the hand that does not sign: three examples per sign
 * from one session, forty attempts per kind from a later one with another
 * camera placement. Made-up movements; see `synthetic.ts`.
 */
export function simulateHandCases(): { readonly name: string; readonly report: EvaluationReport }[] {
  return HAND_CASES.map((handCase, caseIndex) => {
    const attempts: LabelledAttempt[] = [];
    let seed = 1000 * (caseIndex + 1);
    const add = (conceptId: string | null, sessionId: string, capture: (nudge: Nudge) => ScriptedCapture): void => {
      const random = createRandom(seed += 1);
      const result = buildFeatureSequence(renderScript(capture(() => (random() - 0.5) * 2 * NUDGE), { seed, session: createSession(sessionId === "teach" ? 300 : 301) }));
      attempts.push({ conceptId, sessionId, sequence: result.ok ? result.sequence : null });
    };
    for (const [conceptId, id, others] of handCase.examples) {
      for (const other of others) add(conceptId, "teach", (nudge) => sign(id, nudge, other));
    }
    for (const [conceptId, id, other, options] of handCase.attempts) {
      for (let repeat = 0; repeat < (handCase.attemptsPerKind ?? ATTEMPTS_PER_KIND); repeat += 1) add(conceptId, "use", (nudge) => sign(id, nudge, other, options));
    }
    return { name: handCase.name, report: evaluateBySession(attempts, ["teach"]) };
  });
}
