import {
  createDatabase,
  addSymbol,
  updateSymbol,
  removeSymbol,
  saveDatabase,
  loadDatabase,
  getSymbolById,
} from '../src/db';
import { SymbolRecord } from '../src/types';
import { tmpdir } from 'os';
import path from 'path';

(async () => {
  const db = createDatabase();

  if (!Array.isArray(db.symbols)) {
    throw new Error('Symbols table not initialized');
  }

  const sample: SymbolRecord = {
    id: '1',
    name: 'drink',
    emoji: '🥤',
    color: '#ffcc00',
    audioUri: 'drink.mp3',
    healthScore: 1,
  };

  addSymbol(db, sample);

  if (db.symbols.length !== 1) {
    throw new Error('Add symbol failed');
  }

  let fetched = getSymbolById(db, '1');
  if (!fetched || fetched.name !== 'drink') {
    throw new Error('getSymbolById failed');
  }

  const updated: SymbolRecord = { ...sample, name: 'juice' };
  updateSymbol(db, updated);

  fetched = getSymbolById(db, '1');
  if (!fetched || fetched.name !== 'juice') {
    throw new Error('updateSymbol failed');
  }

  const file = path.join(tmpdir(), 'amys-echo-test-db.json');
  await saveDatabase(db, file);
  const loaded = await loadDatabase(file);

  let persisted = getSymbolById(loaded, '1');
  if (!persisted || persisted.name !== 'juice') {
    throw new Error('Persistence failed');
  }

  removeSymbol(loaded, '1');
  if (loaded.symbols.length !== 0) {
    throw new Error('removeSymbol failed');
  }

  console.log('Database initialized with', Object.keys(db));
})();
