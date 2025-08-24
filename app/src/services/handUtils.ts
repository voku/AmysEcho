export const HAND_LANDMARKS_PER_HAND = 21;

// hands: [left[], right[]], each is an array of 21 [x,y,z]
export function flattenHands(hands: number[][][]): number[][] {
  const left = hands?.[0] || [];
  const right = hands?.[1] || [];
  const out: number[][] = [];
  for (let i = 0; i < HAND_LANDMARKS_PER_HAND; i++) {
    out.push(left[i] ? [...left[i]] : [0, 0, 0]);
  }
  for (let i = 0; i < HAND_LANDMARKS_PER_HAND; i++) {
    out.push(right[i] ? [...right[i]] : [0, 0, 0]);
  }
  return out;
}

export function frameHasAnyLandmarks(frame: number[][][]): boolean {
  if (!Array.isArray(frame)) return false;
  return frame.some((hand) => Array.isArray(hand) && hand.length > 0);
}

