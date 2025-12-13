export const HAND_LANDMARKS_PER_HAND = 21;

export function flattenHands(hands: number[][][]): number[][] {
  const left = hands?.[0] || [];
  const right = hands?.[1] || [];
  const out: number[][] = [];
  for (let i = 0; i < HAND_LANDMARKS_PER_HAND; i++) {
    const point = left[i];
    out.push(point ? [...point] : [0, 0, 0]);
  }
  for (let i = 0; i < HAND_LANDMARKS_PER_HAND; i++) {
    const point = right[i];
    out.push(point ? [...point] : [0, 0, 0]);
  }
  return out;
}

export function flattenHandsWithHandedness(hands: number[][][], handedness: ReadonlyArray<string> = []): number[][] {
  let left: number[][] = [];
  let right: number[][] = [];

  if (handedness.length === 0) {
    left = hands?.[0] || [];
    right = hands?.[1] || [];
  } else {
    const leftIndex = handedness.findIndex((h) => /left/i.test(h));
    const rightIndex = handedness.findIndex((h) => /right/i.test(h));
    left = leftIndex >= 0 ? hands[leftIndex] ?? [] : [];
    right = rightIndex >= 0 ? hands[rightIndex] ?? [] : [];
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

export function frameHasAnyLandmarks(
  frame: number[][][] | { landmarks?: number[][][]; poseLandmarks?: number[][]; faceLandmarks?: number[][] },
): boolean {
  if (Array.isArray(frame)) {
    return frame.some((hand) => Array.isArray(hand) && hand.length > 0);
  }

  if (frame && typeof frame === 'object') {
    if (Array.isArray(frame.landmarks) && frame.landmarks.some((hand) => Array.isArray(hand) && hand.length > 0)) {
      return true;
    }

    if (Array.isArray(frame.poseLandmarks) && frame.poseLandmarks.length > 0) {
      return true;
    }

    if (Array.isArray(frame.faceLandmarks) && frame.faceLandmarks.length > 0) {
      return true;
    }
  }

  return false;
}

type Triplet = [number, number, number];

function isTriplet(x: unknown): x is Triplet {
  return Array.isArray(x) && x.length === 3 && x.every((n) => typeof n === 'number');
}

function normalizeFramesInput(input: unknown): (number[][][] | import('./types').FrameData)[] {
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
    const usableFrames = Math.floor(arr.length / perFrame);
    if (usableFrames === 0) return [];
    const out: import('./types').FrameData[] = [];
    for (let i = 0; i < usableFrames * perFrame; i += perFrame) {
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
  frames: (number[][][] | import('./types').FrameData)[],
  gestureDefinitionId: string,
  profileId?: string,
): { gestureDefinitionId: string; landmarkData: number[][]; profileId?: string }[] {
  const normalized = normalizeFramesInput(frames);
  return normalized
    .filter((f) => frameHasAnyLandmarks(f as any))
    .map((f) => {
      const isNewFrame = 'landmarks' in f;
      const landmarks = isNewFrame ? (f as any).landmarks : (f as number[][][]);
      const handedness = isNewFrame ? (f as any).handedness ?? [] : [];
      return {
        gestureDefinitionId,
        landmarkData: flattenHandsWithHandedness(landmarks, handedness),
        ...(profileId ? { profileId } : {}),
      };
    });
}
