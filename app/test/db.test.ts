import {
  createDatabase,
  addSymbol,
  updateSymbol,
  removeSymbol,
  saveDatabase,
  loadDatabase,
  getSymbolById,
  persistProfile,
  logCorrection,
} from '../../server/src/db';
import { SymbolRecord, Profile } from '../../server/src/types';
import { tmpdir } from 'os';
import path from 'path';

describe('Database functions', () => {
  it('should perform all database operations correctly', async () => {
    const db = createDatabase();

    expect(Array.isArray(db.symbols)).toBe(true);
    expect(Array.isArray(db.vocabularySets)).toBe(true);
    expect(Array.isArray(db.usageStats)).toBe(true);

    const sample: SymbolRecord = {
      id: '1',
      name: 'drink',
      emoji: '🥤',
      color: '#ffcc00',
      audioUri: 'drink.mp3',
      healthScore: 1,
    };

    addSymbol(db, sample);
    expect(db.symbols.length).toBe(1);

    let fetched = getSymbolById(db, '1');
    expect(fetched).toBeDefined();
    expect(fetched?.name).toBe('drink');

    const updated: SymbolRecord = { ...sample, name: 'juice' };
    updateSymbol(db, updated);

    fetched = getSymbolById(db, '1');
    expect(fetched).toBeDefined();
    expect(fetched?.name).toBe('juice');

    const file = path.join(tmpdir(), 'amys-echo-test-db.json');
    await saveDatabase(db, file);
    const loaded = await loadDatabase(file);

    let persisted = getSymbolById(loaded, '1');
    expect(persisted).toBeDefined();
    expect(persisted?.name).toBe('juice');

    removeSymbol(loaded, '1');
    expect(loaded.symbols.length).toBe(0);

    const profile: Profile = {
      id: 'p1',
      name: 'test - p1',
      consentDataUpload: false,
      consentHelpMeGetSmarter: true,
      vocabularySetId: 'basic',
    };
    await persistProfile(loaded, profile, file);
    const reloaded = await loadDatabase(file);
    expect(reloaded.profiles[0]).toBeDefined();
    expect(reloaded.profiles[0].id).toBe('p1');
    expect(reloaded.profiles[0].vocabularySetId).toBe('basic');

    logCorrection(reloaded, 'guess1', 'correct1', { x: 1 });
    expect(reloaded.gestureTrainingData.length).toBe(1);
    expect(reloaded.interactionLogs.length).toBe(1);
  });
});