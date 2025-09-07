import { loadDatabase } from '../db';
import { promises as fs } from 'fs';
import path from 'path';

export interface OfflineModel {
  [gestureDefinitionId: string]: number[];
}

function computeCentroid(samples: number[][]): number[] {
  if (samples.length === 0) return [];
  const length = samples[0].length;
  const centroid = new Array<number>(length).fill(0);
  for (const sample of samples) {
    for (let i = 0; i < length; i++) {
      centroid[i] += sample[i];
    }
  }
  for (let i = 0; i < length; i++) {
    centroid[i] /= samples.length;
  }
  return centroid;
}

function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedRandom(seed: string): void {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  Math.random = mulberry32(h);
}

export async function retrainOfflineModel(
  dbPath: string,
  outPath: string,
  metricsPath?: string,
  seed = '42',
): Promise<void> {
  seedRandom(seed);
  const version = new Date().toISOString();
  const db = await loadDatabase(dbPath);
  const grouped: Record<string, number[][]> = {};

  for (const sample of db.gestureTrainingData) {
    if (!Array.isArray(sample.landmarkData)) continue;
    if (!grouped[sample.gestureDefinitionId]) {
      grouped[sample.gestureDefinitionId] = [];
    }
    grouped[sample.gestureDefinitionId].push(
      (sample.landmarkData as number[]).map(Number),
    );
  }

  const model: OfflineModel = {};
  for (const [id, samples] of Object.entries(grouped)) {
    model[id] = computeCentroid(samples);
  }

  const modelFile = { version, seed, model };
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(modelFile, null, 2), 'utf8');

  // Compute simple training-set metrics (top-1 and top-3 accuracy) using centroid distance
  const ids = Object.keys(grouped);
  const centroids = ids.map((id) => ({ id, v: model[id] || [] }));
  function scoreVector(vec: number[]): { id: string; score: number }[] {
    return centroids
      .map(({ id, v }) => ({ id, score: cosineSimilarity(vec, v) }))
      .sort((a, b) => b.score - a.score);
  }

  let correctTop1 = 0;
  let correctTop3 = 0;
  let total = 0;
  for (const id of ids) {
    for (const sample of grouped[id]) {
      const ranked = scoreVector(sample);
      total += 1;
      if (ranked[0] && ranked[0].id === id) correctTop1 += 1;
      if (ranked.slice(0, 3).some((r) => r.id === id)) correctTop3 += 1;
    }
  }

  const metrics = {
    version,
    seed,
    totalSamples: total,
    accuracyTop1: total ? Number((correctTop1 / total).toFixed(3)) : 0,
    accuracyTop3: total ? Number((correctTop3 / total).toFixed(3)) : 0,
    ids,
  };

  if (metricsPath) {
    await fs.mkdir(path.dirname(metricsPath), { recursive: true });
    await fs.writeFile(metricsPath, JSON.stringify(metrics, null, 2), 'utf8');
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return -Infinity;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

if (require.main === module) {
  const [dbPath, outPath, metricsPath, seed] = process.argv.slice(2);
  if (!dbPath || !outPath) {
    console.error(
      'Usage: node retrainOfflineModel.js <db.json> <output.json> [metrics.json] [seed]'
    );
    process.exit(1);
  }
  retrainOfflineModel(dbPath, outPath, metricsPath, seed).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
