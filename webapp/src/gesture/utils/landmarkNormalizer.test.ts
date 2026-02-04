/**
 * Tests for Landmark Normalizer
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeLandmarks,
  normalizeLandmarksToFlat,
  convertToPoints,
  prepareLandmarksForMLP,
  prepareMultimodalForMLP,
  calculateCentroid,
  calculateBoundingBox,
  distance,
  isFingerExtended,
  getFingerTips,
  calculatePalmCenter,
  Point,
} from './landmarkNormalizer';

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

describe('prepareMultimodalForMLP', () => {
    // Constants for multimodal feature dimensions
    const _HAND_FEATURES = 126; // 2 hands × 21 points × 3 coords
    const _POSE_FEATURES = 99; // 33 points × 3 coords (visibility dropped)
const TOTAL_MULTIMODAL_FEATURES = 1629; // hands (126) + pose (99) + face (1404)
const HAND_SECTION_END = _HAND_FEATURES; // 0-125
const POSE_SECTION_START = _HAND_FEATURES; // 126-224
const POSE_SECTION_END = 225; // 126-224  
const FACE_SECTION_START = 225; // 225-1628
const FACE_SECTION_END = TOTAL_MULTIMODAL_FEATURES; // 225-1628

    // Helper to create realistic hand data (42 points = 2 hands × 21 landmarks)
    function createHandData(): number[][] {
      const hands: number[][] = [];
      // Left hand (21 landmarks)
      for (let i = 0; i < 21; i++) {
        hands.push([0.3 + i * 0.01, 0.5 + i * 0.01, 0.1 + i * 0.001]);
      }
      // Right hand (21 landmarks)
      for (let i = 0; i < 21; i++) {
        hands.push([0.6 + i * 0.01, 0.5 + i * 0.01, 0.1 + i * 0.001]);
      }
      return hands;
    }

    // Helper to create realistic pose data (33 landmarks with x,y,z,visibility)
    function createPoseData(): number[][] {
      const pose: number[][] = [];
      for (let i = 0; i < 33; i++) {
        pose.push([
          0.5 + i * 0.01,
          0.5 + i * 0.01,
          0.1 + i * 0.001,
          0.9 // visibility
        ]);
      }
      // Ensure shoulders exist at indices 11 and 12
      pose[11] = [0.4, 0.3, 0.1, 0.95];
      pose[12] = [0.6, 0.3, 0.1, 0.95];
      // Ensure hips exist at indices 23 and 24
      pose[23] = [0.4, 0.7, 0.15, 0.9];
      pose[24] = [0.6, 0.7, 0.15, 0.9];
      return pose;
    }

    // Helper to create realistic face data (468 landmarks)
    function createFaceData(): number[][] {
      const face: number[][] = [];
      for (let i = 0; i < 468; i++) {
        face.push([0.5 + i * 0.0001, 0.5 + i * 0.0001, 0.05 + i * 0.00001]);
      }
      // Ensure key landmarks exist
      face[1] = [0.5, 0.5, 0.05]; // nose tip
      face[33] = [0.45, 0.45, 0.05]; // left eye
      face[263] = [0.55, 0.45, 0.05]; // right eye
      face[13] = [0.5, 0.55, 0.05]; // upper lip
      face[14] = [0.5, 0.58, 0.05]; // lower lip
      return face;
    }

    it('erzeugt 258-dimensionale Ausgabe für hands-only', () => {
      const hands = createHandData();
      const result = prepareMultimodalForMLP(hands);

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(TOTAL_MULTIMODAL_FEATURES);
    });

    it('erzeugt 258-dimensionale Ausgabe mit hands + pose', () => {
      const hands = createHandData();
      const pose = createPoseData();
      const result = prepareMultimodalForMLP(hands, pose);

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(TOTAL_MULTIMODAL_FEATURES);
    });

    it('erzeugt 258-dimensionale Ausgabe mit hands + face', () => {
      const hands = createHandData();
      const face = createFaceData();
      const result = prepareMultimodalForMLP(hands, undefined, face);

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(TOTAL_MULTIMODAL_FEATURES);
    });

    it('erzeugt 258-dimensionale Ausgabe mit hands + pose + face', () => {
      const hands = createHandData();
      const pose = createPoseData();
      const face = createFaceData();
      const result = prepareMultimodalForMLP(hands, pose, face);

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(TOTAL_MULTIMODAL_FEATURES);
    });

    it('normalisiert Handlandmarks korrekt (126 features)', () => {
      const hands = createHandData();
      const result = prepareMultimodalForMLP(hands);

      // First 126 elements should be hand features (not all zeros)
      const handFeatures = result.slice(0, HAND_SECTION_END);
      const hasNonZero = Array.from(handFeatures).some(v => v !== 0);
      expect(hasNonZero).toBe(true);

      // Pose and face should be zeros when not provided
      const poseFeatures = result.slice(POSE_SECTION_START, POSE_SECTION_END);
      expect(Array.from(poseFeatures).every(v => v === 0)).toBe(true);
      const faceFeatures = result.slice(FACE_SECTION_START, FACE_SECTION_END);
      expect(Array.from(faceFeatures).every(v => v === 0)).toBe(true);
    });

    it('normalisiert Pose-Landmarks korrekt (99 features)', () => {
      const hands = createHandData();
      const pose = createPoseData();
      const result = prepareMultimodalForMLP(hands, pose);

      // Pose features at indices 126-224 should have non-zero values
      const poseFeatures = result.slice(POSE_SECTION_START, POSE_SECTION_END);
      const hasNonZero = Array.from(poseFeatures).some(v => v !== 0);
      expect(hasNonZero).toBe(true);

      // Face features should be zeros when not provided
      const faceFeatures = result.slice(FACE_SECTION_START, FACE_SECTION_END);
      expect(Array.from(faceFeatures).every(v => v === 0)).toBe(true);
    });

    it('normalisiert Gesichtslandmarks korrekt (33 features)', () => {
      const hands = createHandData();
      const face = createFaceData();
      const result = prepareMultimodalForMLP(hands, undefined, face);

      // Face features at indices 225-257 should have non-zero values
      const faceFeatures = result.slice(FACE_SECTION_START, FACE_SECTION_END);
      const hasNonZero = Array.from(faceFeatures).some(v => v !== 0);
      expect(hasNonZero).toBe(true);

      // Pose features should be zeros when not provided
      const poseFeatures = result.slice(POSE_SECTION_START, POSE_SECTION_END);
      expect(Array.from(poseFeatures).every(v => v === 0)).toBe(true);
    });

    it('behandelt fehlende Pose-Daten (< 33 landmarks)', () => {
      const hands = createHandData();
      const incompletePose = [[0.5, 0.5, 0.1, 0.9]]; // Only 1 landmark
      const result = prepareMultimodalForMLP(hands, incompletePose);

      // Pose section should be all zeros
      const poseFeatures = result.slice(POSE_SECTION_START, POSE_SECTION_END);
      expect(Array.from(poseFeatures).every(v => v === 0)).toBe(true);
    });

    it('behandelt fehlende Gesichtsdaten (< 468 landmarks)', () => {
      const hands = createHandData();
      const incompleteFace = [[0.5, 0.5, 0.05]]; // Only 1 landmark
      const result = prepareMultimodalForMLP(hands, undefined, incompleteFace);

      // Face section should be all zeros
      const faceFeatures = result.slice(FACE_SECTION_START, FACE_SECTION_END);
      expect(Array.from(faceFeatures).every(v => v === 0)).toBe(true);
    });

    it('skaliert Pose relativ zur Schulterbreite', () => {
      const hands = createHandData();
      const pose = createPoseData();
      
      // First normalization
      const result1 = prepareMultimodalForMLP(hands, pose);
      
      // Scale up pose by 2x
      const scaledPose = pose.map(p => [(p[0] ?? 0) * 2, (p[1] ?? 0) * 2, (p[2] ?? 0) * 2, p[3] ?? 0]) as number[][];
      const result2 = prepareMultimodalForMLP(hands, scaledPose);
      
      // Pose features should be similar after normalization (within tolerance)
      const poseFeatures1 = result1.slice(POSE_SECTION_START, POSE_SECTION_END);
      const poseFeatures2 = result2.slice(POSE_SECTION_START, POSE_SECTION_END);
      
      // At least some features should be normalized to similar values
      let similarCount = 0;
      for (let i = 0; i < poseFeatures1.length; i++) {
        const val1 = poseFeatures1[i];
        const val2 = poseFeatures2[i];
        if (val1 !== undefined && val2 !== undefined && Math.abs(val1 - val2) < 0.5) {
          similarCount++;
        }
      }
      // Expect most features to be similarly normalized
      expect(similarCount).toBeGreaterThan(50);
    });

    it('skaliert Gesicht relativ zur Augendistanz', () => {
      const hands = createHandData();
      const face = createFaceData();
      
      const result1 = prepareMultimodalForMLP(hands, undefined, face);
      
      // Scale face by 2x
      const scaledFace = face.map(p => [(p[0] ?? 0) * 2, (p[1] ?? 0) * 2, (p[2] ?? 0) * 2]) as number[][];
      const result2 = prepareMultimodalForMLP(hands, undefined, scaledFace);
      
      // Face features should be similar after normalization
      const faceFeatures1 = result1.slice(FACE_SECTION_START, FACE_SECTION_END);
      const faceFeatures2 = result2.slice(FACE_SECTION_START, FACE_SECTION_END);
      
      // Most features should be normalized to similar values
      let similarCount = 0;
      for (let i = 0; i < faceFeatures1.length; i++) {
        const val1 = faceFeatures1[i];
        const val2 = faceFeatures2[i];
        if (val1 !== undefined && val2 !== undefined && Math.abs(val1 - val2) < 0.5) {
          similarCount++;
        }
      }
      expect(similarCount).toBeGreaterThan(20);
    });

    it('zentriert Pose auf Torso-Zentrum', () => {
      const hands = createHandData();
      const pose = createPoseData();
      
      const result = prepareMultimodalForMLP(hands, pose);
      const poseFeatures = result.slice(POSE_SECTION_START, POSE_SECTION_END);
      
      // After torso-centering, some coordinates should be negative, some positive
      const hasPositive = Array.from(poseFeatures).some(v => v > 0);
      const hasNegative = Array.from(poseFeatures).some(v => v < 0);
      expect(hasPositive).toBe(true);
      expect(hasNegative).toBe(true);
    });

    it('zentriert Gesicht auf Nasenspitze', () => {
      const hands = createHandData();
      const face = createFaceData();
      
      const result = prepareMultimodalForMLP(hands, undefined, face);
      const faceFeatures = result.slice(FACE_SECTION_START, FACE_SECTION_END);
      
      // After nose-tip centering, should have positive and negative values
      const hasPositive = Array.from(faceFeatures).some(v => v > 0);
      const hasNegative = Array.from(faceFeatures).some(v => v < 0);
      expect(hasPositive).toBe(true);
      expect(hasNegative).toBe(true);
    });
  });
});
