export const HAND_LANDMARKS_PER_HAND = 21;

export function flattenHandsWithHandedness(
  hands: number[][][],
  handedness: string[],
): number[][] {
  let left: number[][] = [];
  let right: number[][] = [];
  if (handedness.length === 0) {
    left = hands?.[0] || [];
    right = hands?.[1] || [];
  } else {
    const leftIndex = handedness.findIndex((h) => /left/i.test(h));
    const rightIndex = handedness.findIndex((h) => /right/i.test(h));
    left = leftIndex >= 0 ? hands[leftIndex] : [];
    right = rightIndex >= 0 ? hands[rightIndex] : [];
  }
  const out: number[][] = [];
  for (let i = 0; i < HAND_LANDMARKS_PER_HAND; i++) {
    out.push(left[i] ? [...left[i]] : [0, 0, 0]);
  }
  for (let i = 0; i < HAND_LANDMARKS_PER_HAND; i++) {
    out.push(right[i] ? [...right[i]] : [0, 0, 0]);
  }
  return out;
}

// Legacy helper assuming hands array is ordered as [left, right]
export function flattenHands(hands: number[][][]): number[][] {
  return flattenHandsWithHandedness(hands, []);
}

export function frameHasAnyLandmarks(frame: number[][][]): boolean {
  if (!Array.isArray(frame)) return false;
  return frame.some((hand) => Array.isArray(hand) && hand.length > 0);
}

