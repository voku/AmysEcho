/**
 * How a new recording relates to the examples a profile already has (card
 * NG-4): the caregiver hears, before "Behalten", whether it fits the
 * concept's earlier examples or would be mistaken for another concept.
 *
 * It asks the matcher the question the child's board will ask later: with
 * the profile's examples and the limits calibrated from them
 * (`calibrateMaxDistance`, `DEFAULT_MIN_MARGIN`), what would this recording
 * be taken for? Nothing here changes a limit or a weight, and nothing is
 * stored. The answer is advice: keeping the recording stays possible.
 */
import type { FeatureSequence } from "../recognition/features.js";
import { DEFAULT_MIN_MARGIN, FALLBACK_MAX_DISTANCE, calibrateMaxDistance, limitKey, matchGesture } from "../recognition/matcher.js";
import type { GestureExample } from "../recognition/matcher.js";

/**
 * - "first": the concept has no example yet, and no other concept takes the
 *   recording for its own.
 * - "fits": the matcher would recognise the recording as this concept.
 * - "differs": the concept has comparable examples (same anchor, same hands),
 *   but the recording is farther from them than the concept's limit.
 * - "other-hands": the concept's examples were all made with other hands
 *   (`hands` of the earliest one), so they are never compared with this one.
 * - "other-anchor": the concept's examples were all recorded with the
 *   shoulders seen and this one without, or the other way round.
 * - "resembles": another concept would take the recording (`otherId`), is
 *   about as close as this one, or is closer than this concept's own examples
 *   although these accept it, so the two could be mistaken for each other.
 */
export type ExampleFit =
  | { readonly kind: "first" | "fits" | "differs" | "other-anchor" }
  | { readonly kind: "other-hands"; readonly hands: FeatureSequence["hands"] }
  | { readonly kind: "resembles"; readonly otherId: string };

export function exampleFit(sequence: FeatureSequence, conceptId: string, examples: readonly GestureExample[]): ExampleFit {
  const limits = calibrateMaxDistance(examples);
  const result = matchGesture(sequence, examples, { maxDistance: limits, minMargin: DEFAULT_MIN_MARGIN });
  if (result.kind === "match") return result.conceptId === conceptId ? { kind: "fits" } : { kind: "resembles", otherId: result.conceptId };
  // About as close to another concept as to this one, or closest to another one: either way the two may be mixed up.
  const other = result.ranked.find((ranked) => ranked.conceptId !== conceptId);
  if (result.reason === "ambiguous" && other !== undefined) return { kind: "resembles", otherId: other.conceptId };
  // Within this concept's own limit, yet another concept's examples are closer (and beyond theirs, so the
  // matcher answers "too far"): the board could not tell the two apart, so the other one is named, never "differs".
  const closest = result.ranked[0];
  const mine = result.ranked.find((ranked) => ranked.conceptId === conceptId);
  if (result.reason === "too_far" && closest !== undefined && closest.conceptId !== conceptId && mine !== undefined
    && mine.distance <= (limits.get(limitKey(conceptId, sequence)) ?? FALLBACK_MAX_DISTANCE)) {
    return { kind: "resembles", otherId: closest.conceptId };
  }
  const own = examples.filter((example) => example.conceptId === conceptId);
  if (own.length === 0) return { kind: "first" };
  const sameAnchor = own.filter((example) => example.sequence.anchor === sequence.anchor);
  if (sameAnchor.length === 0) return { kind: "other-anchor" };
  const sameHands = sameAnchor.filter((example) => example.sequence.hands === sequence.hands);
  if (sameHands.length === 0) return { kind: "other-hands", hands: (sameAnchor[0] as GestureExample).sequence.hands };
  return { kind: "differs" };
}
