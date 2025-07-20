import { retrainOfflineModel } from '../../server/src/tools/retrainOfflineModel';
import { createDatabase, addGestureTrainingData, saveDatabase } from '../../server/src/db';
import { tmpdir } from 'os';
import { promises as fs } from 'fs';
import path from 'path';

(async () => {
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

  await retrainOfflineModel(dbFile, outFile);
  const out = JSON.parse(await fs.readFile(outFile, 'utf8'));
  if (!out.g1) {
    throw new Error('offline model not generated');
  }
  console.log('retrain ok');
})();
