import { describe, expect, it } from 'vitest';
import {
  LandmarkTemplateDetector,
  normalizeLandmarks,
  landmarkDistance,
  distanceToConfidence,
  type LandmarkTemplate,
} from './landmarkTemplateDetector';

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
