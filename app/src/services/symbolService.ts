import { database } from '../../db';
import { Symbol } from '../../db/models';
import type { Model } from '@nozbe/watermelondb';

export interface SymbolData {
  id: string;
  name: string;
  emoji: string;
  color: string;
  audioUri: string;
  dgsVideoUri: string;
  healthScore: number;
}

export async function loadSymbols(): Promise<SymbolData[]> {
  const symbols = await database.get<Symbol>('symbols').query().fetch();
  return symbols.map(symbol => ({
    id: symbol.id,
    name: symbol.name,
    emoji: symbol.emoji || '',
    color: symbol.color || '#000000',
    audioUri: symbol.audioUri || '',
    dgsVideoUri: symbol.dgsVideoAssetPath || '',
    healthScore: symbol.healthScore || 1
  }));
}

export async function getSymbolById(id: string): Promise<SymbolData | null> {
  try {
    const symbol = await database.get<Symbol>('symbols').find(id);
    return {
      id: symbol.id,
      name: symbol.name,
      emoji: symbol.emoji || '',
      color: symbol.color || '#000000',
      audioUri: symbol.audioUri || '',
      dgsVideoUri: symbol.dgsVideoAssetPath || '',
      healthScore: symbol.healthScore || 1
    };
  } catch {
    return null;
  }
}

export async function saveSymbols(symbols: SymbolData[]): Promise<void> {
  if (symbols.length === 0) {
    return;
  }

  const collection = database.get<Symbol>('symbols');
  const existingList = await collection.query().fetch();
  const existingMap = new Map(existingList.map(s => [s.id, s]));

  const actions: Model[] = [];
  for (const symbolData of symbols) {
    const existing = existingMap.get(symbolData.id);
    if (existing) {
      actions.push(
        existing.prepareUpdate(symbol => {
          symbol.name = symbolData.name;
          symbol.emoji = symbolData.emoji;
          symbol.color = symbolData.color;
          symbol.audioUri = symbolData.audioUri;
          symbol.dgsVideoAssetPath = symbolData.dgsVideoUri;
          symbol.healthScore = symbolData.healthScore;
        })
      );
    } else {
      actions.push(
        collection.prepareCreate(symbol => {
          // WatermelonDB does not expose an official API for setting a custom
          // ID during creation. We modify the internal `_raw` record as an
          // escape hatch. This relies on internal behavior and may break with
          // future library updates.
          type RawWithId = Omit<typeof symbol._raw, 'id'> & { id: string };
          (symbol._raw as RawWithId).id = symbolData.id;
          symbol.name = symbolData.name;
          symbol.emoji = symbolData.emoji;
          symbol.color = symbolData.color;
          symbol.audioUri = symbolData.audioUri;
          symbol.dgsVideoAssetPath = symbolData.dgsVideoUri;
          symbol.healthScore = symbolData.healthScore;
        })
      );
    }
  }

  if (actions.length > 0) {
    await database.batch(...actions);
  }
}