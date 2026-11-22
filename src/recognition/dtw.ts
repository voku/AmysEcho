import type { FeatureSequenceV1 } from "./features.js";

/** How many steps two sequences may drift apart in time while still being aligned. */
export const DEFAULT_BAND = 6;

function stepDistance(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) {
    const difference = a[index]! - b[index]!;
    sum += difference * difference;
  }
  return Math.sqrt(sum);
}

/**
 * Dynamic time warping distance between two sequences of equal length: the
 * cost of the cheapest alignment divided by the sequence length. Tolerates a
 * gesture being made faster or slower in parts. 0 means identical, and the
 * result is the same in both directions.
 */
export function dtwDistance(a: FeatureSequenceV1, b: FeatureSequenceV1, band: number = DEFAULT_BAND): number {
  const length = a.steps.length;
  if (length === 0 || b.steps.length !== length) {
    throw new RangeError("sequences must be non-empty and of equal length");
  }
  if (!Number.isInteger(band) || band < 0) {
    throw new RangeError("band must be a non-negative integer");
  }
  const width = length + 1;
  const cost = new Float64Array(width * width).fill(Number.POSITIVE_INFINITY);
  cost[0] = 0;
  for (let i = 1; i <= length; i += 1) {
    const from = Math.max(1, i - band);
    const to = Math.min(length, i + band);
    for (let j = from; j <= to; j += 1) {
      const cheapest = Math.min(cost[(i - 1) * width + (j - 1)]!, cost[(i - 1) * width + j]!, cost[i * width + (j - 1)]!);
      cost[i * width + j] = cheapest + stepDistance(a.steps[i - 1]!, b.steps[j - 1]!);
    }
  }
  return cost[length * width + length]! / length;
}
