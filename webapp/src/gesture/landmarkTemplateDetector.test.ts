import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';
import {
  LandmarkTemplateDetector,
  normalizeLandmarks,
  landmarkDistance,
  distanceToConfidence,
  type LandmarkTemplate,
} from './landmarkTemplateDetector';
import { splitHandsFromMultimodalFrame } from './testing/fixtures/splitHandsFromMultimodalFrame';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, '../../..');
const SPIELEN_LANDMARK_FILE = path.join(
  REPO_ROOT,
  'server/data/dgs_video_examples/spielen_main_spielplatz_landmarks.json',
);

// Helper: generate a simple hand with 21 landmarks
function makeHand(offset = 0): [number, number, number][] {
  return Array.from({ length: 21 }, (_, i) => [
    0.3 + i * 0.01 + offset,
    0.5 + i * 0.02 + offset,
    0.0 + i * 0.001 + offset,
  ] as [number, number, number]);
}

function makeTemplate(
  label: string,
  landmarks: [number, number, number][],
  overrides: Partial<LandmarkTemplate> = {},
): LandmarkTemplate {
  return {
    id: `tpl_${label}`,
    label,
    profileId: 'test-profile',
    landmarks,
    handedness: 'right',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('normalizeLandmarks', () => {
  it('gibt leeres Array bei leerem Input zurück', () => {
    expect(normalizeLandmarks([])).toEqual([]);
  });

  it('zentriert Landmarks auf Handgelenk', () => {
    const landmarks: [number, number, number][] = [
      [1, 2, 3],
      [2, 4, 6],
      [3, 3, 3],
    ];
    const result = normalizeLandmarks(landmarks);
    // First point (wrist) should be [0, 0, 0]
    expect(result[0]).toEqual([0, 0, 0]);
    // [2,4,6] - [1,2,3] = [1,2,3], maxSum = |1|+|2|+|3| = 6
    expect(result[1]![0]).toBeCloseTo(1 / 6);
    expect(result[1]![1]).toBeCloseTo(2 / 6);
  });

  it('skaliert gleichmäßig', () => {
    const landmarks: [number, number, number][] = [
      [0, 0, 0],
      [10, 0, 0],
      [0, 10, 0],
    ];
    const result = normalizeLandmarks(landmarks);
    // Max sum is 10 (from x=10 or y=10)
    expect(result[1]).toEqual([1, 0, 0]);
    expect(result[2]).toEqual([0, 1, 0]);
  });

  it('behandelt identische Punkte (maxSum = 0)', () => {
    const landmarks: [number, number, number][] = [
      [5, 5, 5],
      [5, 5, 5],
    ];
    const result = normalizeLandmarks(landmarks);
    expect(result[0]).toEqual([0, 0, 0]);
    expect(result[1]).toEqual([0, 0, 0]);
  });
});

describe('landmarkDistance', () => {
  it('gibt Infinity bei unterschiedlicher Länge zurück', () => {
    expect(
      landmarkDistance(
        [[0, 0, 0]],
        [[0, 0, 0], [1, 1, 1]],
      ),
    ).toBe(Infinity);
  });

  it('gibt Infinity bei leerem Array zurück', () => {
    expect(landmarkDistance([], [])).toBe(Infinity);
  });

  it('gibt 0 für identische Landmarks zurück', () => {
    const pts: [number, number, number][] = [[1, 2, 3], [4, 5, 6]];
    expect(landmarkDistance(pts, pts)).toBe(0);
  });

  it('berechnet korrekte mittlere Distanz', () => {
    const a: [number, number, number][] = [[0, 0, 0]];
    const b: [number, number, number][] = [[3, 4, 0]];
    // Euclidean distance = 5
    expect(landmarkDistance(a, b)).toBe(5);
  });
});

describe('distanceToConfidence', () => {
  it('gibt 1.0 für Distanz 0 zurück', () => {
    expect(distanceToConfidence(0, 0.5)).toBe(1);
  });

  it('gibt 0 für Distanz >= Schwellwert zurück', () => {
    expect(distanceToConfidence(0.5, 0.5)).toBe(0);
    expect(distanceToConfidence(1.0, 0.5)).toBe(0);
  });

  it('gibt Wert zwischen 0 und 1 für mittlere Distanz zurück', () => {
    const conf = distanceToConfidence(0.25, 0.5);
    expect(conf).toBeGreaterThan(0);
    expect(conf).toBeLessThan(1);
  });
});

describe('LandmarkTemplateDetector', () => {
  it('gibt null zurück ohne Vorlagen', () => {
    const detector = new LandmarkTemplateDetector();
    const hand = makeHand();
    const result = detector.detect([hand.map(([x, y, z]) => [x, y, z])]);
    expect(result).toBeNull();
  });

  it('gibt null zurück ohne Landmarks', () => {
    const detector = new LandmarkTemplateDetector();
    detector.setTemplates([makeTemplate('hilfe', normalizeLandmarks(makeHand()))]);
    expect(detector.detect([])).toBeNull();
  });

  it('erkennt eine exakte Übereinstimmung', () => {
    const detector = new LandmarkTemplateDetector();
    const hand = makeHand();
    const normalizedTemplate = normalizeLandmarks(hand);

    detector.setTemplates([makeTemplate('hilfe', normalizedTemplate)]);

    // Feed same landmarks - should match
    const result = detector.detect([hand.map(([x, y, z]) => [x, y, z])]);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('hilfe');
    expect(result!.confidence).toBeGreaterThan(0.8);
  });

  it('wählt die beste Übereinstimmung unter mehreren Vorlagen', () => {
    const detector = new LandmarkTemplateDetector();
    const hand1 = makeHand(0);
    const hand2 = makeHand(0.5);

    detector.setTemplates([
      makeTemplate('hilfe', normalizeLandmarks(hand1)),
      makeTemplate('danke', normalizeLandmarks(hand2)),
    ]);

    // Feed hand similar to hand1 - should match 'hilfe'
    const result = detector.detect([hand1.map(([x, y, z]) => [x, y, z])]);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('hilfe');
  });

  it('gibt null zurück wenn alle Vorlagen zu weit entfernt sind', () => {
    const detector = new LandmarkTemplateDetector({ distanceThreshold: 0.01 });
    const hand = makeHand();
    // Create a hand with very different structure (reversed coordinates)
    const differentHand: [number, number, number][] = Array.from(
      { length: 21 },
      (_, i) => [0.5 - i * 0.02, 0.1 + i * 0.04, 0.3 - i * 0.01],
    );

    detector.setTemplates([makeTemplate('weit_weg', normalizeLandmarks(differentHand))]);

    const result = detector.detect([hand.map(([x, y, z]) => [x, y, z])]);
    expect(result).toBeNull();
  });

  it('getTemplateCount gibt die korrekte Anzahl zurück', () => {
    const detector = new LandmarkTemplateDetector();
    expect(detector.getTemplateCount()).toBe(0);

    detector.setTemplates([
      makeTemplate('a', normalizeLandmarks(makeHand())),
      makeTemplate('b', normalizeLandmarks(makeHand(0.1))),
    ]);
    expect(detector.getTemplateCount()).toBe(2);
  });

  it('berücksichtigt Händigkeit', () => {
    const detector = new LandmarkTemplateDetector();
    const hand = makeHand();

    detector.setTemplates([
      makeTemplate('links_geste', normalizeLandmarks(hand), { handedness: 'left' }),
    ]);

    // Feed with right hand - should not match due to handedness mismatch
    const result = detector.detect(
      [hand.map(([x, y, z]) => [x, y, z])],
      ['Right'],
    );
    expect(result).toBeNull();
  });


  it('nutzt bei Händigkeit "both" die bessere von zwei Händen', () => {
    const detector = new LandmarkTemplateDetector();
    const matchingHand = makeHand(0.25);
    const distractingHand = makeHand(-0.8);

    detector.setTemplates([
      makeTemplate('beidhaendig', normalizeLandmarks(matchingHand), { handedness: 'both' }),
    ]);

    const result = detector.detect([
      distractingHand.map(([x, y, z]) => [x, y, z]),
      matchingHand.map(([x, y, z]) => [x, y, z]),
    ]);

    expect(result).not.toBeNull();
    expect(result!.label).toBe('beidhaendig');
    expect(result!.confidence).toBeGreaterThan(0.8);
  });


  it('nutzt ohne Händigkeitshinweis die beste sichtbare Hand für right/left-Templates', () => {
    const detector = new LandmarkTemplateDetector();
    const matchingHand = makeHand(0.25);
    const distractingHand = makeHand(-0.8);

    detector.setTemplates([
      makeTemplate('rechts_ohne_handedness', normalizeLandmarks(matchingHand), { handedness: 'right' }),
    ]);

    const result = detector.detect([
      distractingHand.map(([x, y, z]) => [x, y, z]),
      matchingHand.map(([x, y, z]) => [x, y, z]),
    ]);

    expect(result).not.toBeNull();
    expect(result!.label).toBe('rechts_ohne_handedness');
    expect(result!.confidence).toBeGreaterThan(0.8);
  });

  it('erkennt Geste mit passender Händigkeit', () => {
    const detector = new LandmarkTemplateDetector();
    const hand = makeHand();

    detector.setTemplates([
      makeTemplate('rechts_geste', normalizeLandmarks(hand), { handedness: 'right' }),
    ]);

    const result = detector.detect(
      [hand.map(([x, y, z]) => [x, y, z])],
      ['right'],
    );
    expect(result).not.toBeNull();
    expect(result!.label).toBe('rechts_geste');
  });
});

describe('LandmarkTemplateDetector mit echten Landmarken aus Repo-Videos', () => {
  let twoHandFrames: number[][][][] = [];

  beforeAll(async () => {
    const payload = JSON.parse(await readFile(SPIELEN_LANDMARK_FILE, 'utf8')) as {
      frames?: Array<{ landmarks?: number[][] }>;
    };

    twoHandFrames = (payload.frames ?? [])
      .map((frame) => splitHandsFromMultimodalFrame(frame.landmarks ?? []))
      .filter((hands) => hands.length >= 2);
  });

  it('lädt mehrere zwei-Hand-Frames aus der Landmark-Datei', () => {
    expect(twoHandFrames.length).toBeGreaterThan(1);
  });


  it('erkennt reales right-Template ohne Händigkeitshinweis über die zweite sichtbare Hand', () => {
    const detector = new LandmarkTemplateDetector();
    const templateFrame = twoHandFrames[0]!;
    const probeFrame = twoHandFrames[1]!;

    detector.setTemplates([
      {
        id: 'spielen-template-right-no-handedness',
        label: 'spielen',
        profileId: 'integration-profile',
        landmarks: normalizeLandmarks(templateFrame[1]! as [number, number, number][]),
        handedness: 'right',
        createdAt: '2026-03-05T00:00:00.000Z',
      },
    ]);

    const result = detector.detect(probeFrame);

    expect(result).not.toBeNull();
    expect(result!.label).toBe('spielen');
    expect(result!.confidence).toBeGreaterThan(0.6);
  });

  it('erkennt ein echtes Template auch dann, wenn die beste Hand die zweite sichtbare Hand ist', () => {
    const detector = new LandmarkTemplateDetector();
    const templateFrame = twoHandFrames[0]!;
    const probeFrame = twoHandFrames[1]!;

    detector.setTemplates([
      {
        id: 'spielen-template-repo-real',
        label: 'spielen',
        profileId: 'integration-profile',
        landmarks: normalizeLandmarks(templateFrame[1]! as [number, number, number][]),
        handedness: 'both',
        createdAt: '2026-03-05T00:00:00.000Z',
      },
    ]);

    const result = detector.detect(probeFrame);

    expect(result).not.toBeNull();
    expect(result!.label).toBe('spielen');
    expect(result!.confidence).toBeGreaterThan(0.6);
  });
});
