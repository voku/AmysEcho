export type ValidationIssue =
  | 'too_few_frames'
  | 'insufficient_motion'
  | 'landmarks_missing'
  | 'values_out_of_range';

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  suggestions: string[];
  qualityScore: number; // 0-100 quality score
  confidence: number; // 0-1 confidence in the validation
}

// Basic quality checks for recorded gesture samples used in training.
// Assumes landmarks are normalized to [0,1] if available.
export function validateLandmarkSequence(samples: number[][][][]): ValidationResult {
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
    const currentFrame = samples[i];
    if (!currentFrame) {
      hasMissing = true;
      continue;
    }
    const frame = currentFrame.flat();
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
      if (typeof x !== 'number' || typeof y !== 'number') {
        hasMissing = true;
        continue;
      }
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
      if (i > 0) {
        const prevFrame = samples[i - 1];
        if (!prevFrame) {
          continue;
        }
        const prev = prevFrame.flat();
        const prevPoint = prev[j];
        if (prevPoint) {
          const [px, py] = prevPoint;
          if (typeof px !== 'number' || typeof py !== 'number') {
            continue;
          }
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

  // Calculate quality score based on various factors
  let qualityScore = 100;

  // Penalize for each issue
  qualityScore -= issues.length * 15;

  // Bonus for good motion
  if (avgMotion > 0.005) {
    qualityScore += 10;
  }

  // Bonus for sufficient frames
  if (frameCount >= 20) {
    qualityScore += 5;
  }

  // Ensure score is within bounds
  qualityScore = Math.max(0, Math.min(100, qualityScore));

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
