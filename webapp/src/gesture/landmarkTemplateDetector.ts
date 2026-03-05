/**
 * Landmark Template Detector
 *
 * Matches live hand landmarks against stored templates using Euclidean
 * distance. This provides a simpler, more reliable detection method for
 * custom gestures that complements the existing MediaPipe baseline and MLP
 * pipeline.
 *
 * How it works:
 * 1. Templates are normalized landmark arrays stored per-profile on the server.
 * 2. Live landmarks are normalized the same way (centered on wrist, uniformly
 *    scaled) before comparison.
 * 3. For each template we compute the mean Euclidean distance across all
 *    landmark points. The closest template below a configurable threshold
 *    is selected.
 * 4. Confidence is derived from inverse distance (closer = higher confidence).
 */

export interface LandmarkTemplate {
  id: string;
  label: string;
  profileId: string;
  landmarks: [number, number, number][];
  handedness: 'left' | 'right' | 'both';
  createdAt: string;
}

export interface TemplateMatchResult {
  label: string;
  confidence: number;
  templateId: string;
  distance: number;
}

// Maximum mean-per-point Euclidean distance to consider a match.
// Templates are normalized to roughly [-1, 1] so 0.35 is fairly permissive.
const DEFAULT_DISTANCE_THRESHOLD = 0.35;

// Minimum confidence to report a match (derived from distance).
const DEFAULT_MIN_CONFIDENCE = 0.15;

/**
 * Normalize a landmark array by centering on the wrist and scaling uniformly.
 * Mirrors the normalization used in training (landmarkNormalizer.ts).
 */
export function normalizeLandmarks(
  landmarks: [number, number, number][],
): [number, number, number][] {
  if (landmarks.length === 0) return [];

  const wrist = landmarks[0]!;
  // Center on wrist
  const centered: [number, number, number][] = landmarks.map(([x, y, z]) => [
    x - wrist[0],
    y - wrist[1],
    z - wrist[2],
  ]);

  // Scale factor: max absolute coordinate sum across all points
  let maxSum = 0;
  for (const [x, y, z] of centered) {
    const sum = Math.abs(x) + Math.abs(y) + Math.abs(z);
    if (sum > maxSum) maxSum = sum;
  }

  if (maxSum === 0) return centered;

  return centered.map(([x, y, z]) => [
    x / maxSum,
    y / maxSum,
    z / maxSum,
  ]);
}

/**
 * Compute the mean Euclidean distance between two landmark arrays.
 * Returns Infinity if the arrays have different lengths.
 */
