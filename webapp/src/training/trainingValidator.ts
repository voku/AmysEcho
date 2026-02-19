import {
  MAX_FACE_JITTER,
  MAX_HAND_JITTER,
  MAX_POSE_JITTER,
  MIN_HAND_FRAME_COVERAGE,
  MIN_SIGN_SAMPLE_FRAMES,
} from './trainingQuality';

export type ValidationIssue =
  | 'too_few_frames'
  | 'insufficient_motion'
  | 'landmarks_missing'
  | 'values_out_of_range'
  | 'hand_coverage_low'
  | 'hand_jitter_high'
  | 'pose_jitter_high'
  | 'face_jitter_high';

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  suggestions: string[];
  qualityScore: number;
  confidence: number;
}

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

function toPointList(points: unknown): [number, number, number][] {
  if (!Array.isArray(points)) {
    return [];
  }
  return points
    .map((point) => toPoint(point))
    .filter((point): point is [number, number, number] => point !== null);
}

function extractFramePoints(frame: number[][][]): {
  handPoints: [number, number, number][];
  posePoints: [number, number, number][];
  facePoints: [number, number, number][];
} {
  if (!Array.isArray(frame)) {
    return { handPoints: [], posePoints: [], facePoints: [] };
  }

  const hasExplicitModalities = frame.length >= 4;
  if (hasExplicitModalities) {
    const handPoints = [...toPointList(frame[0]), ...toPointList(frame[1])];
    return {
      handPoints,
      posePoints: toPointList(frame[2]),
      facePoints: toPointList(frame[3]),
    };
  }

  return {
    handPoints: frame.flatMap((points) => toPointList(points)),
    posePoints: [],
    facePoints: [],
  };
}

function smoothPoints(
  points: [number, number, number][],
  previous: [number, number, number][] | null,
): [number, number, number][] {
  if (!previous || previous.length !== points.length) {
    return points;
  }
  const alpha = 0.35;
  return points.map((point, idx) => {
    const prev = previous[idx];
    if (!prev) {
      return point;
    }
    return [
      (prev[0] * (1 - alpha)) + (point[0] * alpha),
      (prev[1] * (1 - alpha)) + (point[1] * alpha),
      (prev[2] * (1 - alpha)) + (point[2] * alpha),
    ];
  });
}

function computeAverageJitter(
  frames: number[][][][],
  getPoints: (frame: number[][][]) => [number, number, number][],
  options?: { useSmoothing?: boolean },
): number | null {
  if (frames.length < 2) {
    return null;
  }

  const deltas: number[] = [];
  let previousSmoothed: [number, number, number][] | null = null;
  for (let i = 1; i < frames.length; i += 1) {
    const previousFrame = frames[i - 1];
    const currentFrame = frames[i];
    if (!previousFrame || !currentFrame) {
      continue;
    }
    const prevPoints = getPoints(previousFrame);
    const nextPoints = getPoints(currentFrame);
    if (prevPoints.length === 0 || nextPoints.length === 0) {
      continue;
    }
    if (prevPoints.length !== nextPoints.length) {
      continue;
    }

    const prevFramePoints: [number, number, number][] =
      options?.useSmoothing && previousSmoothed !== null
        ? previousSmoothed
        : prevPoints;
    const nextFramePoints: [number, number, number][] = options?.useSmoothing ? smoothPoints(nextPoints, prevFramePoints) : nextPoints;

    let sumOfDistances = 0;
    for (let idx = 0; idx < prevFramePoints.length; idx += 1) {
      const prev = prevFramePoints[idx];
      const next = nextFramePoints[idx];
      if (!prev || !next) {
        continue;
      }
      const dx = next[0] - prev[0];
      const dy = next[1] - prev[1];
      const dz = next[2] - prev[2];
      sumOfDistances += Math.hypot(dx, dy, dz);
    }
    deltas.push(sumOfDistances / prevFramePoints.length);
    previousSmoothed = nextFramePoints;
  }

  if (deltas.length === 0) {
    return null;
  }
  const total = deltas.reduce((acc, value) => acc + value, 0);
  return total / deltas.length;
}

function computeOverallQualityScore(
  frameCount: number,
  handCoverage: number,
  handJitter: number | null,
  poseJitter: number | null,
  faceJitter: number | null,
  avgMotion: number,
): number {
  const frameScore = Math.min(1, frameCount / (MIN_SIGN_SAMPLE_FRAMES * 2));
  const coverageScore = handCoverage;
  const handJitterScore = handJitter === null ? 1 : Math.max(0, 1 - (handJitter / MAX_HAND_JITTER));
  const poseJitterScore = poseJitter === null ? 1 : Math.max(0, 1 - (poseJitter / MAX_POSE_JITTER));
  const faceJitterScore = faceJitter === null ? 1 : Math.max(0, 1 - (faceJitter / MAX_FACE_JITTER));
  const motionScore = Math.min(1, avgMotion / 0.005);
  const jitterScore = (handJitterScore * 0.5) + (poseJitterScore * 0.25) + (faceJitterScore * 0.25);
  return Math.round(((frameScore * 0.2) + (coverageScore * 0.3) + (jitterScore * 0.4) + (motionScore * 0.1)) * 100);
}

