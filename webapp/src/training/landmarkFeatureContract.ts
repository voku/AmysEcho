export const CONTRACT_HAND_LANDMARK_COUNT = 21;
export const CONTRACT_COORDS_PER_POINT = 3;

function toPoint(point: unknown): [number, number, number] | null {
  if (!Array.isArray(point) || point.length < 2) {
    return null;
  }
  const x = point[0];
  const y = point[1];
  const z = point[2] ?? 0;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
    return null;
  }
  return [x, y, z];
}

export function normalizeHandLandmarksWristRelative(handLandmarks: unknown[]): number[] {
  const points = handLandmarks
    .map((point) => toPoint(point))
    .filter((point): point is [number, number, number] => point !== null)
    .slice(0, CONTRACT_HAND_LANDMARK_COUNT);

  if (points.length === 0) {
    return [];
  }

  const wrist = points[0] ?? [0, 0, 0];
  const centered = points.map(([x, y, z]) => [x - wrist[0], y - wrist[1], z - wrist[2]] as const);
  const flat = centered.flatMap((point) => point);
  const maxAbs = Math.max(...flat.map((value) => Math.abs(value)), 0);
  if (maxAbs === 0) {
    return flat;
  }
  return flat.map((value) => value / maxAbs);
}

export function buildDualHandFeatureVector(frameHands: unknown[]): number[] {
  const left = normalizeHandLandmarksWristRelative(Array.isArray(frameHands[0]) ? frameHands[0] : []);
  const right = normalizeHandLandmarksWristRelative(Array.isArray(frameHands[1]) ? frameHands[1] : []);
  const expectedLength = CONTRACT_HAND_LANDMARK_COUNT * CONTRACT_COORDS_PER_POINT;

  const leftPadded = left.length >= expectedLength
    ? left.slice(0, expectedLength)
    : [...left, ...new Array(expectedLength - left.length).fill(0)];
  const rightPadded = right.length >= expectedLength
    ? right.slice(0, expectedLength)
    : [...right, ...new Array(expectedLength - right.length).fill(0)];

  return [...leftPadded, ...rightPadded];
}
