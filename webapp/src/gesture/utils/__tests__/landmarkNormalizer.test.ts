/**
 * Tests for Landmark Normalizer
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeLandmarks,
  normalizeLandmarksToFlat,
  convertToPoints,
  prepareLandmarksForMLP,
  calculateCentroid,
  calculateBoundingBox,
  distance,
  isFingerExtended,
  getFingerTips,
  calculatePalmCenter,
  Point,
} from '../landmarkNormalizer';

describe('LandmarkNormalizer', () => {
  describe('normalizeLandmarks', () => {
    it('gibt leeres Array für leere Eingabe zurück', () => {
      expect(normalizeLandmarks([])).toEqual([]);
    });

    it('normalisiert Landmarks relativ zum Handgelenk', () => {
      const landmarks: Point[] = [
        [0.5, 0.5, 0.5], // wrist
        [0.6, 0.5, 0.5], // first point
        [0.5, 0.6, 0.5], // second point
      ];

      const result = normalizeLandmarks(landmarks);

      // Wrist should be at origin
      expect(result[0]).toEqual([0, 0, 0]);
      // Other points should be translated
      expect(result[1]![0]).toBeGreaterThan(0); // x moved right
      expect(result[2]![1]).toBeGreaterThan(0); // y moved down
    });

    it('skaliert Landmarks auf einheitliche Größe', () => {
      const landmarks: Point[] = [
        [0, 0, 0], // wrist
        [1, 0, 0], // point 1 unit away
      ];

      const result = normalizeLandmarks(landmarks);

      // After scaling, max extent should be 1
      const maxExtent = result.reduce(
        (max, [x, y, z]) => Math.max(max, Math.abs(x) + Math.abs(y) + Math.abs(z)),
        0
      );
      expect(maxExtent).toBeLessThanOrEqual(1.001);
    });
  });

  describe('normalizeLandmarksToFlat', () => {
    it('gibt leeres Array für unzureichende Landmarks zurück', () => {
      const result = normalizeLandmarksToFlat([]);
      expect(result.length).toBe(0);
    });

    it('konvertiert Landmarks zu flachem Float32Array', () => {
      // Create 21 landmarks (minimum for a hand)
      const landmarks: Point[] = Array(21).fill(null).map((_, i) => [i * 0.01, i * 0.01, i * 0.01]);

      const result = normalizeLandmarksToFlat(landmarks);

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(63); // 21 points * 3 coordinates
    });
  });

  describe('convertToPoints', () => {
    it('konvertiert Zahlen-Arrays zu Points', () => {
      const raw = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]];
      const result = convertToPoints(raw);

      expect(result).toEqual([
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ]);
    });

    it('behandelt fehlende z-Koordinate', () => {
      const raw = [[0.1, 0.2]];
      const result = convertToPoints(raw);

      expect(result[0]).toEqual([0.1, 0.2, 0]);
    });

    it('behandelt ungültige Eingabe', () => {
      expect(convertToPoints(null as any)).toEqual([]);
      expect(convertToPoints(undefined as any)).toEqual([]);
    });
  });

  describe('calculateCentroid', () => {
    it('berechnet Mittelpunkt korrekt', () => {
      const landmarks: Point[] = [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
      ];

      const centroid = calculateCentroid(landmarks);

      expect(centroid).toEqual([0.5, 0.5, 0]);
    });

    it('gibt Nullpunkt für leere Eingabe zurück', () => {
      expect(calculateCentroid([])).toEqual([0, 0, 0]);
    });
  });

  describe('calculateBoundingBox', () => {
    it('berechnet Bounding Box korrekt', () => {
      const landmarks: Point[] = [
        [0, 0, 0],
        [1, 2, 3],
        [-1, -2, -3],
      ];

      const bbox = calculateBoundingBox(landmarks);

      expect(bbox.minX).toBe(-1);
      expect(bbox.maxX).toBe(1);
      expect(bbox.minY).toBe(-2);
      expect(bbox.maxY).toBe(2);
      expect(bbox.minZ).toBe(-3);
      expect(bbox.maxZ).toBe(3);
      expect(bbox.width).toBe(2);
      expect(bbox.height).toBe(4);
      expect(bbox.depth).toBe(6);
    });

    it('gibt Null-Box für leere Eingabe zurück', () => {
      const bbox = calculateBoundingBox([]);
      expect(bbox.width).toBe(0);
      expect(bbox.height).toBe(0);
    });
  });

  describe('distance', () => {
    it('berechnet Distanz zwischen zwei Punkten', () => {
      const a: Point = [0, 0, 0];
      const b: Point = [3, 4, 0];

      expect(distance(a, b)).toBe(5); // 3-4-5 triangle
    });

    it('berechnet 3D-Distanz', () => {
      const a: Point = [0, 0, 0];
      const b: Point = [1, 1, 1];

      expect(distance(a, b)).toBeCloseTo(Math.sqrt(3));
    });
  });

  describe('isFingerExtended', () => {
    it('erkennt ausgestreckten Finger', () => {
      const tip: Point = [0.5, 0.1, 0]; // Higher (lower y)
      const pip: Point = [0.5, 0.3, 0];
      const mcp: Point = [0.5, 0.5, 0]; // Lower (higher y)

      expect(isFingerExtended(tip, pip, mcp)).toBe(true);
    });

    it('erkennt gebeugten Finger', () => {
      const tip: Point = [0.5, 0.5, 0]; // Same height as MCP
      const pip: Point = [0.5, 0.3, 0];
      const mcp: Point = [0.5, 0.5, 0];

      expect(isFingerExtended(tip, pip, mcp)).toBe(false);
    });
  });

  describe('getFingerTips', () => {
    it('extrahiert Fingerspitzen aus vollständigen Landmarks', () => {
      // Create 21 landmarks
      const landmarks: Point[] = Array(21).fill(null).map((_, i) => [i * 0.01, i * 0.01, 0]);

      const tips = getFingerTips(landmarks);

      expect(tips.thumb).toEqual([0.04, 0.04, 0]); // Index 4
      expect(tips.index).toEqual([0.08, 0.08, 0]); // Index 8
      expect(tips.middle).toEqual([0.12, 0.12, 0]); // Index 12
      expect(tips.ring).toEqual([0.16, 0.16, 0]); // Index 16
      expect(tips.pinky).toEqual([0.2, 0.2, 0]); // Index 20
    });

    it('gibt null für fehlende Landmarks zurück', () => {
      const tips = getFingerTips([]);

      expect(tips.thumb).toBeNull();
      expect(tips.index).toBeNull();
    });
  });

  describe('calculatePalmCenter', () => {
    it('berechnet Handflächen-Zentrum', () => {
      // Create 21 landmarks with known positions
      const landmarks: Point[] = Array(21).fill(null).map(() => [0.5, 0.5, 0]);

      const center = calculatePalmCenter(landmarks);

      expect(center).not.toBeNull();
      expect(center![0]).toBeCloseTo(0.5);
      expect(center![1]).toBeCloseTo(0.5);
    });

    it('gibt null für unzureichende Landmarks zurück', () => {
      expect(calculatePalmCenter([])).toBeNull();
      expect(calculatePalmCenter(Array(10).fill([0, 0, 0]))).toBeNull();
    });
  });

  describe('prepareLandmarksForMLP', () => {
    it('bereitet Landmarks für MLP-Klassifizierung vor', () => {
      const raw = Array(21).fill(null).map((_, i) => [i * 0.01, i * 0.01, i * 0.01]);

      const result = prepareLandmarksForMLP(raw);

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(63);
    });
  });
});