// Basic quality checks for recorded gesture samples used in training.
// Assumes landmarks are normalized to [0,1] if available.
export function validateLandmarkSequence(samples: number[][][][]): ValidationResult {
  const issues: ValidationIssue[] = [];
  const suggestions: string[] = [];

  const frameCount = samples.length;
  if (frameCount < MIN_SIGN_SAMPLE_FRAMES) {
    issues.push('too_few_frames');
    suggestions.push('Nimm etwas länger auf (mindestens 1–2 Sekunden).');
  }

  let hasMissing = false;
  let outOfRange = false;
  let totalMotion = 0;
  let motionSamples = 0;
  let handFrames = 0;

  for (let i = 0; i < frameCount; i++) {
    const currentFrame = samples[i];
    if (!currentFrame) {
      hasMissing = true;
      continue;
    }
    const { handPoints } = extractFramePoints(currentFrame);

    if (handPoints.length === 0) {
      hasMissing = true;
      continue;
    }
    handFrames += 1;

    // Range check and motion calculation
    for (let j = 0; j < handPoints.length; j++) {
      const point = handPoints[j];
      if (!point) {
        continue;
      }
      const [x, y] = point;
      if (x < 0 || x > 1 || y < 0 || y > 1) {
        outOfRange = true;
      }
      if (i > 0) {
        const prevFrame = samples[i - 1];
        if (!prevFrame) {
          continue;
        }
        const prevPoints = extractFramePoints(prevFrame).handPoints;
        const prevPoint = prevPoints[j];
        if (prevPoint) {
          const [px, py] = prevPoint;
          const dx = x - px;
          const dy = y - py;
          totalMotion += Math.hypot(dx, dy);
          motionSamples += 1;
        }
      }
    }
  }

  if (hasMissing) {
    issues.push('landmarks_missing');
    suggestions.push('Achte darauf, dass deine Hand vollständig sichtbar und gut beleuchtet ist.');
  }
  if (outOfRange) {
    issues.push('values_out_of_range');
    suggestions.push('Halte deine Hand während der Aufnahme mittig im Bild.');
  }

  const avgMotion = motionSamples > 0 ? totalMotion / motionSamples : 0;
  if (avgMotion < 0.0015) {
    issues.push('insufficient_motion');
    suggestions.push('Bewege Finger und Hand deutlich, damit die Gebärde erfasst wird.');
  }

  const handCoverage = frameCount > 0 ? handFrames / frameCount : 0;
  if (handCoverage < MIN_HAND_FRAME_COVERAGE) {
    issues.push('hand_coverage_low');
    suggestions.push('Halte deine Hände während der gesamten Aufnahme sichtbar im Bild.');
  }

  const handJitter = computeAverageJitter(samples, (frame) => extractFramePoints(frame).handPoints, { useSmoothing: true });
  if (handJitter !== null && handJitter > MAX_HAND_JITTER) {
    issues.push('hand_jitter_high');
    suggestions.push('Halte die Kamera ruhiger und führe die Handbewegung kontrollierter aus.');
  }

  const poseJitter = computeAverageJitter(samples, (frame) => extractFramePoints(frame).posePoints, { useSmoothing: true });
  if (poseJitter !== null && poseJitter > MAX_POSE_JITTER) {
    issues.push('pose_jitter_high');
    suggestions.push('Stehe etwas ruhiger und halte den Oberkörper möglichst stabil.');
  }

  const faceJitter = computeAverageJitter(samples, (frame) => extractFramePoints(frame).facePoints, { useSmoothing: true });
  if (faceJitter !== null && faceJitter > MAX_FACE_JITTER) {
    issues.push('face_jitter_high');
    suggestions.push('Halte dein Gesicht gut im Bild und bewege den Kopf etwas weniger.');
  }

  const qualityScore = computeOverallQualityScore(
    frameCount,
    handCoverage,
    handJitter,
    poseJitter,
    faceJitter,
    avgMotion,
  );

  // Calculate confidence based on data completeness
  const confidence = Math.min(1.0, frameCount / 30); // Higher confidence with more frames

  return {
    ok: issues.length === 0,
    issues,
    suggestions,
    qualityScore,
    confidence,
  };
}