export function landmarkDistance(
  a: [number, number, number][],
  b: [number, number, number][],
): number {
  if (a.length !== b.length || a.length === 0) return Infinity;

  let totalDist = 0;
  for (let i = 0; i < a.length; i++) {
    const ptA = a[i]!;
    const ptB = b[i]!;
    const dx = ptA[0] - ptB[0];
    const dy = ptA[1] - ptB[1];
    const dz = ptA[2] - ptB[2];
    totalDist += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  return totalDist / a.length;
}

/**
 * Convert Euclidean distance to a [0, 1] confidence score.
 * Uses an inverse mapping where distance 0 → confidence 1.0 and distance
 * equal to threshold → confidence ≈ 0.
 */
export function distanceToConfidence(
  distance: number,
  threshold: number,
): number {
  if (distance >= threshold) return 0;
  // Smooth inverse: 1 - (d / threshold)^2 gives a nice curve
  const ratio = distance / threshold;
  return Math.max(0, 1 - ratio * ratio);
}

export class LandmarkTemplateDetector {
  private templates: LandmarkTemplate[] = [];
  private distanceThreshold: number;
  private minConfidence: number;

  constructor(options?: { distanceThreshold?: number; minConfidence?: number }) {
    this.distanceThreshold = options?.distanceThreshold ?? DEFAULT_DISTANCE_THRESHOLD;
    this.minConfidence = options?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  }

  /**
   * Replace the current set of templates.
   */
  setTemplates(templates: LandmarkTemplate[]): void {
    this.templates = templates;
  }

  /**
   * Get the current template count.
   */
  getTemplateCount(): number {
    return this.templates.length;
  }

  /**
   * Detect the best matching template for the given live landmarks.
   *
   * @param liveLandmarks Raw hand landmarks from MediaPipe – array of hands,
   *   each hand is an array of [x, y, z] points.
   * @param handednesses Optional handedness labels for each hand.
   * @returns The best match or null if nothing matches.
   */
  detect(
    liveLandmarks: number[][][],
    handednesses?: string[],
  ): TemplateMatchResult | null {
    if (this.templates.length === 0 || liveLandmarks.length === 0) {
      return null;
    }

    // Pre-normalize all available hands once (avoid redundant work inside the loop).
    const normalizedHands: ([number, number, number][] | null)[] = liveLandmarks.map(
      (_hand, i) => {
        const pts = this.extractHandPoints(liveLandmarks, i);
        return pts.length > 0 ? normalizeLandmarks(pts) : null;
      },
    );

    const normalizedTwo =
      normalizedHands.length >= 2 && normalizedHands[0] && normalizedHands[1]
        ? normalizeLandmarks(
            this.extractHandPoints(liveLandmarks, 0).concat(
              this.extractHandPoints(liveLandmarks, 1),
            ),
          )
        : null;

    const lowerHandednesses = handednesses?.map((h) => h.toLowerCase()) ?? [];

    let bestMatch: TemplateMatchResult | null = null;

    for (const template of this.templates) {
      const candidateLandmarksList = this.selectCandidateLandmarks(
        template,
        normalizedHands,
        normalizedTwo,
        lowerHandednesses,
      );
      if (candidateLandmarksList.length === 0) continue;

      let templateBestDistance = Infinity;

      for (const candidateLandmarks of candidateLandmarksList) {
        const dist = landmarkDistance(candidateLandmarks, template.landmarks);
        if (dist < templateBestDistance) {
          templateBestDistance = dist;
        }
      }

      const confidence = distanceToConfidence(templateBestDistance, this.distanceThreshold);

      if (confidence >= this.minConfidence && (!bestMatch || confidence > bestMatch.confidence)) {
        bestMatch = {
          label: template.label,
          confidence,
          templateId: template.id,
          distance: templateBestDistance,
        };
      }
    }

    return bestMatch;
  }

  /**
   * Select the appropriate normalized landmarks for a template based on
   * hand count and handedness.
   */
  private selectCandidateLandmarks(
    template: LandmarkTemplate,
    normalizedHands: ([number, number, number][] | null)[],
    normalizedTwo: [number, number, number][] | null,
    lowerHandednesses: string[],
  ): [number, number, number][][] {
    // Two-hand template: use concatenated pair
    if (template.landmarks.length === 42) {
      return normalizedTwo ? [normalizedTwo] : [];
    }

    // Single-hand template with "both": evaluate all visible hands and use the best match.
    if (template.handedness === 'both') {
      return normalizedHands.filter((hand): hand is [number, number, number][] => !!hand);
    }

    // Find the hand whose handedness matches the template
    if (lowerHandednesses.length > 0) {
      for (let i = 0; i < lowerHandednesses.length; i++) {
        const hand = normalizedHands[i];
        if (lowerHandednesses[i] === template.handedness && hand) {
          return [hand];
        }
      }
      // No matching handedness found
      return [];
    }

    // No handedness info available: evaluate all visible hands and use best match.
    // This avoids false negatives when MediaPipe landmark sources omit handedness
    // and the matching hand is not the first visible hand.
    return normalizedHands.filter((hand): hand is [number, number, number][] => !!hand);
  }

  /**
   * Extract [x, y, z] tuples from a specific hand in the landmarks array.
   */
  private extractHandPoints(
    landmarks: number[][][],
    handIndex: number,
  ): [number, number, number][] {
    const hand = landmarks[handIndex];
    if (!hand || hand.length === 0) return [];

    return hand.map((point) => [
      point[0] ?? 0,
      point[1] ?? 0,
      point[2] ?? 0,
    ]);
  }
}
