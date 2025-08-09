import { retrainOfflineModel } from '../../server/src/tools/retrainOfflineModel';
import { createDatabase, addGestureTrainingData, saveDatabase } from '../../server/src/db';
import { tmpdir } from 'os';
import { promises as fs } from 'fs';
import path from 'path';

describe('Retrain Offline Model', () => {
  it('should retrain the offline model and generate the output file', async () => {
    const db = createDatabase();
    addGestureTrainingData(db, {
      id: '1',
      gestureDefinitionId: 'g1',
      landmarkData: [0, 0],
      source: 'HIP_2',
      syncStatus: 'pending',
    });

    const dbFile = path.join(tmpdir(), 'retrain-db.json');
    await saveDatabase(db, dbFile);
    const outFile = path.join(tmpdir(), 'offline.json');
    const metricsFile = path.join(tmpdir(), 'metrics.json');

    await retrainOfflineModel(dbFile, outFile, metricsFile, '123');
    const out = JSON.parse(await fs.readFile(outFile, 'utf8'));
    expect(out.version).toBeDefined();
    expect(out.seed).toBe('123');
    expect(out.model.g1).toBeDefined();
    const metrics = JSON.parse(await fs.readFile(metricsFile, 'utf8'));
    expect(metrics.version).toBe(out.version);
    expect(metrics.seed).toBe('123');
  });
});
