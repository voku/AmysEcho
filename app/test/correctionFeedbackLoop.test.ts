import { tmpdir } from 'os';
import path from 'path';
import { createDatabase, logCorrection, saveDatabase } from '../../server/src/db';
import { retrainOfflineModel } from '../../server/src/tools/retrainOfflineModel';

describe('Correction feedback loop', () => {
  it('incorporates logged corrections into offline recognition', async () => {
    const db = createDatabase();
    const sample = [1, 2, 3];
    logCorrection(db, 'guess1', 'correct1', sample);

    const dbFile = path.join(tmpdir(), 'corr-db.json');
    await saveDatabase(db, dbFile);
    const modelFile = path.join(tmpdir(), 'corr-model.json');
    await retrainOfflineModel(dbFile, modelFile);

    process.env.OFFLINE_MODEL_PATH = modelFile;
    jest.resetModules();
    const { classifyGesture } = require('../../server/src/recognizer');
    const result = await classifyGesture(sample);
    expect(result.label).toBe('correct1');
    expect(result.processedBy).toBe('local');
  });
});
