import type { TrainingFrame } from '../types';

function buildHand(start: number): number[][] {
  return Array.from({ length: 21 }, (_, idx) => {
    const base = start + idx * 0.001;
    return [
      Math.round(base * 10000) / 10000,
      Math.round((base + 0.1) * 10000) / 10000,
      Math.round((base + 0.2) * 10000) / 10000,
    ];
  });
}

const leftHandPrimary = buildHand(0.11);
const rightHandPrimary = buildHand(0.51);
const rightOnlyFollowUp = buildHand(0.33);

export const REALISTIC_FRAMES: TrainingFrame[] = [
  {
    landmarks: [leftHandPrimary, rightHandPrimary],
    handedness: ['Left', 'Right'],
  },
  {
    landmarks: [rightOnlyFollowUp, []],
    handedness: ['Right'],
  },
];
