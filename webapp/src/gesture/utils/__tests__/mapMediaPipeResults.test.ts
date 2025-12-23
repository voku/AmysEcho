import { describe, it, expect } from 'vitest';
import { mapMediaPipeResult } from '../mapMediaPipeResults';
import { MediaPipeGestureResult } from '../../types/MediaPipeTypes';

describe('mapMediaPipeResult', () => {
  it('returns empty structures when result is undefined', () => {
    expect(mapMediaPipeResult()).toEqual({ 
      hands: [], 
      landmarks: [], 
      handednesses: [], 
      poseLandmarks: [], 
      faceLandmarks: [] 
    });
  });

  it('normalizes single-hand landmarks and gestures', () => {
    const result: MediaPipeGestureResult = {
      landmarks: [
        [
          { x: 0.1, y: 0.2, z: 0.3 },
          { x: 0.4, y: 0.5 },
        ],
      ],
      handednesses: [[{ categoryName: 'Left' }]],
      gestures: [[{ categoryName: 'thumbs_up', score: 0.9 }]],
    };

    const mapped = mapMediaPipeResult(result);

    expect(mapped.hands).toHaveLength(1);
    const firstHand = mapped.hands[0];
    if (firstHand) {
      expect(firstHand.handedness).toBe('Left');
      expect(firstHand.gestures[0]).toEqual({ label: 'thumbs_up', score: 0.9 });
    }
    expect(mapped.landmarks[0]).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0],
    ]);
  });

  it('preserves hand ordering and fills missing data', () => {
    const result: MediaPipeGestureResult = {
      landmarks: [
        [
          { x: 0.1, y: 0.1, z: 0.1 },
          { x: 0.2, y: 0.2, z: 0.2 },
        ],
      ],
      gestures: [
        [
          { categoryName: 'open_palm', score: 0.8 },
        ],
        [
          { categoryName: 'fist', score: 0.7 },
        ],
      ],
    };

    const mapped = mapMediaPipeResult(result);

    expect(mapped.hands).toHaveLength(2);
    const firstHand = mapped.hands[0];
    const secondHand = mapped.hands[1];
    if (firstHand) expect(firstHand.handedness).toBe('unknown');
    if (secondHand) {
      expect(secondHand.landmarks).toEqual([]);
      expect(secondHand.gestures[0]).toEqual({ label: 'fist', score: 0.7 });
    }
    expect(mapped.handednesses).toEqual(['unknown', 'unknown']);
  });
});
