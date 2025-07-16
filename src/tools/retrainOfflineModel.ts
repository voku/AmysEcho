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

export async function retrainOfflineModel(dbPath: string, outPath: string): Promise<void> {
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

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(model, null, 2), 'utf8');
}

if (require.main === module) {
  const [dbPath, outPath] = process.argv.slice(2);
  if (!dbPath || !outPath) {
    console.error('Usage: node retrainOfflineModel.js <db.json> <output.json>');
    process.exit(1);
  }
  retrainOfflineModel(dbPath, outPath).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
