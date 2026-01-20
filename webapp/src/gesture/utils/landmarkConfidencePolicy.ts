export const MIN_VISIBLE_POINTS_PER_HAND = 6;
export const MIN_VISIBLE_RATIO_PER_HAND = 0.25;
export const MIN_VISIBLE_HANDS = 1;

export type LandmarkConfidenceAssessment = {
  shouldStream: boolean;
  visibleHands: number;
  totalHands: number;
  minVisibleRatio: number;
};

export function assessLandmarkConfidence(
  landmarks: number[][][],
  visibility: number[][],
): LandmarkConfidenceAssessment {
  if (!Array.isArray(landmarks) || landmarks.length === 0) {
    return {
      shouldStream: false,
      visibleHands: 0,
      totalHands: 0,
      minVisibleRatio: 0,
    };
  }

  const totalHands = landmarks.length;
  let visibleHands = 0;
  let minVisibleRatio = 1;

  for (let handIndex = 0; handIndex < landmarks.length; handIndex += 1) {
    const hand = landmarks[handIndex] ?? [];
    const visibilityRow = visibility[handIndex] ?? [];
    const totalPoints = hand.length;

    if (totalPoints === 0) {
      minVisibleRatio = Math.min(minVisibleRatio, 0);
      continue;
    }

    const visiblePoints = visibilityRow.filter((value) => value > 0).length;
    const visibleRatio = visiblePoints / totalPoints;
    minVisibleRatio = Math.min(minVisibleRatio, visibleRatio);

    if (visiblePoints >= MIN_VISIBLE_POINTS_PER_HAND && visibleRatio >= MIN_VISIBLE_RATIO_PER_HAND) {
      visibleHands += 1;
    }
  }

  return {
    shouldStream: visibleHands >= MIN_VISIBLE_HANDS,
    visibleHands,
    totalHands,
    minVisibleRatio,
  };
}
