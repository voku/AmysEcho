import { buildFeatureSequence, type FeatureSequence } from "./features.js";
import { calibrateMaxDistance, DEFAULT_MIN_MARGIN, matchGesture, rankConcepts, type GestureExample } from "./matcher.js";
import { createGesture, createLookAlike, createSession, renderGesture, type Disturbance, type SyntheticHands } from "./synthetic.js";

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

  const maxDistance = calibrateMaxDistance(examples);
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
    if (sequence !== null && rankConcepts(sequence, examples).slice(0, 3).some((entry) => entry.conceptId === test.conceptId)) top3 += 1;
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
  const attempts: LabelledAttempt[] = [];
  let seed = 1;
  const kind = (index: number): SyntheticHands | undefined =>
    (options.hands === "default" ? undefined : options.hands === "mixed" ? MIXED[index % MIXED.length] : options.hands);
  const add = (gesture: ReturnType<typeof createGesture>, conceptId: string | null, sessionId: string, placement: ReturnType<typeof createSession>, disturbance: Disturbance): void => {
    const result = buildFeatureSequence(renderGesture(gesture, { seed: seed += 1, session: placement, sloppiness: options.sloppiness, disturbance }));
    attempts.push({ conceptId, sessionId, sequence: result.ok ? result.sequence : null });
  };
  [...TEACHING, ...USING].forEach((sessionId, index) => {
    const placement = createSession(100 + index);
    const teaching = TEACHING.includes(sessionId);
    const disturbance = teaching ? options.examples ?? { restBeforeMs: 300, restAfterMs: 300 } : options.attempts ?? {};
    for (let g = 0; g < options.gestures; g += 1) {
      for (let repeat = 0; repeat < (teaching ? 3 : 5); repeat += 1) add(createGesture(g + 1, kind(g)), `concept-${g}`, sessionId, placement, disturbance);
      if (teaching) continue;
      for (let other = 0; other < 4; other += 1) {
        const unknown = options.unknownKind === "unrelated"
          ? createGesture(5000 + (seed += 1), kind(g))
          : createLookAlike(createGesture(g + 1, kind(g)), seed += 1, options.unknownKind);
        add(unknown, null, sessionId, placement, disturbance);
      }
    }
  });
  return evaluateBySession(attempts, TEACHING);
}
