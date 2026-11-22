import { dtwDistance } from "./dtw.js";
import type { FeatureSequence } from "./features.js";

/** One recorded attempt of a gesture that a caregiver assigned to a concept. */
export interface GestureExample {
  readonly conceptId: string;
  readonly sequence: FeatureSequence;
}

export interface RankedConcept {
  readonly conceptId: string;
  /** Distance to the closest example of this concept. */
  readonly distance: number;
}

export interface MatchOptions {
  /**
   * Per concept: a best match farther away than this is not accepted. Concepts
   * without an entry use `FALLBACK_MAX_DISTANCE`.
   */
  readonly maxDistance: ReadonlyMap<string, number>;
  /**
   * The runner-up concept must be at least this much farther away, as a
   * fraction of the best distance. Guards against speaking one of two
   * look-alike gestures at random.
   */
  readonly minMargin: number;
}

/**
 * - "no_examples": the profile has no examples at all.
 * - "other_anchor": it has examples, but none with the attempt's anchor
 *   (shoulders seen in one and not in the other).
 * - "other_hands": it has examples with that anchor, but none made with the
 *   same hands (left, right, both). The correction list is empty then.
 * - "too_far": the closest concept is beyond its limit.
 * - "ambiguous": two concepts are about equally close.
 */
export type UnknownReason = "no_examples" | "other_anchor" | "other_hands" | "too_far" | "ambiguous";

export type MatchResult =
  | { readonly kind: "match"; readonly conceptId: string; readonly ranked: readonly RankedConcept[] }
  | { readonly kind: "unknown"; readonly reason: UnknownReason; readonly ranked: readonly RankedConcept[] };

export const DEFAULT_MIN_MARGIN = 0.15;
/**
 * Limit for a concept that has a single example, and the lowest limit
 * calibration can produce: more examples may widen a concept, never narrow it
 * below this. Provisional, like the upper bound: chosen from synthetic
 * gestures, where repetitions of one gesture are mostly 0.2 to 1.2 apart and
 * different gestures mostly above 0.8.
 */
export const FALLBACK_MAX_DISTANCE = 0.75;
/** However inconsistent the examples are, a concept is never opened further than this. */
export const MAX_CALIBRATED_MAX_DISTANCE = 1.5;
const CALIBRATION_HEADROOM = 1.25;
/** Two concepts closer together than this are never told apart, however close the best one is. */
const MIN_ABSOLUTE_MARGIN = 0.01;
const RANKED_CONCEPTS = 3;

/** True when two sequences can be compared: the same anchor and the same hands. */
export function comparable(a: FeatureSequence, b: FeatureSequence): boolean {
  return a.anchor === b.anchor && a.hands === b.hands;
}

/** Concepts ordered by their closest example. Examples with another anchor or made with other hands are not comparable and are skipped. */
export function rankConcepts(query: FeatureSequence, examples: readonly GestureExample[]): RankedConcept[] {
  const closest = new Map<string, number>();
  for (const example of examples) {
    if (!comparable(example.sequence, query)) {
      continue;
    }
    const distance = dtwDistance(query, example.sequence);
    const known = closest.get(example.conceptId);
    if (known === undefined || distance < known) {
      closest.set(example.conceptId, distance);
    }
  }
  return [...closest.entries()]
    .map(([conceptId, distance]) => ({ conceptId, distance }))
    .sort((a, b) => a.distance - b.distance || a.conceptId.localeCompare(b.conceptId));
}

/**
 * Compares one attempt with a profile's examples. "unknown" is a normal answer:
 * the caller should then offer the ranked concepts or the board, not guess.
 */
export function matchGesture(
  query: FeatureSequence,
  examples: readonly GestureExample[],
  options: MatchOptions,
): MatchResult {
  const ranked = rankConcepts(query, examples).slice(0, RANKED_CONCEPTS);
  const best = ranked[0];
  if (best === undefined) {
    const sameAnchor = examples.filter((example) => example.sequence.anchor === query.anchor);
    const reason = examples.length === 0 ? "no_examples" : sameAnchor.length === 0 ? "other_anchor" : "other_hands";
    return { kind: "unknown", reason, ranked };
  }
  // Written so that a distance that is not a number is rejected, not accepted.
  if (!(best.distance <= (options.maxDistance.get(best.conceptId) ?? FALLBACK_MAX_DISTANCE))) {
    return { kind: "unknown", reason: "too_far", ranked };
  }
  const runnerUp = ranked[1];
  const requiredMargin = Math.max(options.minMargin * best.distance, MIN_ABSOLUTE_MARGIN);
  if (runnerUp !== undefined && runnerUp.distance - best.distance < requiredMargin) {
    return { kind: "unknown", reason: "ambiguous", ranked };
  }
  return { kind: "match", conceptId: best.conceptId, ranked };
}

function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Derives each concept's acceptance limit from how much the profile's own
 * examples of that concept differ from each other. Children vary a lot in how
 * consistently they repeat a gesture, and one child repeats some gestures more
 * consistently than others, so a single global limit would be wrong.
 *
 * The limit is the typical (median) distance from an example to its nearest
 * sibling, with headroom, kept between the fallback and an upper bound. The
 * median keeps one mislabelled example among several good ones from opening the
 * concept. A concept with fewer than two comparable examples gets no entry.
 */
export function calibrateMaxDistance(examples: readonly GestureExample[]): Map<string, number> {
  const nearestSibling = new Map<string, number[]>();
  for (const example of examples) {
    let nearest = Number.POSITIVE_INFINITY;
    for (const other of examples) {
      if (other !== example && other.conceptId === example.conceptId && comparable(other.sequence, example.sequence)) {
        nearest = Math.min(nearest, dtwDistance(example.sequence, other.sequence));
      }
    }
    if (Number.isFinite(nearest)) {
      nearestSibling.set(example.conceptId, [...(nearestSibling.get(example.conceptId) ?? []), nearest]);
    }
  }
  const limits = new Map<string, number>();
  for (const [conceptId, distances] of nearestSibling) {
    const limit = median(distances) * CALIBRATION_HEADROOM;
    limits.set(conceptId, Math.min(Math.max(limit, FALLBACK_MAX_DISTANCE), MAX_CALIBRATED_MAX_DISTANCE));
  }
  return limits;
}
