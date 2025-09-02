import path from 'path';
import { DATA_DIR } from '../constants/modelPaths';
import { promises as fs } from 'fs';

type Point = [number, number, number];

interface Sample {
  id: string;
  label: string;
  profileId?: string;
  landmarks: Point[];
  ts: number;
}

interface DatasetFile {
  samples: Sample[];
}

function normalize(lm: Point[]): Point[] {
  if (!lm || lm.length < 21) return lm;
  const [wx, wy, wz] = lm[0];
  const pts = lm.map(([x, y, z]) => [x - wx, y - wy, (z ?? 0) - (wz ?? 0)] as Point);
  let maxd = 0;
  for (const [x, y, z] of pts) {
    maxd = Math.max(maxd, Math.abs(x) + Math.abs(y) + Math.abs(z));
  }
  const s = maxd || 1;
  return pts.map(([x, y, z]) => [x / s, y / s, z / s] as Point);
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
    if (!Array.isArray(s.landmarks) || s.landmarks.length < 21) continue;
    push(s.label, normalize(s.landmarks as any));
  }
  // If no profile-specific samples, allow global ones
  if (hasProfile && Object.keys(byLabel).length === 0) {
    for (const s of data.samples) {
      if (s.profileId) continue;
      if (!Array.isArray(s.landmarks) || s.landmarks.length < 21) continue;
      push(s.label, normalize(s.landmarks as any));
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

