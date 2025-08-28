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
    out.push([
      left[i]?.[0] ?? 0,
      left[i]?.[1] ?? 0,
      left[i]?.[2] ?? 0,
    ]);
  }
  for (let i = 0; i < HAND_LANDMARKS_PER_HAND; i++) {
    out.push([
      right[i]?.[0] ?? 0,
      right[i]?.[1] ?? 0,
      right[i]?.[2] ?? 0,
    ]);
  }
  return out;
}

/** @deprecated Legacy helper assuming hands array is ordered as [left, right].
 * Prefer flattenHandsWithHandedness(hands, []) to make handedness handling explicit. */
export function flattenHands(hands: number[][][]): number[][] {
  return flattenHandsWithHandedness(hands, []);
}

export function frameHasAnyLandmarks(frame: number[][][]): boolean {
  if (!Array.isArray(frame)) return false;
  return frame.some((hand) => Array.isArray(hand) && hand.length > 0);
}

type Triplet = [number, number, number];
type Frame = { landmarks: number[][][]; handedness?: string[] };

function isTriplet(x: unknown): x is Triplet {
  return Array.isArray(x) && x.length >= 3 && x.slice(0, 3).every((n) => typeof n === 'number');
}

function normalizeFramesInput(
  input: unknown,
): (number[][][] | { landmarks: number[][][]; handedness?: string[] })[] {
  if (!Array.isArray(input)) return [];

  if (
    input.every(
      (f) =>
        (f && typeof f === 'object' && 'landmarks' in (f as any)) ||
        (Array.isArray(f) && (f.length === 0 || Array.isArray(f[0]))),
    )
  ) {
    return input as any[];
  }

  if (input.every(isTriplet)) {
    const arr = input as Triplet[];
    const perFrame = HAND_LANDMARKS_PER_HAND * 2;
    if (arr.length % perFrame !== 0) return [];
    const out: Frame[] = [];
    for (let i = 0; i < arr.length; i += perFrame) {
      const block = arr.slice(i, i + perFrame);
      const left = block.slice(0, HAND_LANDMARKS_PER_HAND);
      const right = block.slice(HAND_LANDMARKS_PER_HAND, perFrame);
      out.push({ landmarks: [left, right], handedness: [] });
    }
    return out;
  }

  return [];
}

export function processFramesForUpload(
  frames: (number[][][] | { landmarks: number[][][]; handedness?: string[] })[],
  gestureDefinitionId: string,
  profileId?: string,
): { gestureDefinitionId: string; landmarkData: number[][]; profileId?: string }[] {
  const normalized = normalizeFramesInput(frames);
  return normalized
    .filter((f) =>
      frameHasAnyLandmarks('landmarks' in f ? f.landmarks : (f as number[][][])),
    )
    .map((f) => {
      const isNewFrame = 'landmarks' in f;
      const landmarks = isNewFrame ? f.landmarks : (f as number[][][]);
      const handedness = isNewFrame ? f.handedness ?? [] : [];
      return {
        gestureDefinitionId,
        landmarkData: flattenHandsWithHandedness(landmarks, handedness),
        ...(profileId ? { profileId } : {}),
      };
    });
}

