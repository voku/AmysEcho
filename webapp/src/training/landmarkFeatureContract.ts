export const CONTRACT_HAND_LANDMARK_COUNT = 21;
export const CONTRACT_COORDS_PER_POINT = 3;

function toPoint(point: unknown): [number, number, number] | null {
  if (!Array.isArray(point) || point.length < 2) {
    return null;
  }
  const x = point[0];
  const y = point[1];
  const z = point[2] ?? 0;
  if (typeof x !== 'number' || !Number.isFinite(x) ||
      typeof y !== 'number' || !Number.isFinite(y) ||
      typeof z !== 'number' || !Number.isFinite(z)) {
    return null;
  }
  return [x, y, z];
}

export function normalizeHandLandmarksWristRelative(handLandmarks: unknown[]): number[] {
  const slots = handLandmarks.slice(0, CONTRACT_HAND_LANDMARK_COUNT);
  if (slots.length === 0) {
    return [];
  }

  // Keep invalid slots at zero even after centering to avoid fabricating motion
  // from missing coordinates.
  const wrist = toPoint(slots[0]) ?? [0, 0, 0];
  const centered = slots.map((point): [number, number, number] => {
    const parsed = toPoint(point);
    if (!parsed) {
      return [0, 0, 0];
    }
    return [parsed[0] - wrist[0], parsed[1] - wrist[1], parsed[2] - wrist[2]];
  });
  const flat = centered.flatMap((point) => point);
  const maxAbs = Math.max(...flat.map((value) => Math.abs(value)), 0);
  if (maxAbs === 0) {
    return flat;
  }
  return flat.map((value) => value / maxAbs);
}

type HandSlot = { landmarks: unknown[]; handedness: 'Left' | 'Right' | null };

function parseHandSlot(hand: unknown): HandSlot | null {
  if (Array.isArray(hand)) {
    return { landmarks: hand, handedness: null };
  }
  if (!hand || typeof hand !== 'object') {
    return null;
  }
  const candidate = hand as Record<string, unknown>;
  const rawLandmarks = candidate['landmarks'];
  if (!Array.isArray(rawLandmarks)) {
    return null;
  }
  const handednessCandidate = candidate['handedness'] ?? candidate['label'] ?? candidate['categoryName'];
  const handedness =
    handednessCandidate === 'Left' || handednessCandidate === 'Right'
      ? handednessCandidate
      : null;
  return { landmarks: rawLandmarks, handedness };
}

export function buildDualHandFeatureVector(frameHands: unknown[]): number[] {
  let leftLandmarks: unknown[] = [];
  let rightLandmarks: unknown[] = [];

  for (const hand of frameHands) {
    const parsed = parseHandSlot(hand);
    if (!parsed) continue;
    if (parsed.handedness === 'Left' && leftLandmarks.length === 0) {
      leftLandmarks = parsed.landmarks;
      continue;
    }
    if (parsed.handedness === 'Right' && rightLandmarks.length === 0) {
      rightLandmarks = parsed.landmarks;
      continue;
    }
    if (leftLandmarks.length === 0) {
      leftLandmarks = parsed.landmarks;
      continue;
    }
    if (rightLandmarks.length === 0) {
      rightLandmarks = parsed.landmarks;
    }
  }

  const left = normalizeHandLandmarksWristRelative(leftLandmarks);
  const right = normalizeHandLandmarksWristRelative(rightLandmarks);
  const expectedLength = CONTRACT_HAND_LANDMARK_COUNT * CONTRACT_COORDS_PER_POINT;

  const leftPadded = left.length >= expectedLength
    ? left.slice(0, expectedLength)
    : [...left, ...new Array(expectedLength - left.length).fill(0)];
  const rightPadded = right.length >= expectedLength
    ? right.slice(0, expectedLength)
    : [...right, ...new Array(expectedLength - right.length).fill(0)];

  return [...leftPadded, ...rightPadded];
}
