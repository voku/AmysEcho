export type ValidationIssue =
  | 'too_few_frames'
  | 'insufficient_motion'
  | 'landmarks_missing'
  | 'values_out_of_range';

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  suggestions: string[];
}

// Basic quality checks for recorded gesture samples used in training.
// Assumes landmarks are normalized to [0,1] if available.
export function validateLandmarkSequence(samples: number[][][]): ValidationResult {
  const issues: ValidationIssue[] = [];
  const suggestions: string[] = [];

  const frameCount = samples.length;
  if (frameCount < 10) {
    issues.push('too_few_frames');
    suggestions.push('Record a bit longer (at least 1–2 seconds).');
  }

  let hasMissing = false;
  let outOfRange = false;
  let totalMotion = 0;
  let motionSamples = 0;

  for (let i = 0; i < frameCount; i++) {
    const frame = samples[i];
    if (!frame || frame.length === 0) {
      hasMissing = true;
      continue;
    }
    // Range check and motion calculation
    for (let j = 0; j < frame.length; j++) {
      const p = frame[j];
      if (!Array.isArray(p) || p.length < 2) {
        hasMissing = true;
        continue;
      }
      const [x, y] = p;
      if (
        typeof x !== 'number' ||
        typeof y !== 'number' ||
        x < 0 ||
        x > 1 ||
        y < 0 ||
        y > 1
      ) {
        outOfRange = true;
      }
      if (i > 0 && samples[i - 1] && samples[i - 1][j]) {
        const [px, py] = samples[i - 1][j];
        const dx = x - px;
        const dy = y - py;
        totalMotion += Math.hypot(dx, dy);
        motionSamples += 1;
      }
    }
  }

  if (hasMissing) {
    issues.push('landmarks_missing');
    suggestions.push('Ensure your hand is fully visible and well-lit.');
  }
  if (outOfRange) {
    issues.push('values_out_of_range');
    suggestions.push('Keep the hand centered in frame during recording.');
  }

  const avgMotion = motionSamples > 0 ? totalMotion / motionSamples : 0;
  if (avgMotion < 0.0015) {
    issues.push('insufficient_motion');
    suggestions.push('Move fingers and hand clearly to capture the gesture.');
  }

  return {
    ok: issues.length === 0,
    issues,
    suggestions,
  };
}
