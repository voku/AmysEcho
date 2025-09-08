import path from 'path';
import { DATA_DIR } from '../constants/modelPaths.js';
import { promises as fs } from 'fs';
type Point = [number, number, number];
const HAND_SIZE = 21;

// Define possible landmark formats
type LandmarkPoint = Point | number[];
type LandmarkData = LandmarkPoint[] | number[];

// Type guard to check if a value is a valid Point
function isValidPoint(point: unknown): point is Point {
  return Array.isArray(point) &&
         point.length === 3 &&
         point.every(coord => typeof coord === 'number' && !isNaN(coord));
}

// Type guard to check if landmarks are in the correct format
function isValidLandmarks(landmarks: unknown): landmarks is Point[] {
  return Array.isArray(landmarks) &&
         landmarks.length >= HAND_SIZE &&
         landmarks.every(isValidPoint);
}

interface Sample {
  id: string;
  label: string;
  profileId?: string;
  landmarks: LandmarkData;
  ts: number;
}

interface DatasetFile {
  samples: Sample[];
}

// NOTE: keep this normalize function in sync with
// app/src/services/offlineClassifier.ts
export function normalize(lm: LandmarkData | null | undefined): Point[] {
  if (!lm) {
    return Array(HAND_SIZE * 2).fill([0, 0, 0]);
  }

  let pts: Point[] = [];

  // Handle different landmark formats
  if (Array.isArray(lm) && lm.length > 0) {
    if (isValidPoint(lm[0])) {
      // Already in Point[] format
      pts = (lm as Point[]).slice(0, HAND_SIZE * 2);
    } else if (Array.isArray(lm[0]) && typeof lm[0][0] === 'number') {
      // Flat array format, convert to Point[]
      const flatArray = lm as number[];
      for (let i = 0; i < flatArray.length; i += 3) {
        if (i + 2 < flatArray.length) {
          pts.push([flatArray[i], flatArray[i + 1], flatArray[i + 2]]);
        }
      }
      pts = pts.slice(0, HAND_SIZE * 2);
    }
  }

  // Ensure we have enough points
  while (pts.length < HAND_SIZE * 2) {
    pts.push([0, 0, 0]);
  }

  const normalizeHand = (start: number) => {
    if (start >= pts.length) return;

    const wrist = pts[start];
    if (!wrist || wrist.length !== 3) return;

    const [wx, wy, wz] = wrist;
    let maxd = 0;

    for (let i = 0; i < HAND_SIZE && start + i < pts.length; i++) {
      const idx = start + i;
      const point = pts[idx];
      if (!point || point.length !== 3) continue;

      const [x, y, z] = point;
      const nx = x - wx;
      const ny = y - wy;
      const nz = z - wz;
      pts[idx] = [nx, ny, nz];
      maxd = Math.max(maxd, Math.abs(nx) + Math.abs(ny) + Math.abs(nz));
    }

    const inv = 1 / (maxd || 1);
    for (let i = 0; i < HAND_SIZE && start + i < pts.length; i++) {
      const idx = start + i;
      const point = pts[idx];
      if (!point || point.length !== 3) continue;

      const [x, y, z] = point;
      pts[idx] = [x * inv, y * inv, z * inv];
    }
  };

  normalizeHand(0);
  normalizeHand(HAND_SIZE);

  return pts;
}

export async function getCentroids(profileId?: string): Promise<{ centroids: Record<string, Point[]>; counts: Record<string, number> }> {
  const dataPath = path.join(DATA_DIR, 'dgs_samples.json');
  let data: DatasetFile = { samples: [] };
  try {
    const raw = await fs.readFile(dataPath, 'utf8');
    data = JSON.parse(raw);
  } catch {}
  const byLabel: Record<string, Point[][]> = {};
  const counts: Record<string, number> = {};
  const push = (label: string, pts: Point[]) => {
    if (!byLabel[label]) byLabel[label] = [];
    byLabel[label].push(pts);
    counts[label] = (counts[label] || 0) + 1;
  };
  const hasProfile = !!profileId && data.samples.some((s) => s.profileId === profileId);
   for (const s of data.samples) {
     if (hasProfile) {
       if (s.profileId !== profileId) continue;
     }
     if (!isValidLandmarks(s.landmarks) && !Array.isArray(s.landmarks)) continue;
     push(s.label, normalize(s.landmarks));
   }
   // If no profile-specific samples, allow global ones
   if (hasProfile && Object.keys(byLabel).length === 0) {
     for (const s of data.samples) {
       if (s.profileId) continue;
       if (!isValidLandmarks(s.landmarks) && !Array.isArray(s.landmarks)) continue;
       push(s.label, normalize(s.landmarks));
     }
   }
  const centroids: Record<string, Point[]> = {};
  for (const [label, arrs] of Object.entries(byLabel)) {
    const n = arrs.length;
    if (n === 0) continue;
    const len = arrs[0].length;
    const acc: number[][] = Array.from({ length: len }, () => [0, 0, 0]);
    for (const a of arrs) {
      for (let i = 0; i < len; i++) {
        acc[i][0] += a[i][0];
        acc[i][1] += a[i][1];
        acc[i][2] += a[i][2];
      }
    }
    centroids[label] = acc.map(([x, y, z]) => [x / n, y / n, z / n] as Point);
  }
  return { centroids, counts };
}
