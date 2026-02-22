import { describe, expect, it } from 'vitest';
import type { SymbolDefinition } from '../context/SymbolStore';
import { dedupeSymbolsByName, normalizeSymbolName } from './symbolDedup';

describe('symbolDedup', () => {
  it('normalizes symbol names with german locale', () => {
    expect(normalizeSymbolName('  ESSEN  ')).toBe('essen');
  });

  it('deduplicates by normalized name and prefers profile symbols', () => {
    const symbols: SymbolDefinition[] = [
      { id: 'global-essen', name: 'Essen', category: 'food' },
      { id: 'profile-essen', name: ' essen ', category: 'food', profileId: 'amy' },
      { id: 'wasser', name: 'Wasser', category: 'drink' },
    ];

    const result = dedupeSymbolsByName(symbols);

    expect(result).toHaveLength(2);
    expect(result.find((symbol) => symbol.name === 'essen')?.id).toBe('profile-essen');
    expect(result.find((symbol) => symbol.name === 'Wasser')?.id).toBe('wasser');
  });
});
