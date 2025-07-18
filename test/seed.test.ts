import { setupDatabase, loadDatabase } from '../src/db';
import { tmpdir } from 'os';
import path from 'path';
import { promises as fs } from 'fs';

(async () => {
  const file = path.join(tmpdir(), 'seed-test.json');
  await fs.rm(file, { force: true });
  const db = await setupDatabase(file);
  if (
    db.profiles.length === 0 ||
    db.symbols.length === 0 ||
    db.vocabularySets.length === 0 ||
    db.usageStats.length === 0
  ) {
    throw new Error('seeding failed');
  }
  const loaded = await loadDatabase(file);
  if (
    loaded.profiles.length === 0 ||
    loaded.symbols.length === 0 ||
    loaded.vocabularySets.length === 0 ||
    loaded.usageStats.length === 0
  ) {
    throw new Error('persist seeded data failed');
  }
  console.log('seed ok');
})();
