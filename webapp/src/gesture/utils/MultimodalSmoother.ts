import { OneEuroFilter3D } from './OneEuroFilter';
import { NormalizedMediaPipeResult } from './mapMediaPipeResults';

const DEFAULT_LANDMARK_CONFIG = {
  minCutOff: 1.2,
  beta: 0.01,
  dCutOff: 1.0,
};

const MAX_HANDS = 2;
const MAX_HAND_POINTS = 21;
const MAX_POSE_POINTS = 33;
const MAX_FACE_POINTS = 468;

type FilterBank = OneEuroFilter3D[];

function ensureFilterBank(bank: FilterBank, required: number): FilterBank {
  const filters = [...bank];
  while (filters.length < required) {
    filters.push(
      new OneEuroFilter3D(
        DEFAULT_LANDMARK_CONFIG.minCutOff,
        DEFAULT_LANDMARK_CONFIG.beta,
        DEFAULT_LANDMARK_CONFIG.dCutOff,
      ),
    );
  }
  return filters.slice(0, required);
}

function smoothPoint(
  point: number[],
  filter: OneEuroFilter3D,
  timestamp: number,
  keepVisibility = false,
): number[] {
  const vector: [number, number, number] = [
    typeof point[0] === 'number' && Number.isFinite(point[0]) ? point[0] : 0,
    typeof point[1] === 'number' && Number.isFinite(point[1]) ? point[1] : 0,
    typeof point[2] === 'number' && Number.isFinite(point[2]) ? point[2] : 0,
  ];
  const filtered = filter.filter(vector, timestamp);
  if (keepVisibility && point.length > 3) {
    return [filtered[0], filtered[1], filtered[2], point[3] ?? 0];
  }
  return [filtered[0], filtered[1], filtered[2]];
}

export class MultimodalSmoother {
  private handFilters: FilterBank[] = [];
  private poseFilters: FilterBank = [];
  private faceFilters: FilterBank = [];

  smooth(result: NormalizedMediaPipeResult, timestamp: number): NormalizedMediaPipeResult {
    const smoothedHands = this.smoothHands(result.landmarks, timestamp);
    const smoothedPose = this.smoothPose(result.poseLandmarks, timestamp);
    const smoothedFace = this.smoothFace(result.faceLandmarks, timestamp);

    return {
      ...result,
      landmarks: smoothedHands,
      poseLandmarks: smoothedPose,
      faceLandmarks: smoothedFace,
    };
  }

  private smoothHands(hands: number[][][], timestamp: number): number[][][] {
    if (!Array.isArray(hands)) return [];

    const limitedHands = hands.slice(0, MAX_HANDS);
    while (this.handFilters.length < limitedHands.length) {
      this.handFilters.push([]);
    }
    this.handFilters = this.handFilters.slice(0, limitedHands.length);

    return limitedHands.map((handLandmarks, handIdx) => {
      const filters = ensureFilterBank(this.handFilters[handIdx] ?? [], MAX_HAND_POINTS);
      this.handFilters[handIdx] = filters;
      const paddedHand = handLandmarks.slice(0, MAX_HAND_POINTS);
      return paddedHand.map((point, pointIdx) => {
        const filter = filters[pointIdx];
        if (!filter) return [point?.[0] ?? 0, point?.[1] ?? 0, point?.[2] ?? 0];
        return smoothPoint(point ?? [0, 0, 0], filter, timestamp);
      });
    });
  }

  private smoothPose(poseLandmarks: number[][], timestamp: number): number[][] {
    if (!Array.isArray(poseLandmarks)) return [];
    this.poseFilters = ensureFilterBank(this.poseFilters, Math.min(poseLandmarks.length, MAX_POSE_POINTS));
    return poseLandmarks.slice(0, MAX_POSE_POINTS).map((point, idx) => {
      const filter = this.poseFilters[idx];
      if (!filter) return [point?.[0] ?? 0, point?.[1] ?? 0, point?.[2] ?? 0, point?.[3] ?? 0];
      return smoothPoint(point ?? [0, 0, 0, 0], filter, timestamp, true);
    });
  }

  private smoothFace(faceLandmarks: number[][], timestamp: number): number[][] {
    if (!Array.isArray(faceLandmarks)) return [];
    this.faceFilters = ensureFilterBank(this.faceFilters, Math.min(faceLandmarks.length, MAX_FACE_POINTS));
    return faceLandmarks.slice(0, MAX_FACE_POINTS).map((point, idx) => {
      const filter = this.faceFilters[idx];
      if (!filter) return [point?.[0] ?? 0, point?.[1] ?? 0, point?.[2] ?? 0];
      return smoothPoint(point ?? [0, 0, 0], filter, timestamp);
    });
  }
}

export default MultimodalSmoother;
