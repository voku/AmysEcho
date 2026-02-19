import { describe, expect, it } from 'vitest';
import { validateLandmarkSequence } from './trainingValidator';
import { MAX_FACE_JITTER, MAX_HAND_JITTER, MAX_POSE_JITTER } from './trainingQuality';

const makePoints = (n: number, x = 0.1, y = 0.2, z = 0): number[][] =>
  Array.from({ length: n }, (_, i) => [x + (i * 0.001), y + (i * 0.001), z]);

const makeMultiModalFrame = ({
  handOffset = 0,
  includeHand = true,
  poseOffset = 0,
  includePose = true,
  faceOffset = 0,
  includeFace = true,
}: {
  handOffset?: number;
  includeHand?: boolean;
  poseOffset?: number;
  includePose?: boolean;
  faceOffset?: number;
  includeFace?: boolean;
} = {}): number[][][] => [
  includeHand ? makePoints(21, 0.1 + handOffset, 0.2 + handOffset, 0) : [],
  [],
  includePose ? makePoints(33, 0.3 + poseOffset, 0.4 + poseOffset, 0) : [],
  includeFace ? makePoints(20, 0.5 + faceOffset, 0.6 + faceOffset, 0) : [],
];

describe('TrainingDataValidator', () => {
  it('flags too few frames', () => {
    const seq = [[makePoints(5)]];
    const result = validateLandmarkSequence(seq);
    expect(result.ok).toBe(false);
    expect(result.issues).toContain('too_few_frames');
    expect(result.suggestions).toContain('Nimm etwas länger auf (mindestens 1–2 Sekunden).');
  });

  it('flags insufficient motion', () => {
    const frame = makeMultiModalFrame();
    const seq = Array.from({ length: 15 }, () => frame); // identical frames -> no motion
    const result = validateLandmarkSequence(seq);
    expect(result.ok).toBe(false);
    expect(result.issues).toContain('insufficient_motion');
    expect(result.suggestions).toContain('Bewege Finger und Hand deutlich, damit die Gebärde erfasst wird.');
  });

  it('flags low hand coverage', () => {
    const seq = Array.from({ length: 10 }, (_, index) =>
      makeMultiModalFrame({ includeHand: index < 6 }),
    );

    const result = validateLandmarkSequence(seq);

    expect(result.ok).toBe(false);
    expect(result.issues).toContain('hand_coverage_low');
    expect(result.suggestions).toContain('Halte deine Hände während der gesamten Aufnahme sichtbar im Bild.');
  });

  it('flags high hand jitter', () => {
    const seq = Array.from({ length: 12 }, (_, index) =>
      makeMultiModalFrame({ handOffset: index % 2 === 0 ? 0 : MAX_HAND_JITTER + 1.2 }),
    );

    const result = validateLandmarkSequence(seq);

    expect(result.ok).toBe(false);
    expect(result.issues).toContain('hand_jitter_high');
    expect(result.suggestions).toContain('Halte die Kamera ruhiger und führe die Handbewegung kontrollierter aus.');
  });

  it('flags high pose jitter', () => {
    const seq = Array.from({ length: 12 }, (_, index) =>
      makeMultiModalFrame({ poseOffset: index % 2 === 0 ? 0 : MAX_POSE_JITTER + 1.2 }),
    );

    const result = validateLandmarkSequence(seq);

    expect(result.ok).toBe(false);
    expect(result.issues).toContain('pose_jitter_high');
    expect(result.suggestions).toContain('Stehe etwas ruhiger und halte den Oberkörper möglichst stabil.');
  });


  it('accepts moderate pose jitter below updated threshold', () => {
    const seq = Array.from({ length: 12 }, (_, index) =>
      makeMultiModalFrame({ poseOffset: index % 2 === 0 ? 0 : MAX_POSE_JITTER * 0.5 }),
    );

    const result = validateLandmarkSequence(seq);

    expect(result.issues).not.toContain('pose_jitter_high');
  });



  it('accepts borderline oscillating hand jitter with continuous smoothing', () => {
    const seq = Array.from({ length: 12 }, (_, index) =>
      makeMultiModalFrame({ handOffset: index % 2 === 0 ? 0 : 0.9 }),
    );

    const result = validateLandmarkSequence(seq);

    expect(result.issues).not.toContain('hand_jitter_high');
  });

  it('accepts moderate hand jitter below updated threshold', () => {
    const seq = Array.from({ length: 12 }, (_, index) =>
      makeMultiModalFrame({ handOffset: index % 2 === 0 ? 0 : MAX_HAND_JITTER * 0.5 }),
    );

    const result = validateLandmarkSequence(seq);

    expect(result.issues).not.toContain('hand_jitter_high');
  });

  it('accepts moderate face jitter below updated threshold', () => {
    const seq = Array.from({ length: 12 }, (_, index) =>
      makeMultiModalFrame({ faceOffset: index % 2 === 0 ? 0 : MAX_FACE_JITTER * 0.5 }),
    );

    const result = validateLandmarkSequence(seq);

    expect(result.issues).not.toContain('face_jitter_high');
  });

  it('flags high face jitter', () => {
    const seq = Array.from({ length: 12 }, (_, index) =>
      makeMultiModalFrame({ faceOffset: index % 2 === 0 ? 0 : MAX_FACE_JITTER + 1.2 }),
    );

    const result = validateLandmarkSequence(seq);

    expect(result.ok).toBe(false);
    expect(result.issues).toContain('face_jitter_high');
    expect(result.suggestions).toContain('Halte dein Gesicht gut im Bild und bewege den Kopf etwas weniger.');
  });

  it('accepts reasonable sample', () => {
    const seq: number[][][][] = [];
    for (let i = 0; i < 15; i++) {
      seq.push(makeMultiModalFrame({
        handOffset: i * 0.002,
        poseOffset: i * 0.001,
        faceOffset: i * 0.0008,
      }));
    }
    const result = validateLandmarkSequence(seq);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});
