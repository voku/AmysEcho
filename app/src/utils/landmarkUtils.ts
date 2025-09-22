const cloneHand = (hand: number[][]): number[][] =>
  Array.isArray(hand)
    ? hand.map((point) =>
        Array.isArray(point) ? [point[0] ?? 0, point[1] ?? 0, point[2] ?? 0] : [0, 0, 0],
      )
    : [];

export const cloneLandmarks = (landmarks: number[][][]): number[][][] =>
  Array.isArray(landmarks) ? landmarks.map((hand) => cloneHand(hand)) : [];

const normalizeHandednessLabel = (label: unknown): string => {
  if (typeof label !== 'string') {
    return String(label ?? '');
  }

  const trimmed = label.trim();
  if (trimmed.length === 0) {
    return '';
  }

  if (/^left$/i.test(trimmed)) {
    return 'Left';
  }

  if (/^right$/i.test(trimmed)) {
    return 'Right';
  }

  return trimmed;
};

export const normalizeHandednessLabels = (labels: string[]): string[] =>
  labels.map((label, index) => {
    const normalized = normalizeHandednessLabel(label);

    if (normalized.length === 0) {
      // Preserve the array length so callers can keep indices aligned with landmarks.
      return `Hand ${index + 1}`;
    }

    // The camera preview may be mirrored, but the underlying handedness still reflects the
    // physical hand. We intentionally avoid swapping "Left"/"Right" to keep feedback and
    // analytics consistent regardless of the active camera.
    return normalized;
  });

type StabilizerEntry = {
  id: string;
  handedness: string;
  landmarks: number[][];
  updatedAt: number;
  order: number;
};

export interface HandLandmarkStabilizerOptions {
  ttlMs?: number;
  maxHands?: number;
}

export interface StabilizedHands {
  landmarks: number[][][];
  handedness: string[];
}

export interface HandLandmarkStabilizer {
  update: (landmarks: number[][][], handedness?: string[], now?: number) => StabilizedHands;
  reset: () => void;
}

const DEFAULT_TTL = 250;
const DEFAULT_MAX_HANDS = 2;

const getStableId = (handedness: string | undefined, index: number): string => {
  const normalized = typeof handedness === 'string' ? handedness.trim().toLowerCase() : '';
  if (normalized === 'left' || normalized === 'right') {
    return normalized;
  }
  return `hand-${index}`;
};

const getHandednessLabel = (label: string | undefined, index: number): string => {
  if (typeof label === 'string' && label.length > 0) {
    return label;
  }
  return `Hand ${index + 1}`;
};

const compareEntries = (a: StabilizerEntry, b: StabilizerEntry): number => {
  const priority = (entry: StabilizerEntry): number => {
    if (entry.id === 'left') return 0;
    if (entry.id === 'right') return 1;
    return 2;
  };

  const priorityDiff = priority(a) - priority(b);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  if (a.updatedAt !== b.updatedAt) {
    return b.updatedAt - a.updatedAt;
  }

  return a.order - b.order;
};

export const createHandLandmarkStabilizer = (
  options: HandLandmarkStabilizerOptions = {},
): HandLandmarkStabilizer => {
  const ttl = Number.isFinite(options.ttlMs) && (options.ttlMs ?? 0) > 0 ? options.ttlMs! : DEFAULT_TTL;
  const maxHands = Number.isFinite(options.maxHands) && (options.maxHands ?? 0) > 0
    ? Math.floor(options.maxHands!)
    : DEFAULT_MAX_HANDS;

  const cache = new Map<string, StabilizerEntry>();

  const update = (
    landmarks: number[][][],
    handedness: string[] = [],
    now: number = Date.now(),
  ): StabilizedHands => {
    if (Array.isArray(landmarks)) {
      landmarks.forEach((hand, index) => {
        if (!Array.isArray(hand) || hand.length === 0) {
          return;
        }

        const label = handedness[index];
        const id = getStableId(label, index);

        cache.set(id, {
          id,
          handedness: getHandednessLabel(label, index),
          landmarks: cloneHand(hand),
          updatedAt: now,
          order: index,
        });
      });
    }

    for (const [id, entry] of cache) {
      if (now - entry.updatedAt > ttl) {
        cache.delete(id);
      }
    }

    const entries = Array.from(cache.values()).sort(compareEntries).slice(0, maxHands);

    return {
      landmarks: entries.map((entry) => entry.landmarks),
      handedness: entries.map((entry) => entry.handedness),
    };
  };

  const reset = () => {
    cache.clear();
  };

  return { update, reset };
};
