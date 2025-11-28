import { setupDatabase, loadDatabase } from '../../server/src/db';
import { tmpdir } from 'os';
import path from 'path';
import { promises as fs } from 'fs';

describe('Seed Database', () => {
  it('should seed the database and persist the data', async () => {
    const file = path.join(tmpdir(), 'seed-test.json');
    await fs.rm(file, { force: true });
    const db = await setupDatabase(file);
    expect(db.profiles.length).toBeGreaterThan(0);
    expect(db.symbols.length).toBeGreaterThan(0);
    expect(db.vocabularySets.length).toBeGreaterThan(0);
    expect(db.usageStats.length).toBeGreaterThan(0);

    const loaded = await loadDatabase(file);
    expect(loaded.profiles.length).toBeGreaterThan(0);
    expect(loaded.symbols.length).toBeGreaterThan(0);
    expect(loaded.vocabularySets.length).toBeGreaterThan(0);
    expect(loaded.usageStats.length).toBeGreaterThan(0);
  });
});