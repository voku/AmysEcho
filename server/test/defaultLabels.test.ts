import { setupDatabase } from '../src/db.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('default labels seeding', () => {
  let tmpDbPath: string;

  beforeEach(async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amy-db-test-'));
    tmpDbPath = path.join(tmpDir, 'db.json');
  });

  afterEach(async () => {
    try {
      await fs.rm(path.dirname(tmpDbPath), { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  });

  it('seeds default symbols correctly on initialization', async () => {
    const db = await setupDatabase(tmpDbPath);
    
    // Check if we have the expected number of symbols
    expect(db.symbols.length).toBe(12);

    const expectedLabels = [
      'Alle', 'Blau', 'Essen', 'Fertig', 'Gelb', 'Grün', 
      'Nochmal', 'Rot', 'Satt', 'Schwester', 'Spielen', 'Trinken'
    ];

    const actualLabels = db.symbols.map(s => s.name).sort();
    expect(actualLabels).toEqual([...expectedLabels].sort());

    // Check specific symbol details
    const alle = db.symbols.find(s => s.id === 'alle');
    expect(alle).toBeDefined();
    expect(alle?.emoji).toBe('👥');
    expect(alle?.category).toBe('person');
    expect(alle?.color).toBe('#94a3b8');

    const essen = db.symbols.find(s => s.id === 'essen');
    expect(essen).toBeDefined();
    expect(essen?.category).toBe('food');
    expect(essen?.emoji).toBe('🍽️');

    const spielen = db.symbols.find(s => s.id === 'spielen');
    expect(spielen).toBeDefined();
    expect(spielen?.category).toBe('action');
    expect(spielen?.emoji).toBe('🧸');
  });
});
