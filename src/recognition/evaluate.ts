import type { FeatureSequenceV1 } from "./features.js";
import { calibrateMaxDistance, DEFAULT_MIN_MARGIN, matchGesture, rankConcepts, type GestureExample } from "./matcher.js";

/** One labelled attempt. `conceptId: null` means "not a gesture this profile knows". */
export interface LabelledAttempt {
  readonly conceptId: string | null;
  /** Which recording session the attempt belongs to (for example one day). */
  readonly sessionId: string;
  readonly sequence: FeatureSequenceV1;
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
    } else if (attempt.conceptId !== null) {
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
    const result = matchGesture(test.sequence, examples, { maxDistance, minMargin });
    if (test.conceptId === null) {
      if (result.kind === "unknown") unknownRejected += 1;
      continue;
    }
    known += 1;
    if (result.kind === "unknown") falseReject += 1;
    else if (result.conceptId === test.conceptId) top1 += 1;
    else wrongAccept += 1;
    if (rankConcepts(test.sequence, examples).slice(0, 3).some((entry) => entry.conceptId === test.conceptId)) top3 += 1;
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
