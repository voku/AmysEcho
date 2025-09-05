import { database } from '../../db';
import { Symbol } from '../../db/models';

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
  await database.write(async () => {
    const collection = database.get<Symbol>('symbols');
    for (const symbolData of symbols) {
      let existing: Symbol | null = null;
      try {
        existing = await collection.find(symbolData.id);
      } catch (err: any) {
        const isNotFound =
          err?.name === 'NotFoundError' || /not\s*found/i.test(String(err?.message));
        if (!isNotFound) {
          throw err;
        }
      }

      if (existing) {
        await existing.update(symbol => {
          symbol.name = symbolData.name;
          symbol.emoji = symbolData.emoji;
          symbol.color = symbolData.color;
          symbol.audioUri = symbolData.audioUri;
          symbol.dgsVideoAssetPath = symbolData.dgsVideoUri;
          symbol.healthScore = symbolData.healthScore;
        });
      } else {
        await collection.create(symbol => {
          type RawWithId = Omit<typeof symbol._raw, 'id'> & { id: string };
          (symbol._raw as RawWithId).id = symbolData.id;
          symbol.name = symbolData.name;
          symbol.emoji = symbolData.emoji;
          symbol.color = symbolData.color;
          symbol.audioUri = symbolData.audioUri;
          symbol.dgsVideoAssetPath = symbolData.dgsVideoUri;
          symbol.healthScore = symbolData.healthScore;
        });
      }
    }
  });
}